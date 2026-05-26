import assert from "node:assert/strict";
import test from "node:test";

import { loadHospitalData } from "../lib/or/data";
import {
  buildCapacityRows,
  buildCapacityUrl,
  parseCapacityXml,
} from "../lib/or/nemc-capacity";
import { rankHospitals } from "../lib/or/recommendation";
import type { Department, HospitalCandidate, HospitalLevel, OrParameters } from "../lib/or/types";

test("loadHospitalData exposes static active candidates and live-capacity primary candidates", () => {
  const data = loadHospitalData();

  assert.equal(data.summary.activeHospitalCount, 74);
  assert.equal(data.summary.liveCapacityHospitalCount, 51);
  assert.equal(data.summary.activeWithoutLiveCapacityCount, 23);
  assert.equal(data.summary.staticProfileCount, 74);
  assert.equal(data.primaryCandidates.length, 51);
  assert.ok(data.primaryCandidates.every((candidate) => candidate.capacity && candidate.staticProfile));
});

test("rankHospitals uses normalized_utility_v3: desirability∈[0,1], sorted descending, over live-capacity candidates", () => {
  const data = loadHospitalData();
  const params: OrParameters = {
    incident_type: "fall_head_injury",
    severity_level: 4,
    deterioration_risk: 4,
    vulnerability_level: 4,
    required_departments: ["emergency_medicine", "neurosurgery"],
    required_resources: ["ct", "trauma_resuscitation"],
    max_transport_time_min: 30,
    minimum_hospital_level: "local_center_or_above",
    or_notes: "test",
  };

  const result = rankHospitals({
    candidates: data.primaryCandidates,
    incidentLocation: { lat: 37.5665, lon: 126.978 },
    orParameters: params,
    limit: 5,
  });

  assert.equal(result.formulation.version, "normalized_utility_v3");
  assert.equal(result.candidateSet, "live_capacity");
  assert.equal(result.rankings.length, 5);
  assert.ok(result.strictFeasibleCount >= result.rankings.filter((item) => item.feasible).length);
  assert.equal(result.relaxedFallbackUsed, false);
  // Descending desirability (higher = better), all in [0,1].
  assert.ok(result.rankings[0].desirability >= result.rankings[1].desirability);
  assert.ok(result.rankings.every((item) => item.desirability >= 0 && item.desirability <= 1));
  assert.ok(
    result.rankings.every(
      (item) =>
        unit(item.utilities.time) && unit(item.utilities.capacity) && unit(item.utilities.capability),
    ),
  );
  // weighted contributions sum to desirability
  assert.ok(
    result.rankings.every(
      (item) =>
        Math.abs(
          item.scoreBreakdown.time + item.scoreBreakdown.capacity + item.scoreBreakdown.capability - item.desirability,
        ) < 1e-3,
    ),
  );
  assert.ok(result.rankings.every((item) => item.hospital.capacity));
});

test("ranking is deterministic given fixed inputs", () => {
  const data = loadHospitalData();
  const params = baseParams({ required_departments: ["emergency_medicine"], required_resources: ["ct"] });
  const run = () =>
    rankHospitals({ candidates: data.primaryCandidates, incidentLocation: { lat: 37.5665, lon: 126.978 }, orParameters: params, limit: 10 });
  assert.deepEqual(run(), run());
});

test("time-window misses stay feasible (low u_time) and are flagged for diagnostics", () => {
  const result = rankHospitals({
    candidates: [makeCandidate({ id: "A", beds: 4, lon: 127.2 }), makeCandidate({ id: "B", beds: 8, lon: 127.21 })],
    incidentLocation: { lat: 37.5665, lon: 126.978 },
    orParameters: baseParams({ max_transport_time_min: 10 }),
    limit: 2,
  });

  // Travel time is a soft preference, not a hard cutoff: both candidates remain feasible.
  assert.equal(result.strictFeasibleCount, 2);
  assert.equal(result.relaxedFallbackUsed, false);
  assert.equal(result.constraintDiagnostics.nonTimeFeasibleCandidateCount, 2);
  assert.ok(result.constraintDiagnostics.dominantRelaxationHint?.startsWith("strict_time_window_too_tight"));
  assert.ok(result.rankings.every((item) => item.softFlags.includes("max_transport_time_soft_exceeded")));
  // Being far over the 10-min window collapses u_time toward 0.
  assert.ok(result.rankings.every((item) => item.utilities.time < 0.3));
});

test("minimum_hospital_level is a soft preference folded into capability adequacy", () => {
  const nearLowTier = makeCandidate({ id: "NEAR-LOW", beds: 6, lon: 126.978, level: "emergency_institution_ok" });
  const farRegional = makeCandidate({ id: "FAR-REGIONAL", beds: 6, lon: 127.15, level: "regional_center" });

  const result = rankHospitals({
    candidates: [nearLowTier, farRegional],
    incidentLocation: { lat: 37.5665, lon: 126.978 },
    orParameters: baseParams({ minimum_hospital_level: "regional_center" }),
    limit: 2,
  });

  // A lower-tier hospital that meets the required departments/resources stays feasible;
  // the level shortfall only lowers level_adequacy, it is not a hard violation.
  assert.ok(result.rankings.every((item) => item.feasible));
  assert.ok(result.rankings.every((item) => !item.constraintViolations.includes("minimum_hospital_level_not_met")));
  // The near lower-tier hospital wins over the far regional center despite the tier gap.
  assert.equal(result.rankings[0].hospital.hospital.hospital_id, "NEAR-LOW");
  // Falling 2 tiers below the requested level drives level_adequacy below the "meets" baseline (0.6).
  assert.ok(result.rankings[0].objectiveTerms.level_adequacy < 0.6);
});

test("critical_care is a soft margin, not a hard requirement that excludes nearer ERs", () => {
  const nearNoIcu = makeCandidate({ id: "NEAR-NO-ICU", beds: 5, lon: 126.978 });
  nearNoIcu.capability.has_icu_static = false;
  nearNoIcu.capability.has_neuro_icu_static = false;
  nearNoIcu.capability.has_trauma_icu_static = false;
  nearNoIcu.hospital.emergency_level_model = "emergency_institution_ok";
  nearNoIcu.capacity = {
    ...nearNoIcu.capacity!,
    available_neuro_icu_beds: null,
    available_neonatal_icu_beds: null,
    available_thoracic_icu_beds: null,
    available_general_icu_beds: null,
    available_internal_medicine_icu_beds: null,
    available_surgical_icu_beds: null,
    available_neurosurgery_icu_beds: null,
    available_burn_icu_beds: null,
    available_trauma_icu_beds: null,
  };

  const result = rankHospitals({
    candidates: [nearNoIcu],
    incidentLocation: { lat: 37.5665, lon: 126.978 },
    orParameters: baseParams({
      incident_type: "cardiac_arrest",
      required_resources: ["defibrillation_resuscitation", "critical_care"],
      required_departments: ["emergency_medicine"],
    }),
    limit: 1,
  });

  assert.equal(result.rankings[0].feasible, true);
  assert.ok(!result.rankings[0].constraintViolations.includes("required_resource_missing"));
});

test("u_capacity ranks a 15-bed hospital ahead of a 1-bed hospital when other inputs match", () => {
  const lowBuffer = makeCandidate({ id: "LOW", beds: 1 });
  const highBuffer = makeCandidate({ id: "HIGH", beds: 15 });

  const result = rankHospitals({
    candidates: [lowBuffer, highBuffer],
    incidentLocation: { lat: 37.5665, lon: 126.978 },
    orParameters: baseParams(),
    limit: 2,
  });

  assert.equal(result.rankings[0].hospital.hospital.hospital_id, "HIGH");
  assert.equal(result.rankings[0].bedBufferTier, "stable_buffer_gt_10");
  assert.ok(result.rankings[0].utilities.capacity > result.rankings[1].utilities.capacity);
});

test("farther hospital scores lower u_time (and lower desirability) than a near one", () => {
  const params = baseParams({ max_transport_time_min: 30 });
  const near = rankHospitals({
    candidates: [makeCandidate({ id: "NEAR", beds: 8, lon: 126.978 })],
    incidentLocation: { lat: 37.5665, lon: 126.978 },
    orParameters: params,
    limit: 1,
  }).rankings[0];
  const far = rankHospitals({
    candidates: [makeCandidate({ id: "FAR", beds: 8, lon: 127.098 })],
    incidentLocation: { lat: 37.5665, lon: 126.978 },
    orParameters: params,
    limit: 1,
  }).rankings[0];

  assert.ok(near.timeSlackMin > far.timeSlackMin);
  assert.ok(near.utilities.time > far.utilities.time);
  assert.ok(near.desirability > far.desirability);
});

test("specialist depth (HIRA) raises u_capability for the required department", () => {
  const shallow = makeCandidate({ id: "SHALLOW", beds: 8, matchConfidence: "high", specialtyCounts: { neurosurgery: 0 } });
  const deep = makeCandidate({ id: "DEEP", beds: 8, matchConfidence: "high", specialtyCounts: { neurosurgery: 30 } });

  const result = rankHospitals({
    candidates: [shallow, deep],
    incidentLocation: { lat: 37.5665, lon: 126.978 },
    orParameters: baseParams({ required_departments: ["neurosurgery"] }),
    limit: 2,
  });

  assert.equal(result.rankings[0].hospital.hospital.hospital_id, "DEEP");
  assert.ok(result.rankings[0].utilities.capability > result.rankings[1].utilities.capability);
});

test("urgency shifts the weight balance toward time and capability (not a cost multiplier)", () => {
  const candidates = [makeCandidate({ id: "X", beds: 8 })];
  const loc = { lat: 37.5665, lon: 126.978 };
  const low = rankHospitals({
    candidates,
    incidentLocation: loc,
    orParameters: baseParams({ severity_level: 1, deterioration_risk: 1, vulnerability_level: 1 }),
    limit: 1,
  }).rankings[0];
  const high = rankHospitals({
    candidates,
    incidentLocation: loc,
    orParameters: baseParams({ severity_level: 5, deterioration_risk: 5, vulnerability_level: 5 }),
    limit: 1,
  }).rankings[0];

  assert.equal(low.acuity, 0);
  assert.ok(high.acuity > low.acuity);
  assert.ok(high.weights.time > low.weights.time);
  assert.ok(high.weights.capability > low.weights.capability);
  assert.ok(high.weights.capacity < low.weights.capacity);
});

test("non-positive ER beds are infeasible and stay out of the top three when feasible alternatives exist", () => {
  const result = rankHospitals({
    candidates: [
      makeCandidate({ id: "ZERO", beds: 0 }),
      makeCandidate({ id: "A", beds: 6 }),
      makeCandidate({ id: "B", beds: 8 }),
      makeCandidate({ id: "C", beds: 11 }),
    ],
    incidentLocation: { lat: 37.5665, lon: 126.978 },
    orParameters: baseParams(),
    limit: 3,
  });

  assert.equal(result.rankings.length, 3);
  assert.ok(result.rankings.every((item) => item.hospital.hospital.hospital_id !== "ZERO"));
  assert.ok(result.rankings.every((item) => item.feasible));
});

test("surgery cases prefer operating-room margin after hard requirements are satisfied", () => {
  const params = baseParams({
    incident_type: "blunt_abdominal_trauma",
    required_departments: ["emergency_medicine", "general_surgery"],
    required_resources: ["ct", "surgery_capability", "bleeding_control"],
  });

  const result = rankHospitals({
    candidates: [makeCandidate({ id: "LOW-OR", beds: 8, operatingRooms: 1 }), makeCandidate({ id: "HIGH-OR", beds: 8, operatingRooms: 20 })],
    incidentLocation: { lat: 37.5665, lon: 126.978 },
    orParameters: params,
    limit: 2,
  });

  assert.equal(result.rankings[0].hospital.hospital.hospital_id, "HIGH-OR");
  assert.ok(result.rankings[0].utilities.capacity > result.rankings[1].utilities.capacity);
});

test("a feasible bedded hospital outranks an infeasible no-bed hospital (doctors no longer override beds)", () => {
  const result = rankHospitals({
    candidates: [
      makeCandidate({ id: "BIG-NO-BED", beds: 0, totalDoctors: 1000, matchConfidence: "high" }),
      makeCandidate({ id: "SMALL-WITH-BED", beds: 3, totalDoctors: null, matchConfidence: "none" }),
    ],
    incidentLocation: { lat: 37.5665, lon: 126.978 },
    orParameters: baseParams(),
    limit: 2,
  });

  assert.equal(result.rankings[0].hospital.hospital.hospital_id, "SMALL-WITH-BED");
  assert.equal(result.rankings[1].feasible, false);
  assert.ok(result.rankings[1].constraintViolations.includes("no_positive_available_er_beds"));
});

test("NEMC capacity parser normalizes XML rows and joins active master IDs", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <response>
    <header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header>
    <body>
      <items>
        <item>
          <hpid>A1100011</hpid>
          <phpid>A1100011</phpid>
          <hvidate>20260518235011</hvidate>
          <hvec>11</hvec>
          <hvoc>13</hvoc>
          <hvctayn>Y</hvctayn>
          <hvmriayn>N</hvmriayn>
          <dutyName>가톨릭대학교여의도성모병원</dutyName>
          <dutyTel3>02-3779-1199</dutyTel3>
        </item>
      </items>
      <totalCount>1</totalCount>
    </body>
  </response>`;

  const parsed = parseCapacityXml(xml);
  const rows = buildCapacityRows(parsed.items, {
    requestedDistrict: "영등포구",
    fetchedAt: "2026-05-18T14:53:42.486Z",
    activeHospitalIds: new Set(["A1100011"]),
  });

  assert.equal(parsed.resultCode, "00");
  assert.equal(rows[0].hospital_id, "A1100011");
  assert.equal(rows[0].duty_name_live, "가톨릭대학교여의도성모병원");
  assert.equal(rows[0].available_er_beds, 11);
  assert.equal(rows[0].ct_available_live, true);
  assert.equal(rows[0].mri_available_live, false);
  assert.equal(rows[0].active_in_hospital_master, true);
});

test("buildCapacityUrl returns a URL object to avoid NEMC 403 behavior on encoded Korean district strings", () => {
  const url = buildCapacityUrl({
    serviceKey: "test-service-key",
    stage2: "강동구",
  });

  assert.ok(url instanceof URL);
  assert.equal(url.searchParams.get("STAGE1"), "서울특별시");
  assert.equal(url.searchParams.get("STAGE2"), "강동구");
});

function unit(value: number) {
  return value >= 0 && value <= 1;
}

function baseParams(overrides: Partial<OrParameters> = {}): OrParameters {
  return {
    incident_type: "fall_head_injury",
    severity_level: 4,
    deterioration_risk: 4,
    vulnerability_level: 3,
    required_departments: ["emergency_medicine"],
    required_resources: ["ct"],
    max_transport_time_min: 30,
    minimum_hospital_level: "emergency_institution_ok",
    or_notes: "unit test",
    ...overrides,
  };
}

function makeCandidate({
  id,
  beds,
  operatingRooms = 10,
  lat = 37.5665,
  lon = 126.978,
  level = "local_center_or_above",
  totalDoctors = null,
  totalBeds = null,
  matchConfidence = "none",
  specialtyCounts = {},
}: {
  id: string;
  beds: number;
  operatingRooms?: number;
  lat?: number;
  lon?: number;
  level?: HospitalLevel;
  totalDoctors?: number | null;
  totalBeds?: number | null;
  matchConfidence?: "high" | "medium" | "low" | "none";
  specialtyCounts?: Partial<Record<Department, number>>;
}): HospitalCandidate {
  return {
    hospital: {
      hospital_id: id,
      hpid: id,
      hospital_name: `테스트병원-${id}`,
      address: "서울특별시 중구 테스트로 1",
      district: "중구",
      lat,
      lon,
      emergency_level_raw: "지역응급의료센터",
      emergency_level_code: "G006",
      current_emergency_level_raw: "지역응급의료센터",
      emergency_level_model: level,
      emergency_level_rank: level === "regional_center" ? 3 : level === "local_center_or_above" ? 2 : 1,
      hospital_type_raw: "종합병원",
      er_phone: "02-0000-0000",
      representative_phone: "02-0000-0001",
      er_open_static: true,
      is_designated_emergency_medical_institution: true,
      current_egen_present: true,
      current_egen_updated_at: "20260519000000",
      current_egen_operationyn: "Y",
      current_egen_silson24_chk: "Y",
      or_candidate_active: true,
    },
    capability: {
      hospital_id: id,
      has_ct_static: true,
      has_xray_static: true,
      has_neurosurgery_department: true,
      has_orthopedics_department: true,
      has_general_surgery_department: true,
      has_trauma_surgery_department: true,
      has_emergency_medicine_department: true,
      has_or_static: true,
      has_icu_static: true,
      has_neuro_icu_static: true,
      has_trauma_icu_static: true,
      capability_source: "unit_test",
      capability_confidence: "high",
      capability_notes: "Synthetic candidate for deterministic OR ranking tests.",
    },
    capacity: {
      hospital_id: id,
      hpid: id,
      previous_hpid: id,
      duty_name_live: `테스트병원-${id}`,
      er_phone_live: "02-0000-0000",
      requested_stage1: "서울특별시",
      requested_district: "중구",
      fetched_at: "2026-05-19T00:00:00.000+09:00",
      hvidate_raw: "20260519000000",
      available_er_beds: beds,
      available_operating_rooms: operatingRooms,
      available_neuro_icu_beds: 2,
      available_neonatal_icu_beds: null,
      available_thoracic_icu_beds: 1,
      available_general_icu_beds: 4,
      available_inpatient_beds: 20,
      available_internal_medicine_icu_beds: 2,
      available_surgical_icu_beds: 3,
      available_orthopedic_inpatient_beds: 4,
      available_neurology_inpatient_beds: 3,
      available_neurosurgery_icu_beds: 1,
      available_drug_intoxication_icu_beds: null,
      available_burn_icu_beds: null,
      available_trauma_icu_beds: 2,
      ct_available_live: true,
      mri_available_live: true,
      angiography_available_live: true,
      ventilator_available_live: true,
      ambulance_available_live: true,
      pediatric_ventilator_available_live: null,
      incubator_available_live: null,
      live_congestion_score: null,
      live_congestion_level: "unknown",
      live_congestion_penalty: null,
      capacity_source: "unit_test",
      active_in_hospital_master: true,
    },
    staticProfile: {
      hospital_id: id,
      hospital_name: `테스트병원-${id}`,
      district: "중구",
      address: "서울특별시 중구 테스트로 1",
      total_doctors: totalDoctors,
      specialist_doctors: totalDoctors,
      total_beds: totalBeds,
      icu_beds: null,
      specialty_doctor_counts: specialtyCounts,
      source: "unit_test",
      collected_at: "2026-05-19T00:00:00.000+09:00",
      match_confidence: matchConfidence,
      notes: "Synthetic static profile.",
    },
  };
}
