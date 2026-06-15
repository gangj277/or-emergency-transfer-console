import { getSeoulCapacity } from "./capacity-cache";
import { loadHospitalData } from "./data";
import type { HospitalCapacity } from "./types";

/**
 * Load hospital data backed by request-time NEMC capacity, routed through the
 * per-district TTL/stale-while-revalidate cache (lib/or/capacity-cache.ts).
 *
 * Shared by the recommendations and hospitals routes so the "build districts ->
 * refresh -> join active rows -> reload data" flow lives in exactly one place.
 *
 * - forceRefresh=false (default): cached/SWR — fast, self-refreshing.
 * - forceRefresh=true: bypass cache, fetch every district live (explicit
 *   "refresh now" action), which also warms the shared cache.
 */
export async function loadLiveCapacityData({ forceRefresh = false }: { forceRefresh?: boolean } = {}) {
  const serviceKey = process.env.NEMC_SERVICE_KEY;
  if (!serviceKey) throw new Error("NEMC_SERVICE_KEY is required for live capacity.");

  const baseData = loadHospitalData();
  const activeHospitalIds = new Set(baseData.hospitals.map((hospital) => hospital.hospital_id));
  const districts = [...new Set(baseData.hospitals.map((hospital) => hospital.district).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "ko"),
  );

  const refreshed = await getSeoulCapacity({ serviceKey, districts, activeHospitalIds, forceRefresh });
  const activeRows = refreshed.rows.filter((row): row is HospitalCapacity => row.active_in_hospital_master);

  return {
    data: loadHospitalData({
      capacitySnapshot: activeRows,
      candidatePolicy: "request_time_nemc_live_capacity",
    }),
    capacityRefresh: {
      enabled: true,
      mode: forceRefresh ? ("forced_live" as const) : ("cached_live_swr" as const),
      fetchedAt: refreshed.fetchedAt,
      dataAsOf: refreshed.oldestFetchedAt,
      districtsRequested: districts.length,
      liveRows: refreshed.rows.length,
      activeRows: activeRows.length,
      cache: refreshed.cache,
    },
  };
}
