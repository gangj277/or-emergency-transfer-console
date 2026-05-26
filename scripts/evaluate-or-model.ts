import fs from "node:fs";
import path from "node:path";

import { OR_UTILITY_V3_CONFIG } from "../lib/or/cost-config";
import { loadHospitalData } from "../lib/or/data";
import { rankHospitals, rankHospitalsV2, type RankedHospital } from "../lib/or/recommendation";
import type { LocationPoint, OrParameters } from "../lib/or/types";

// Deterministic OR evaluation for normalized_utility_v3.
// Focus (answers gap B-1): the objective now uses dimensionless [0,1] sub-utilities
// combined with weights that sum to 1, so we report (a) feasibility + decision value
// vs a naive nearest baseline, (b) the v2→v3 migration diff, and (c) ranking
// STABILITY under interpretable weight perturbations — instead of arbitrary
// magic-number coefficient grids.

type ScenarioCase = { caseId: string; title: string; params: OrParameters };
type ScenarioLocation = LocationPoint & { id: string; label: string };

type HospitalSummary = {
  rank?: number;
  hospitalId: string;
  hospitalName: string;
  district: string;
  emergencyLevel: string;
  feasible: boolean;
  estimatedTravelTimeMin: number;
  timeSlackMin: number;
  distanceKm: number;
  availableErBeds: number | null;
  bedBufferTier: string;
  desirability: number;
  uTime: number;
  uCapacity: number;
  uCapability: number;
};

type ScenarioResult = {
  scenarioId: string;
  caseId: string;
  caseTitle: string;
  locationId: string;
  locationLabel: string;
  v3Top: HospitalSummary | null;
  v3Top3: HospitalSummary[];
  nearestFeasibleId: string | null;
  v2TopId: string | null;
  feasibleCandidateCount: number;
  top3FeasibleCount: number;
};

const cases: ScenarioCase[] = [
  {
    caseId: "C001",
    title: "고령 낙상 + 두부 충격 + 일시 의식저하",
    params: {
      incident_type: "fall_head_injury",
      severity_level: 4,
      deterioration_risk: 4,
      vulnerability_level: 5,
      required_departments: ["emergency_medicine", "neurosurgery"],
      required_resources: ["ct", "trauma_resuscitation"],
      max_transport_time_min: 20,
      minimum_hospital_level: "local_center_or_above",
      or_notes: "Gold OR parameters for deterministic OR evaluation.",
    },
  },
  {
    caseId: "C002",
    title: "오토바이 사고 + 하지 변형/골절 의심 + 출혈",
    params: {
      incident_type: "traffic_trauma",
      severity_level: 4,
      deterioration_risk: 3,
      vulnerability_level: 2,
      required_departments: ["emergency_medicine", "orthopedics"],
      required_resources: ["xray", "orthopedic_trauma", "surgery_capability", "bleeding_control"],
      max_transport_time_min: 30,
      minimum_hospital_level: "local_center_or_above",
      or_notes: "Gold OR parameters for deterministic OR evaluation.",
    },
  },
  {
    caseId: "C003",
    title: "계단 낙상 + 허리/골반 통증 + 보행 불가",
    params: {
      incident_type: "fall_orthopedic",
      severity_level: 3,
      deterioration_risk: 2,
      vulnerability_level: 2,
      required_departments: ["emergency_medicine", "orthopedics"],
      required_resources: ["xray", "orthopedic_trauma"],
      max_transport_time_min: 45,
      minimum_hospital_level: "emergency_institution_ok",
      or_notes: "Gold OR parameters for deterministic OR evaluation.",
    },
  },
  {
    caseId: "C004",
    title: "공사장 둔상 + 복부 통증 + 어지러움",
    params: {
      incident_type: "blunt_abdominal_trauma",
      severity_level: 4,
      deterioration_risk: 4,
      vulnerability_level: 2,
      required_departments: ["emergency_medicine", "general_surgery"],
      required_resources: ["ct", "surgery_capability", "bleeding_control"],
      max_transport_time_min: 20,
      minimum_hospital_level: "local_center_or_above",
      or_notes: "Gold OR parameters for deterministic OR evaluation.",
    },
  },
  {
    caseId: "C005",
    title: "경미 두부외상처럼 보이나 항응고제/고령 취약성",
    params: {
      incident_type: "minor_head_injury_anticoagulant",
      severity_level: 3,
      deterioration_risk: 3,
      vulnerability_level: 5,
      required_departments: ["emergency_medicine", "neurosurgery"],
      required_resources: ["ct"],
      max_transport_time_min: 30,
      minimum_hospital_level: "local_center_or_above",
      or_notes: "Gold OR parameters for deterministic OR evaluation.",
    },
  },
];

const locations: ScenarioLocation[] = [
  { id: "city_hall", label: "서울시청", lat: 37.5665, lon: 126.978 },
  { id: "gangnam", label: "강남역", lat: 37.4979, lon: 127.0276 },
  { id: "hongdae", label: "홍대입구", lat: 37.5572, lon: 126.9254 },
  { id: "jamsil", label: "잠실역", lat: 37.5133, lon: 127.1 },
  { id: "yeouido", label: "여의도", lat: 37.5219, lon: 126.9246 },
  { id: "nowon", label: "노원", lat: 37.6543, lon: 127.0568 },
  { id: "guro", label: "구로디지털단지", lat: 37.4852, lon: 126.9016 },
  { id: "eunpyeong", label: "은평구청", lat: 37.6027, lon: 126.9291 },
];

const transportTimeOptions: OrParameters["max_transport_time_min"][] = [15, 20, 30, 45, 60];

// Mutable view onto the (runtime-mutable) v3 config for sensitivity sweeps.
type Weights = { time: number; capacity: number; capability: number };
const mutableWeights = OR_UTILITY_V3_CONFIG.weights as Weights;
const mutableUTime = OR_UTILITY_V3_CONFIG.uTime as { tauMin: number };
const DEFAULT_WEIGHTS: Weights = { ...mutableWeights };
const DEFAULT_TAU = mutableUTime.tauMin;

function main() {
  const data = loadHospitalData();
  const scenarioResults = cases.flatMap((caseDef) => locations.map((location) => runScenario(caseDef, location)));

  const result = {
    generatedAt: new Date().toISOString(),
    formulationVersion: "normalized_utility_v3" as const,
    dataset: data.summary,
    dataSanity: summarizeData(),
    aggregate: summarizeScenarioResults(scenarioResults),
    weightSensitivity: runWeightSensitivity(),
    transportSensitivity: runTransportSensitivity(),
    outageSimulation: runCapacityOutageSimulation(scenarioResults),
    scenarioResults,
  };

  const outDir = path.resolve("outputs/or-evaluation/latest");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "results.json"), `${JSON.stringify(result, null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, "report.md"), buildMarkdownReport(result));

  console.log(
    JSON.stringify(
      {
        outDir,
        aggregate: result.aggregate,
        weightSensitivity: result.weightSensitivity,
        outageSimulation: { rerouted: result.outageSimulation.reroutedScenarios, of: result.outageSimulation.simulatedScenarios },
      },
      null,
      2,
    ),
  );
}

function runScenario(caseDef: ScenarioCase, location: ScenarioLocation): ScenarioResult {
  const data = loadHospitalData();
  const ranking = rankHospitals({
    candidates: data.primaryCandidates,
    incidentLocation: location,
    orParameters: caseDef.params,
    limit: data.primaryCandidates.length,
  }).rankings;
  const feasible = ranking.filter((item) => item.feasible);
  const top3 = ranking.slice(0, 3);

  const v2 = rankHospitalsV2({ candidates: data.primaryCandidates, incidentLocation: location, orParameters: caseDef.params });
  const v2TopFeasible = v2.find((item) => item.feasible) ?? null;

  return {
    scenarioId: `${caseDef.caseId}_${location.id}`,
    caseId: caseDef.caseId,
    caseTitle: caseDef.title,
    locationId: location.id,
    locationLabel: location.label,
    v3Top: feasible[0] ? summarizeRanked(feasible[0]) : null,
    v3Top3: top3.map(summarizeRanked),
    nearestFeasibleId: chooseNearestId(feasible),
    v2TopId: v2TopFeasible?.hospitalId ?? null,
    feasibleCandidateCount: feasible.length,
    top3FeasibleCount: top3.filter((item) => item.feasible).length,
  };
}

function summarizeData() {
  const data = loadHospitalData();
  const capacities = data.capacitySnapshot;
  const erBeds = capacities
    .map((item) => item.available_er_beds)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .sort((a, b) => a - b);
  const profilesWithDoctors = data.staticProfiles.filter((p) => typeof p.total_doctors === "number").length;
  return {
    activeHospitals: data.hospitals.length,
    liveCapacityHospitals: data.primaryCandidates.length,
    missingLiveCapacityHospitals: data.missingActiveCapacity.length,
    staticProfiles: data.staticProfiles.length,
    profilesWithHiraDoctors: profilesWithDoctors,
    levelCounts: countBy(data.hospitals, (hospital) => hospital.emergency_level_model),
    erBedDistribution: {
      min: erBeds[0] ?? null,
      p25: percentile(erBeds, 0.25),
      median: percentile(erBeds, 0.5),
      p75: percentile(erBeds, 0.75),
      max: erBeds.at(-1) ?? null,
    },
    liveRowsWithNonPositiveErBeds: capacities.filter((item) => typeof item.available_er_beds === "number" && item.available_er_beds <= 0).length,
  };
}

function summarizeScenarioResults(results: ScenarioResult[]) {
  const noFeasible = results.filter((item) => !item.v3Top);
  const top3AllFeasible = results.filter((item) => item.top3FeasibleCount === 3);

  const vsNearest = results.filter((item) => item.v3Top && item.nearestFeasibleId);
  const vsNearestChanged = vsNearest.filter((item) => item.v3Top!.hospitalId !== item.nearestFeasibleId);

  const vsV2 = results.filter((item) => item.v3Top && item.v2TopId);
  const vsV2Changed = vsV2.filter((item) => item.v3Top!.hospitalId !== item.v2TopId);

  return {
    totalScenarios: results.length,
    noFeasibleScenarios: noFeasible.length,
    top3AllFeasibleScenarios: top3AllFeasible.length,
    v3TopTierCounts: countBy(results.map((item) => item.v3Top).filter(Boolean), (item) => item!.bedBufferTier),
    v3VsNearest: {
      comparableScenarios: vsNearest.length,
      changedTop1: vsNearestChanged.length,
      changedTop1Rate: ratio(vsNearestChanged.length, vsNearest.length),
      medianExtraTravelWhenChanged: percentile(
        vsNearestChanged.map((item) => {
          const nearest = results.find((r) => r.scenarioId === item.scenarioId);
          return item.v3Top!.estimatedTravelTimeMin - (nearest ? minTravelOf(nearest) : item.v3Top!.estimatedTravelTimeMin);
        }),
        0.5,
      ),
    },
    v3VsV2: {
      comparableScenarios: vsV2.length,
      changedTop1: vsV2Changed.length,
      changedTop1Rate: ratio(vsV2Changed.length, vsV2.length),
      examples: vsV2Changed.slice(0, 8).map((item) => ({
        scenarioId: item.scenarioId,
        caseTitle: item.caseTitle,
        locationLabel: item.locationLabel,
        v3: item.v3Top!.hospitalName,
        v3Desirability: item.v3Top!.desirability,
        v2HospitalId: item.v2TopId,
      })),
    },
  };
}

function minTravelOf(scenario: ScenarioResult) {
  // nearest feasible travel time = the v3Top3 minimum (approximation for reporting)
  const times = scenario.v3Top3.map((t) => t.estimatedTravelTimeMin);
  return times.length ? Math.min(...times) : scenario.v3Top!.estimatedTravelTimeMin;
}

// ── B-1 answer: ranking stability under interpretable weight perturbations ──
function runWeightSensitivity() {
  const baseline = baselineTop1Ids();
  const settings: Array<{ id: string; weights?: Weights; tauMin?: number }> = [
    { id: "balanced_default" },
    { id: "time_heavy", weights: { time: 0.6, capacity: 0.2, capability: 0.2 } },
    { id: "capacity_heavy", weights: { time: 0.2, capacity: 0.6, capability: 0.2 } },
    { id: "capability_heavy", weights: { time: 0.2, capacity: 0.2, capability: 0.6 } },
    { id: "equal_thirds", weights: { time: 1 / 3, capacity: 1 / 3, capability: 1 / 3 } },
    { id: "tau_8min", tauMin: 8 },
    { id: "tau_18min", tauMin: 18 },
  ];

  const rows = settings.map((setting) => {
    const top1 = withConfig(setting, () => allTop1Ids());
    let comparable = 0;
    let changedCount = 0;
    for (let i = 0; i < baseline.length; i++) {
      if (baseline[i] === null || top1[i] === null) continue;
      comparable++;
      if (baseline[i] !== top1[i]) changedCount++;
    }
    return {
      setting: setting.id,
      weights: setting.weights ?? DEFAULT_WEIGHTS,
      tauMin: setting.tauMin ?? DEFAULT_TAU,
      comparableScenarios: comparable,
      changedTop1VsDefault: changedCount,
      changedTop1Rate: ratio(changedCount, baseline.filter((b) => b !== null).length),
    };
  });
  return rows;
}

function baselineTop1Ids() {
  return allTop1Ids();
}

function allTop1Ids(): (string | null)[] {
  const data = loadHospitalData();
  return cases.flatMap((caseDef) =>
    locations.map((location) => {
      const ranking = rankHospitals({ candidates: data.primaryCandidates, incidentLocation: location, orParameters: caseDef.params, limit: 1 }).rankings;
      const top = ranking[0];
      return top && top.feasible ? top.hospital.hospital.hospital_id : null;
    }),
  );
}

function withConfig(setting: { weights?: Weights; tauMin?: number }, fn: () => (string | null)[]) {
  if (setting.weights) Object.assign(mutableWeights, setting.weights);
  if (typeof setting.tauMin === "number") mutableUTime.tauMin = setting.tauMin;
  try {
    return fn();
  } finally {
    Object.assign(mutableWeights, DEFAULT_WEIGHTS);
    mutableUTime.tauMin = DEFAULT_TAU;
  }
}

function runTransportSensitivity() {
  return transportTimeOptions.map((maxTransport) => {
    const data = loadHospitalData();
    const results = cases.flatMap((caseDef) =>
      locations.map((location) => {
        const ranking = rankHospitals({
          candidates: data.primaryCandidates,
          incidentLocation: location,
          orParameters: { ...caseDef.params, max_transport_time_min: maxTransport },
          limit: data.primaryCandidates.length,
        }).rankings;
        const feasible = ranking.filter((item) => item.feasible);
        return { feasibleCount: feasible.length, top: feasible[0] ?? null };
      }),
    );
    const feasibleCounts = results.map((item) => item.feasibleCount);
    const tops = results.map((item) => item.top).filter(Boolean) as RankedHospital[];
    return {
      maxTransportTimeMin: maxTransport,
      scenarioCount: results.length,
      noFeasibleScenarios: results.filter((item) => !item.top).length,
      medianFeasibleCandidateCount: percentile(feasibleCounts, 0.5),
      minFeasibleCandidateCount: Math.min(...feasibleCounts),
      medianTop1TravelMin: percentile(tops.map((item) => item.estimatedTravelTimeMin), 0.5),
      medianTop1Desirability: percentile(tops.map((item) => item.desirability), 0.5),
    };
  });
}

function runCapacityOutageSimulation(baseResults: ScenarioResult[]) {
  const data = loadHospitalData();
  const rows = baseResults
    .filter((item) => item.v3Top)
    .map((item) => {
      const topHospitalId = item.v3Top!.hospitalId;
      const caseDef = cases.find((caseItem) => caseItem.caseId === item.caseId)!;
      const location = locations.find((loc) => loc.id === item.locationId)!;
      const candidates = data.primaryCandidates.map((candidate) => {
        if (candidate.hospital.hospital_id !== topHospitalId || !candidate.capacity) return candidate;
        return { ...candidate, capacity: { ...candidate.capacity, available_er_beds: 0 } };
      });
      const reranked = rankHospitals({ candidates, incidentLocation: location, orParameters: caseDef.params, limit: candidates.length }).rankings;
      const nextTop = reranked.find((ranked) => ranked.feasible);
      return {
        scenarioId: item.scenarioId,
        originalTop: item.v3Top!.hospitalName,
        reroutedTop: nextTop ? nextTop.hospital.hospital.hospital_name : null,
        rerouted: Boolean(nextTop && nextTop.hospital.hospital.hospital_id !== topHospitalId),
      };
    });
  return {
    simulatedScenarios: rows.length,
    reroutedScenarios: rows.filter((row) => row.rerouted).length,
    noFeasibleAfterOutage: rows.filter((row) => !row.reroutedTop).length,
    examples: rows.filter((row) => row.rerouted).slice(0, 5),
  };
}

function summarizeRanked(item: RankedHospital): HospitalSummary {
  return {
    rank: item.rank,
    hospitalId: item.hospital.hospital.hospital_id,
    hospitalName: item.hospital.hospital.hospital_name,
    district: item.hospital.hospital.district,
    emergencyLevel: item.hospital.hospital.emergency_level_model,
    feasible: item.feasible,
    estimatedTravelTimeMin: item.estimatedTravelTimeMin,
    timeSlackMin: item.timeSlackMin,
    distanceKm: item.distanceKm,
    availableErBeds: item.availableErBeds,
    bedBufferTier: item.bedBufferTier,
    desirability: item.desirability,
    uTime: item.utilities.time,
    uCapacity: item.utilities.capacity,
    uCapability: item.utilities.capability,
  };
}

function chooseNearestId(items: RankedHospital[]) {
  const chosen = [...items].sort((a, b) => a.estimatedTravelTimeMin - b.estimatedTravelTimeMin || a.distanceKm - b.distanceKm)[0];
  return chosen ? chosen.hospital.hospital.hospital_id : null;
}

type ReportInput = {
  generatedAt: string;
  dataSanity: ReturnType<typeof summarizeData>;
  aggregate: ReturnType<typeof summarizeScenarioResults>;
  weightSensitivity: ReturnType<typeof runWeightSensitivity>;
  transportSensitivity: ReturnType<typeof runTransportSensitivity>;
  outageSimulation: ReturnType<typeof runCapacityOutageSimulation>;
};

function buildMarkdownReport(result: ReportInput) {
  const lines: string[] = [];
  const a = result.aggregate;
  lines.push("# OR 모델 평가 리포트 — normalized_utility_v3");
  lines.push("");
  lines.push(`생성 시각: ${result.generatedAt}`);
  lines.push("");
  lines.push("## 핵심 결론");
  lines.push("");
  lines.push(
    `v3는 ${a.totalScenarios}개 결정론적 시나리오에서 제약 만족 후보 없음 ${a.noFeasibleScenarios}개, 상위 3개가 모두 제약 만족한 케이스 ${a.top3AllFeasibleScenarios}개를 보였다.`,
  );
  lines.push(
    `단순 최단거리 대비 1순위가 바뀐 경우는 ${a.v3VsNearest.changedTop1}/${a.v3VsNearest.comparableScenarios} (${formatPercent(a.v3VsNearest.changedTop1Rate)})로, v3는 단순 최근접이 아니라 시간·용량·역량 trade-off를 반영한다.`,
  );
  lines.push(
    `이전 정식화(v2) 대비 1순위가 바뀐 경우는 ${a.v3VsV2.changedTop1}/${a.v3VsV2.comparableScenarios} (${formatPercent(a.v3VsV2.changedTop1Rate)})다.`,
  );
  lines.push("");
  lines.push("## 1. 데이터 준비도");
  lines.push("");
  lines.push(`- 활성 병원: ${result.dataSanity.activeHospitals}, 실시간 병상 병원: ${result.dataSanity.liveCapacityHospitals}`);
  lines.push(`- HIRA 의사수 적재 프로필: ${result.dataSanity.profilesWithHiraDoctors} (정적 신뢰도 항이 아닌 capability depth로 사용)`);
  lines.push(`- 응급실 가용 병상 분포: ${jsonInline(result.dataSanity.erBedDistribution)}`);
  lines.push(`- 가용 병상 ≤0 실시간 행: ${result.dataSanity.liveRowsWithNonPositiveErBeds} → \`available_er_beds > 0\` 하드 제약 필수`);
  lines.push("");
  lines.push("## 2. 가중치 민감도 (B-1 답변: 무차원 가중치 안정성)");
  lines.push("");
  lines.push(
    "v2의 핵심 한계는 비교 불가능한 매직넘버 계수였다. v3는 [0,1] 효용을 합=1 가중치로 결합하므로, 가중치를 해석 가능한 프리셋으로 흔들어 1순위 안정성을 본다.",
  );
  lines.push("");
  lines.push("| 설정 | 가중치(time/cap/capability) | tau(min) | 기본 대비 1순위 변경 | 변경률 |");
  lines.push("|---|---|---:|---:|---:|");
  for (const row of result.weightSensitivity) {
    lines.push(
      `| ${row.setting} | ${row.weights.time.toFixed(2)}/${row.weights.capacity.toFixed(2)}/${row.weights.capability.toFixed(2)} | ${row.tauMin} | ${row.changedTop1VsDefault}/${a.totalScenarios} | ${formatPercent(row.changedTop1Rate)} |`,
    );
  }
  lines.push("");
  lines.push("### 해석");
  lines.push(
    "가중치는 이제 차원이 없고 합이 1이므로 각 값이 실제 trade-off 비중을 의미한다. 위 표는 극단 프리셋에서의 순위 이동 폭을 보여주며, 발표에서는 임의 상수가 아니라 '문서화된 가중치 + 민감도'로 설명할 수 있다.",
  );
  lines.push("");
  lines.push("## 3. v2 → v3 마이그레이션 차이");
  lines.push("");
  lines.push(`- 1순위 변경: ${a.v3VsV2.changedTop1}/${a.v3VsV2.comparableScenarios}`);
  for (const ex of a.v3VsV2.examples) {
    lines.push(`- ${ex.scenarioId} (${ex.caseTitle}, ${ex.locationLabel}): v3 → ${ex.v3} (desirability ${formatNumber(ex.v3Desirability)})`);
  }
  lines.push("");
  lines.push("## 4. 최대 이송시간 민감도");
  lines.push("");
  lines.push("| 최대 이송시간 | 제약만족 후보 없음 | 후보 수 중앙값 | 후보 수 최솟값 | 1순위 이송시간 중앙값 | 1순위 desirability 중앙값 |");
  lines.push("|---:|---:|---:|---:|---:|---:|");
  for (const row of result.transportSensitivity) {
    lines.push(
      `| ${row.maxTransportTimeMin} | ${row.noFeasibleScenarios} | ${formatNumber(row.medianFeasibleCandidateCount)} | ${row.minFeasibleCandidateCount} | ${formatNumber(row.medianTop1TravelMin)} | ${formatNumber(row.medianTop1Desirability)} |`,
    );
  }
  lines.push("");
  lines.push("## 5. 병상 소진 재라우팅");
  lines.push("");
  lines.push(`- 시뮬레이션: ${result.outageSimulation.simulatedScenarios}, 재라우팅: ${result.outageSimulation.reroutedScenarios}, 소진 후 후보 없음: ${result.outageSimulation.noFeasibleAfterOutage}`);
  for (const row of result.outageSimulation.examples) {
    lines.push(`- ${row.scenarioId}: ${row.originalTop} → ${row.reroutedTop ?? "없음"}`);
  }
  lines.push("");
  lines.push("## 연구 수준 격차 (잔존)");
  lines.push("");
  lines.push("- 가중치는 무차원·소수·민감도 보고로 정당화하지만, 환자 결과 데이터 기반 보정은 아니다 (데이터 없음).");
  lines.push("- 이송시간은 여전히 직선거리 기반 대체값이다 (경로 API 미연동).");
  lines.push("- u_capacity는 총 병상이 아닌 실시간 가용량을 쓴다 (HIRA에 총 병상 없음).");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function countBy<T>(items: T[], keyFn: (item: T) => string) {
  return items.reduce<Record<string, number>>((acc, item) => {
    const key = keyFn(item);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

function percentile(values: (number | null)[], p: number) {
  const nums = values.filter(isNumber).sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const index = Math.min(nums.length - 1, Math.max(0, Math.round((nums.length - 1) * p)));
  return nums[index];
}

function ratio(numerator: number, denominator: number) {
  if (denominator === 0) return 0;
  return Number((numerator / denominator).toFixed(4));
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatNumber(value: unknown) {
  if (!isNumber(value)) return "n/a";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function jsonInline(value: unknown) {
  return `\`${JSON.stringify(value)}\``;
}

main();
