/**
 * Fetch HIRA hospital profiles (총 의사수 + 진료과목별 전문의수) for the 51
 * live-capacity hospitals and write them into:
 *   - data/or/hospital_static_profile.json   (total_doctors, specialist_doctors, specialty_doctor_counts)
 *   - data/or/hospital_capability_active.json (department presence flags, for matched hospitals)
 *   - outputs/hira/latest/match-report.json   (audit: match counts, confidence, unmatched)
 *
 * Beds / ICU capacity are NOT exposed by these HIRA APIs and stay null.
 * Run: npm run or:fetch:hira
 */
import fs from "node:fs";
import path from "node:path";

import { loadHospitalData } from "../lib/or/data";
import {
  aggregateDepartments,
  fetchAllSeoulHospitals,
  fetchDepartments,
  matchHospital,
  type HiraBasisRecord,
} from "../lib/or/hira";
import type { Department, HospitalCapability, HospitalStaticProfile } from "../lib/or/types";

function loadServiceKey(): string {
  if (process.env.NEMC_SERVICE_KEY) return process.env.NEMC_SERVICE_KEY;
  // tsx scripts don't auto-load .env.local (only the Next runtime does), so parse it.
  const envPath = path.resolve(".env.local");
  if (fs.existsSync(envPath)) {
    const line = fs
      .readFileSync(envPath, "utf8")
      .split("\n")
      .find((l) => l.startsWith("NEMC_SERVICE_KEY="));
    if (line) return line.slice("NEMC_SERVICE_KEY=".length).trim().replace(/^["']|["']$/g, "");
  }
  throw new Error("NEMC_SERVICE_KEY not found in env or .env.local");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DATA_DIR = path.resolve("data/or");
const collectedAt = new Date().toISOString();

async function main() {
  const serviceKey = loadServiceKey();
  const data = loadHospitalData();
  const candidates = data.primaryCandidates; // 51 live-capacity hospitals

  console.log(`Fetching all Seoul hospitals from HIRA…`);
  const hiraRecords = await fetchAllSeoulHospitals({ serviceKey });
  console.log(`HIRA Seoul records: ${hiraRecords.length}`);

  // existing files (preserve all 74 rows; update only matched)
  const profilePath = path.join(DATA_DIR, "hospital_static_profile.json");
  const capabilityPath = path.join(DATA_DIR, "hospital_capability_active.json");
  const profiles = JSON.parse(fs.readFileSync(profilePath, "utf8")) as HospitalStaticProfile[];
  const capabilities = JSON.parse(fs.readFileSync(capabilityPath, "utf8")) as HospitalCapability[];
  const profileById = new Map(profiles.map((p) => [p.hospital_id, p]));
  const capabilityById = new Map(capabilities.map((c) => [c.hospital_id, c]));

  const report = {
    generatedAt: collectedAt,
    seoulHiraRecords: hiraRecords.length,
    candidateCount: candidates.length,
    matched: { high: 0, medium: 0 },
    unmatched: [] as string[],
    rows: [] as Array<Record<string, unknown>>,
  };

  for (const candidate of candidates) {
    const h = candidate.hospital;
    const match = matchHospital({ name: h.hospital_name, lat: h.lat, lon: h.lon }, hiraRecords);

    if (match.confidence === "none" || !match.record) {
      report.unmatched.push(h.hospital_name);
      report.rows.push({
        hospital_id: h.hospital_id,
        name: h.hospital_name,
        confidence: "none",
        distanceKm: match.distanceKm,
        nameSim: Number(match.nameSim.toFixed(2)),
      });
      continue;
    }

    report.matched[match.confidence] += 1;
    const rec = match.record as HiraBasisRecord;

    // 진료과목별 전문의수
    await sleep(60);
    let present = new Set<Department>();
    let specialistCounts: Partial<Record<Department, number>> = {};
    try {
      const deptRows = await fetchDepartments({ serviceKey, ykiho: rec.ykiho });
      ({ present, specialistCounts } = aggregateDepartments(deptRows));
    } catch (err) {
      console.warn(`  dept fetch failed for ${h.hospital_name}: ${(err as Error).message}`);
    }

    // ── update static profile ──
    const profile = profileById.get(h.hospital_id);
    if (profile) {
      profile.total_doctors = rec.drTotCnt;
      profile.specialist_doctors = rec.mdeptSdrCnt;
      profile.specialty_doctor_counts = specialistCounts;
      profile.match_confidence = match.confidence;
      profile.source = "hira_15001698_getHospBasisList+15001699_getDgsbjtInfo2.7";
      profile.collected_at = collectedAt;
      profile.notes = `Matched HIRA "${rec.yadmNm}" at ${match.distanceKm?.toFixed(2)}km (nameSim ${match.nameSim.toFixed(2)}). Beds/ICU unavailable from HIRA APIs (null).`;
    }

    // ── update capability flags from HIRA truth (matched only) ──
    const cap = capabilityById.get(h.hospital_id);
    if (cap) {
      cap.has_emergency_medicine_department = present.has("emergency_medicine");
      cap.has_neurosurgery_department = present.has("neurosurgery");
      cap.has_orthopedics_department = present.has("orthopedics");
      cap.has_general_surgery_department = present.has("general_surgery");
      // trauma_surgery is unreliable in HIRA (most do trauma via general surgery); never downgrade.
      cap.has_trauma_surgery_department = cap.has_trauma_surgery_department || present.has("trauma_surgery");
      cap.capability_confidence = "high";
      cap.capability_source = "hira_15001699_getDgsbjtInfo2.7";
      cap.capability_notes = `Department flags from HIRA 진료과목 of "${rec.yadmNm}". trauma_surgery retains prior proxy if HIRA omits 외상외과.`;
    }

    report.rows.push({
      hospital_id: h.hospital_id,
      name: h.hospital_name,
      hira: rec.yadmNm,
      confidence: match.confidence,
      distanceKm: match.distanceKm ? Number(match.distanceKm.toFixed(2)) : null,
      nameSim: Number(match.nameSim.toFixed(2)),
      total_doctors: rec.drTotCnt,
      specialist_doctors: rec.mdeptSdrCnt,
      departments: [...present],
      specialistCounts,
    });
  }

  // write back (preserve all rows; 2-space + trailing newline per repo convention)
  fs.writeFileSync(profilePath, `${JSON.stringify(profiles, null, 2)}\n`);
  fs.writeFileSync(capabilityPath, `${JSON.stringify(capabilities, null, 2)}\n`);

  const outDir = path.resolve("outputs/hira/latest");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "match-report.json"), `${JSON.stringify(report, null, 2)}\n`);

  console.log(
    JSON.stringify(
      {
        matched: report.matched,
        unmatchedCount: report.unmatched.length,
        unmatched: report.unmatched,
        wrote: [profilePath, capabilityPath, path.join(outDir, "match-report.json")],
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
