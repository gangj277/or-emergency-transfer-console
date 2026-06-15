import { buildCapacityRows, fetchCapacityDistrict, NEMC_DISTRICT_CONCURRENCY } from "./nemc-capacity";
import { mapWithConcurrency } from "./concurrency";
import type { HospitalCapacity } from "./types";

/**
 * Request-time NEMC capacity with a per-district TTL cache.
 *
 * Why this exists: ranking a single incident needs live ER-bed capacity for
 * Seoul's hospitals, which span all 25 districts. Fetching every district live
 * on every ranking (serially) was the dominant latency. This layer keeps the
 * data "live where it matters" while staying fast:
 *
 *   - fresh  (age <= FRESH_TTL)      -> serve from cache, no network
 *   - stale  (FRESH_TTL < age <= HARD_TTL) -> serve cache NOW, revalidate in the
 *                                      background (stale-while-revalidate)
 *   - cold   (age > HARD_TTL / missing) -> block on a bounded-parallel live fetch
 *
 * On top of that: single-flight de-dups concurrent refreshes of the same
 * district, and a failed live fetch falls back to the last good cache
 * (stale-if-error) instead of failing the whole ranking.
 *
 * The cache is module-level in-memory state. Next.js Route Handlers run in a
 * long-lived Node process (`runtime = "nodejs"`, `dynamic = "force-dynamic"`,
 * POST is never cached by the framework), so the map persists across requests
 * within a server process — exactly the lifetime we want for a demo session.
 */

const envMs = (name: string, fallback: number) => {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export const CAPACITY_FRESH_TTL_MS = envMs("NEMC_CAPACITY_FRESH_TTL_MS", 60_000); // 1 min
export const CAPACITY_HARD_TTL_MS = envMs("NEMC_CAPACITY_HARD_TTL_MS", 15 * 60_000); // 15 min

export type CapacityServedMode =
  | "fresh_cache" // within fresh TTL — served from cache, no network
  | "live" // freshly fetched this request
  | "revalidating_cache" // stale-but-ok — served from cache, refreshed in background
  | "stale_if_error"; // live fetch failed — fell back to last good cache

type DistrictEntry = {
  district: string;
  rows: HospitalCapacity[];
  fetchedAtMs: number;
  fetchedAtIso: string;
  resultCode: string;
};

const districtCache = new Map<string, DistrictEntry>();
// single-flight: at most one in-flight live fetch per district at a time
const inflight = new Map<string, Promise<DistrictEntry>>();

type FetchImpl = typeof fetch;

async function fetchDistrictFresh(
  serviceKey: string,
  district: string,
  activeHospitalIds: Set<string>,
  nowMs: () => number,
  fetchImpl?: FetchImpl,
): Promise<DistrictEntry> {
  const { parsed } = await fetchCapacityDistrict({ serviceKey, district, fetchImpl });
  if (parsed.resultCode !== "00") {
    throw new Error(`NEMC returned ${parsed.resultCode} for ${district}: ${parsed.resultMsg}`);
  }
  const fetchedAtMs = nowMs();
  const fetchedAtIso = new Date(fetchedAtMs).toISOString();
  const rows = buildCapacityRows(parsed.items, { requestedDistrict: district, fetchedAt: fetchedAtIso, activeHospitalIds });
  return { district, rows, fetchedAtMs, fetchedAtIso, resultCode: parsed.resultCode };
}

function refreshDistrict(
  serviceKey: string,
  district: string,
  activeHospitalIds: Set<string>,
  nowMs: () => number,
  fetchImpl?: FetchImpl,
): Promise<DistrictEntry> {
  const existing = inflight.get(district);
  if (existing) return existing;

  const pending = fetchDistrictFresh(serviceKey, district, activeHospitalIds, nowMs, fetchImpl)
    .then((entry) => {
      districtCache.set(district, entry);
      return entry;
    })
    .finally(() => {
      inflight.delete(district);
    });

  inflight.set(district, pending);
  return pending;
}

export type GetSeoulCapacityOptions = {
  serviceKey: string;
  districts: string[];
  activeHospitalIds: Set<string>;
  /** Within this age a district is served from cache with no network. */
  freshTtlMs?: number;
  /** Up to this age a district is served stale + revalidated in the background. */
  hardTtlMs?: number;
  /** Max concurrent live district fetches. */
  concurrency?: number;
  /** Bypass the cache entirely and fetch every district live (explicit refresh). */
  forceRefresh?: boolean;
  /** Injectable clock (tests). */
  nowMs?: () => number;
  /** Injectable fetch (tests). */
  fetchImpl?: FetchImpl;
};

export async function getSeoulCapacity({
  serviceKey,
  districts,
  activeHospitalIds,
  freshTtlMs = CAPACITY_FRESH_TTL_MS,
  hardTtlMs = CAPACITY_HARD_TTL_MS,
  concurrency = NEMC_DISTRICT_CONCURRENCY,
  forceRefresh = false,
  nowMs = () => Date.now(),
  fetchImpl,
}: GetSeoulCapacityOptions) {
  const startedMs = nowMs();
  const served = new Map<string, CapacityServedMode>();
  const mustFetch: string[] = []; // block on live fetch
  const revalidate: string[] = []; // serve cache now, refresh in background

  for (const district of districts) {
    const entry = districtCache.get(district);
    const age = entry ? startedMs - entry.fetchedAtMs : Number.POSITIVE_INFINITY;
    if (forceRefresh || !entry || age > hardTtlMs) {
      mustFetch.push(district);
    } else if (age <= freshTtlMs) {
      served.set(district, "fresh_cache");
    } else {
      served.set(district, "revalidating_cache");
      revalidate.push(district);
    }
  }

  // 1) Block on the cold/forced districts, fetched in a bounded-parallel pool.
  await mapWithConcurrency(mustFetch, concurrency, async (district) => {
    try {
      await refreshDistrict(serviceKey, district, activeHospitalIds, nowMs, fetchImpl);
      served.set(district, "live");
    } catch (error) {
      // stale-if-error: keep serving the last good cache rather than failing the
      // whole ranking because one district hiccuped. Only surface if we have
      // nothing cached for that district at all.
      if (districtCache.has(district)) {
        served.set(district, "stale_if_error");
        return;
      }
      throw error;
    }
  });

  // 2) Fire-and-forget background revalidation for stale-but-served districts.
  for (const district of revalidate) {
    void refreshDistrict(serviceKey, district, activeHospitalIds, nowMs, fetchImpl).catch(() => {
      /* keep serving stale; next request will retry */
    });
  }

  // 3) Assemble the response from the (now warmed) cache, in district order.
  const rows: HospitalCapacity[] = [];
  const fetchLog: Array<{
    requested_stage1: string;
    requested_district: string;
    fetched_at: string;
    served: CapacityServedMode;
    result_code: string;
    returned_items: number;
    age_ms: number;
  }> = [];
  let oldestFetchedAtMs = Number.POSITIVE_INFINITY;

  for (const district of districts) {
    const entry = districtCache.get(district);
    if (!entry) continue;
    rows.push(...entry.rows);
    oldestFetchedAtMs = Math.min(oldestFetchedAtMs, entry.fetchedAtMs);
    fetchLog.push({
      requested_stage1: "서울특별시",
      requested_district: district,
      fetched_at: entry.fetchedAtIso,
      served: served.get(district) ?? "fresh_cache",
      result_code: entry.resultCode,
      returned_items: entry.rows.length,
      age_ms: startedMs - entry.fetchedAtMs,
    });
  }

  const uniqueRows = [...new Map(rows.map((row) => [row.hospital_id, row])).values()].sort((a, b) =>
    a.duty_name_live.localeCompare(b.duty_name_live, "ko"),
  );

  const tally = (mode: CapacityServedMode) => [...served.values()].filter((value) => value === mode).length;

  return {
    fetchedAt: new Date(startedMs).toISOString(),
    oldestFetchedAt: Number.isFinite(oldestFetchedAtMs) ? new Date(oldestFetchedAtMs).toISOString() : null,
    rows: uniqueRows,
    fetchLog,
    cache: {
      districtsTotal: districts.length,
      servedFreshCache: tally("fresh_cache"),
      servedLive: tally("live"),
      servedRevalidating: tally("revalidating_cache"),
      servedStaleIfError: tally("stale_if_error"),
    },
  };
}

/** Test-only: clear all cached state. */
export function _resetCapacityCacheForTests() {
  districtCache.clear();
  inflight.clear();
}
