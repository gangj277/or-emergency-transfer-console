import fs from "node:fs";
import { loadHospitalData } from "../lib/or/data";
import { rankHospitals } from "../lib/or/recommendation";
import { buildTravelTimes } from "../lib/or/travel-matrix";
import type { OrParameters } from "../lib/or/types";

const raw = JSON.parse(fs.readFileSync("outputs/gold-e2e/latest/results/raw-results.json", "utf8"));
const cases = raw.cases.filter((c: any) => c.stage2_parameters && c.synthetic_location);

const data: any = loadHospitalData();
const candidates = data.primaryCandidates ?? data.candidates ?? data.activeCandidates;
console.log("model:", "normalized_utility_v3 (current code)");
console.log("candidates:", candidates.length, "| cases:", cases.length);

let changedVsFeasible = 0;
let changedVsGeo = 0;
let geoNearestInfeasible = 0;
const reasons = { fartherForBeds: 0, fartherForCapability: 0, fartherOther: 0 };
const examples: string[] = [];

for (const c of cases) {
  const params = c.stage2_parameters as OrParameters;
  const loc = { lat: c.synthetic_location.lat, lon: c.synthetic_location.lon };
  const ranking = rankHospitals({
    candidates,
    incidentLocation: loc,
    orParameters: params,
    limit: candidates.length,
    travelTimes: buildTravelTimes(loc, candidates),
  });
  const items = ranking.rankings;
  const orTop1 = items.find((i) => i.feasible) ?? items[0];
  const feasible = items.filter((i) => i.feasible);
  const nearestFeasible = [...feasible].sort((a, b) => a.distanceKm - b.distanceKm)[0];
  const geoNearest = [...items].sort((a, b) => a.distanceKm - b.distanceKm)[0]; // closest of ALL, ignoring feasibility

  if (!orTop1 || !nearestFeasible || !geoNearest) continue;

  const id = (x: any) => x.hospital.hospital.hospital_id;
  const chF = id(orTop1) !== id(nearestFeasible);
  const chG = id(orTop1) !== id(geoNearest);
  if (chF) changedVsFeasible++;
  if (chG) changedVsGeo++;
  if (!geoNearest.feasible) geoNearestInfeasible++;

  if (chF) {
    // why did OR pick a farther feasible hospital than the nearest feasible one?
    const orBeds = orTop1.availableErBeds ?? 0;
    const nfBeds = nearestFeasible.availableErBeds ?? 0;
    const orCap = orTop1.utilities?.capability ?? 0;
    const nfCap = nearestFeasible.utilities?.capability ?? 0;
    if (orBeds > nfBeds + 1) reasons.fartherForBeds++;
    else if (orCap > nfCap + 0.02) reasons.fartherForCapability++;
    else reasons.fartherOther++;
    if (examples.length < 6) {
      examples.push(
        `${c.case_id} [${params.incident_type}] OR→${orTop1.hospital.hospital.hospital_name}(${orTop1.estimatedTravelTimeMin}분, 병상 ${orBeds}) vs 최근접feasible→${nearestFeasible.hospital.hospital.hospital_name}(${nearestFeasible.estimatedTravelTimeMin}분, 병상 ${nfBeds})`,
      );
    }
  }
}

const n = cases.length;
const pct = (x: number) => `${x}/${n} (${Math.round((x / n) * 1000) / 10}%)`;
console.log("\n=== CURRENT v3 SOLVER, replayed on 100 gold cases ===");
console.log("OR top-1 ≠ nearest FEASIBLE hospital :", pct(changedVsFeasible), "  <- this is the deck's '40/100' metric, recomputed on v3");
console.log("OR top-1 ≠ geographic nearest (any)  :", pct(changedVsGeo), "  <- vs naive 'just go closest' baseline");
console.log("geographic-nearest was INFEASIBLE   :", pct(geoNearestInfeasible), "  <- cases where the closest hospital can't take the patient");
console.log("\nAmong the", changedVsFeasible, "changed-vs-nearest-feasible — why OR went farther:");
console.log("  more available beds (capacity) :", reasons.fartherForBeds);
console.log("  better capability/specialists  :", reasons.fartherForCapability);
console.log("  other (time/util tradeoff)     :", reasons.fartherOther);
console.log("\nexamples:");
examples.forEach((e) => console.log("  -", e));
