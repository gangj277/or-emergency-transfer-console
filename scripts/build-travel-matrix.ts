/**
 * Build the precomputed Kakao road-time matrix used by the recommendation hot-path.
 *
 *   origin nodes (≈2.5km Seoul grid ∪ known fixed origins) × 51 live-capacity hospitals
 *   → Kakao car directions → ×AMBULANCE_SPEED_FACTOR → data/or/travel_time_matrix.json
 *
 * Matrix-only design: this is the ONLY place Kakao is called. The request path just
 * reads the JSON. Re-run periodically to refresh traffic. Quota: 10,000 calls/day —
 * a hard guard aborts (before any call) if the node set would exceed ~9,500 calls.
 *
 * Run: npm run or:build:travel   (needs KAKAO_REST_API_KEY in env or .env.local)
 */
import fs from "node:fs";
import path from "node:path";

import { AMBULANCE_SPEED_FACTOR } from "../lib/or/cost-config";
import { loadHospitalData } from "../lib/or/data";
import { fetchDirections } from "../lib/or/kakao";
import type { LocationPoint } from "../lib/or/types";

// ── config (env-overridable) ──────────────────────────────────────────────────
const GRID_KM = Number(process.env.GRID_KM ?? 2.5);
const CLIP_KM = Number(process.env.CLIP_KM ?? 3.0); // keep grid nodes within this of a hospital
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 5);
const MAX_CALLS = 9500; // stay under the 10k/day Kakao quota
const SEOUL_BBOX = { minLat: 37.42, maxLat: 37.70, minLon: 126.76, maxLon: 127.18 };

// Known fixed origins seeded as exact nodes (so demo/gold/eval origins snap distance 0).
// Sources: gold anchors lib/or/gold-e2e.ts (25), eval scripts/evaluate-or-model.ts (8),
// UI presets lib/or-ui/samples.ts (4, ⊂ eval). Kept inline — this is a build artifact.
const SEED_ORIGINS: LocationPoint[] = [
  // 25 gold district anchors
  { lat: 37.5735, lon: 126.9788 }, { lat: 37.5636, lon: 126.9976 }, { lat: 37.5326, lon: 126.9904 },
  { lat: 37.5633, lon: 127.0369 }, { lat: 37.5385, lon: 127.0823 }, { lat: 37.5744, lon: 127.0396 },
  { lat: 37.6063, lon: 127.0925 }, { lat: 37.5894, lon: 127.0167 }, { lat: 37.6396, lon: 127.0257 },
  { lat: 37.6688, lon: 127.0471 }, { lat: 37.6543, lon: 127.0568 }, { lat: 37.6027, lon: 126.9291 },
  { lat: 37.5791, lon: 126.9368 }, { lat: 37.5663, lon: 126.9019 }, { lat: 37.5169, lon: 126.8664 },
  { lat: 37.5509, lon: 126.8495 }, { lat: 37.4955, lon: 126.8877 }, { lat: 37.4569, lon: 126.8955 },
  { lat: 37.5264, lon: 126.8963 }, { lat: 37.5124, lon: 126.9393 }, { lat: 37.4784, lon: 126.9516 },
  { lat: 37.4837, lon: 127.0324 }, { lat: 37.5172, lon: 127.0473 }, { lat: 37.5145, lon: 127.1059 },
  { lat: 37.5301, lon: 127.1238 },
  // eval points not already covered
  { lat: 37.5665, lon: 126.978 }, { lat: 37.4979, lon: 127.0276 }, { lat: 37.5572, lon: 126.9254 },
  { lat: 37.5133, lon: 127.1 }, { lat: 37.5219, lon: 126.9246 }, { lat: 37.4852, lon: 126.9016 },
];

function loadKakaoKey(): string {
  if (process.env.KAKAO_REST_API_KEY) return process.env.KAKAO_REST_API_KEY;
  const envPath = path.resolve(".env.local");
  if (fs.existsSync(envPath)) {
    const line = fs.readFileSync(envPath, "utf8").split("\n").find((l) => l.startsWith("KAKAO_REST_API_KEY="));
    if (line) return line.slice("KAKAO_REST_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
  }
  throw new Error("KAKAO_REST_API_KEY not found in env or .env.local");
}

function haversineKm(a: LocationPoint, b: LocationPoint) {
  const r = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
}

const key4 = (p: LocationPoint) => `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`;

function buildNodeSet(hospitals: LocationPoint[]): LocationPoint[] {
  const dLat = GRID_KM / 111;
  const dLon = GRID_KM / (111 * Math.cos((37.55 * Math.PI) / 180));
  const seen = new Map<string, LocationPoint>();
  // seeds always kept (exactness at known origins)
  for (const s of SEED_ORIGINS) seen.set(key4(s), s);
  // grid, clipped to within CLIP_KM of some hospital
  for (let lat = SEOUL_BBOX.minLat; lat <= SEOUL_BBOX.maxLat + 1e-9; lat += dLat) {
    for (let lon = SEOUL_BBOX.minLon; lon <= SEOUL_BBOX.maxLon + 1e-9; lon += dLon) {
      const p = { lat: Number(lat.toFixed(4)), lon: Number(lon.toFixed(4)) };
      if (seen.has(key4(p))) continue;
      const near = hospitals.some((h) => haversineKm(p, h) <= CLIP_KM);
      if (near) seen.set(key4(p), p);
    }
  }
  return [...seen.values()];
}

async function runPool<T, R>(items: T[], worker: (item: T, i: number) => Promise<R>, concurrency: number): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function lane() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, lane));
  return results;
}

async function main() {
  const serviceKey = loadKakaoKey();
  const data = loadHospitalData();
  const hospitals = data.primaryCandidates.map((c) => ({
    id: c.hospital.hospital_id,
    lat: c.hospital.lat,
    lon: c.hospital.lon,
  }));
  const hospitalPoints = hospitals.map((h) => ({ lat: h.lat, lon: h.lon }));

  const nodes = buildNodeSet(hospitalPoints);
  const totalCalls = nodes.length * hospitals.length;
  console.log(`nodes=${nodes.length} hospitals=${hospitals.length} → calls=${totalCalls} (gridKm=${GRID_KM}, clipKm=${CLIP_KM})`);
  if (totalCalls > MAX_CALLS) {
    throw new Error(`Would make ${totalCalls} calls > ${MAX_CALLS} quota guard. Increase GRID_KM (e.g. GRID_KM=3 npm run or:build:travel).`);
  }

  // pairs to fetch
  const pairs = nodes.flatMap((node, nodeIdx) => hospitals.map((h) => ({ nodeIdx, node, h })));
  let done = 0;
  let failures = 0;
  const startedAt = new Date().toISOString();

  const matrixNodes: Array<{ lat: number; lon: number; t: Record<string, { m: number; km: number }> }> = nodes.map((n) => ({
    lat: n.lat,
    lon: n.lon,
    t: {},
  }));

  await runPool(
    pairs,
    async ({ nodeIdx, node, h }) => {
      try {
        const dir = await fetchDirections(node, { lat: h.lat, lon: h.lon }, { serviceKey, timeoutMs: 6000 });
        matrixNodes[nodeIdx].t[h.id] = {
          m: Number((dir.durationMin * AMBULANCE_SPEED_FACTOR).toFixed(2)),
          km: Number(dir.routeDistanceKm.toFixed(2)),
        };
      } catch (err) {
        failures++;
        if (failures <= 10) console.warn(`  fail ${h.id} @ ${key4(node)}: ${(err as Error).message}`);
      } finally {
        done++;
        if (done % 500 === 0) console.log(`  ${done}/${pairs.length} (failures=${failures})`);
      }
    },
    CONCURRENCY,
  );

  const matrix = {
    generatedAt: startedAt,
    source: "kakao_directions_v1_ambulance_adjusted",
    ambulanceFactor: AMBULANCE_SPEED_FACTOR,
    gridKm: GRID_KM,
    hospitalCount: hospitals.length,
    nodes: matrixNodes,
  };

  const outPath = path.resolve("data/or/travel_time_matrix.json");
  fs.writeFileSync(outPath, `${JSON.stringify(matrix)}\n`);

  // build report + spot-checks
  const allMinutes = matrixNodes.flatMap((n) => Object.values(n.t).map((e) => e.m)).sort((a, b) => a - b);
  const pct = (p: number) => (allMinutes.length ? allMinutes[Math.min(allMinutes.length - 1, Math.round((allMinutes.length - 1) * p))] : null);
  const report = {
    generatedAt: startedAt,
    finishedAt: new Date().toISOString(),
    nodes: nodes.length,
    hospitals: hospitals.length,
    pairs: pairs.length,
    failures,
    ambulanceFactor: AMBULANCE_SPEED_FACTOR,
    gridKm: GRID_KM,
    minutes: { min: allMinutes[0] ?? null, p50: pct(0.5), p90: pct(0.9), max: allMinutes.at(-1) ?? null },
  };
  const reportDir = path.resolve("outputs/travel-matrix/latest");
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, "build-report.json"), `${JSON.stringify(report, null, 2)}\n`);

  console.log(JSON.stringify({ wrote: outPath, report }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
