// @ts-nocheck
// DEPRECATED — v2-era gap analysis. Its core `runPenaltySensitivity` sweeps the
// additive bed/resource penalty COEFFICIENTS, which no longer exist under
// normalized_utility_v3 (capacity is a single saturating utility). This script is
// frozen for historical reference (it produced outputs/or-evaluation/latest/gap-report.md);
// the v3 replacement is the weight-sensitivity section of `npm run or:evaluate`.
// Not type-checked and not wired to an npm script — do not run against v3.
import fs from "node:fs";
import path from "node:path";

import { loadHospitalData } from "../lib/or/data";
import { refreshSeoulCapacity } from "../lib/or/nemc-capacity";
import { rankHospitals, type RankedHospital } from "../lib/or/recommendation";
import type { HospitalCandidate, LocationPoint, OrParameters, Resource } from "../lib/or/types";

type ScenarioCase = {
  caseId: string;
  title: string;
  params: OrParameters;
};

type ScenarioLocation = LocationPoint & {
  id: string;
  label: string;
};

type Scenario = {
  scenarioId: string;
  caseDef: ScenarioCase;
  location: ScenarioLocation;
};

type TopChoice = {
  hospitalId: string;
  hospitalName: string;
  district: string;
  availableErBeds: number | null;
  estimatedTravelTimeMin: number;
  timeSlackMin: number;
  bedBufferTier: string;
  totalCost: number;
};

type GapEvaluationResult = {
  generatedAt: string;
  scenarioCount: number;
  tests: {
    penaltySensitivity: ReturnType<typeof runPenaltySensitivity>;
    transportProxyShock: ReturnType<typeof runTransportProxyShock>;
    llmParameterNoise: ReturnType<typeof runLlmParameterNoise>;
    resourceExtractionNoise: ReturnType<typeof runResourceExtractionNoise>;
    liveCapacityDrift: Awaited<ReturnType<typeof runLiveCapacityDrift>>;
    staticProfileGap: ReturnType<typeof runStaticProfileGap>;
  };
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
      or_notes: "기준 OR 파라미터.",
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
      or_notes: "기준 OR 파라미터.",
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
      or_notes: "기준 OR 파라미터.",
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
      or_notes: "기준 OR 파라미터.",
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
      or_notes: "기준 OR 파라미터.",
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

const transportBuckets: OrParameters["max_transport_time_min"][] = [10, 15, 20, 30, 45, 60];

async function main() {
  const scenarios = buildScenarios();
  const result: GapEvaluationResult = {
    generatedAt: new Date().toISOString(),
    scenarioCount: scenarios.length,
    tests: {
      penaltySensitivity: runPenaltySensitivity(scenarios),
      transportProxyShock: runTransportProxyShock(scenarios),
      llmParameterNoise: runLlmParameterNoise(scenarios),
      resourceExtractionNoise: runResourceExtractionNoise(scenarios),
      liveCapacityDrift: await runLiveCapacityDrift(scenarios),
      staticProfileGap: runStaticProfileGap(),
    },
  };

  const outDir = path.resolve("outputs/or-evaluation/latest");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "gap-results.json"), `${JSON.stringify(result, null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, "gap-report.md"), buildGapReport(result));
  fs.writeFileSync(path.join(outDir, "report-with-gaps.md"), combineReports(buildGapReport(result)));

  console.log(
    JSON.stringify(
      {
        outDir,
        scenarioCount: result.scenarioCount,
        penaltySensitivity: result.tests.penaltySensitivity.summary,
        transportProxyShock: result.tests.transportProxyShock.summary,
        llmParameterNoise: result.tests.llmParameterNoise.summary,
        resourceExtractionNoise: result.tests.resourceExtractionNoise.summary,
        liveCapacityDrift: result.tests.liveCapacityDrift.summary,
        staticProfileGap: result.tests.staticProfileGap.summary,
      },
      null,
      2,
    ),
  );
}

function buildScenarios(): Scenario[] {
  return cases.flatMap((caseDef) =>
    locations.map((location) => ({
      scenarioId: `${caseDef.caseId}_${location.id}`,
      caseDef,
      location,
    })),
  );
}

function runPenaltySensitivity(scenarios: Scenario[]) {
  const bedScales = [0, 0.5, 1, 1.5, 2, 3];
  const resourceScales = [0, 0.5, 1, 1.5, 2];
  const rows = [];
  for (const bedScale of bedScales) {
    for (const resourceScale of resourceScales) {
      const scenarioRows = scenarios.map((scenario) => {
        const ranking = fullRanking(scenario);
        const baseTop = firstFeasible(ranking);
        const adjustedTop = chooseByAdjustedObjective(ranking, bedScale, resourceScale);
        return {
          scenarioId: scenario.scenarioId,
          caseTitle: scenario.caseDef.title,
          locationLabel: scenario.location.label,
          baseTop: summarize(baseTop),
          adjustedTop: summarize(adjustedTop),
          changed: Boolean(baseTop && adjustedTop && baseTop.hospital.hospital.hospital_id !== adjustedTop.hospital.hospital.hospital_id),
        };
      });
      rows.push({
        bedScale,
        resourceScale,
        changedTopRecommendationCount: scenarioRows.filter((row) => row.changed).length,
        changedTopRecommendationRate: ratio(scenarioRows.filter((row) => row.changed).length, scenarioRows.length),
        medianAdjustedTopBeds: percentile(scenarioRows.map((row) => row.adjustedTop?.availableErBeds).filter(isNumber), 0.5),
        medianAdjustedTopTravelMin: percentile(scenarioRows.map((row) => row.adjustedTop?.estimatedTravelTimeMin).filter(isNumber), 0.5),
        examples: scenarioRows.filter((row) => row.changed).slice(0, 5),
      });
    }
  }
  const nonBaseRows = rows.filter((row) => !(row.bedScale === 1 && row.resourceScale === 1));
  const maxChange = Math.max(...nonBaseRows.map((row) => row.changedTopRecommendationCount));
  const fragileRows = nonBaseRows.filter((row) => row.changedTopRecommendationCount >= 20);
  return {
    summary: {
      testedGridCount: rows.length,
      maxChangedTopRecommendationCount: maxChange,
      highInstabilityGridCount: fragileRows.length,
      highInstabilityThreshold: "40개 중 20개 이상 변경",
    },
    rows,
  };
}

function runTransportProxyShock(scenarios: Scenario[]) {
  const multipliers = [1.1, 1.2, 1.3, 1.5];
  const rows = multipliers.map((multiplier) => {
    const scenarioRows = scenarios.map((scenario) => {
      const top = firstFeasible(fullRanking(scenario));
      const adjustedTravelTimeMin = top ? Math.ceil(top.estimatedTravelTimeMin * multiplier) : null;
      const adjustedSlackMin = adjustedTravelTimeMin === null ? null : scenario.caseDef.params.max_transport_time_min - adjustedTravelTimeMin;
      return {
        scenarioId: scenario.scenarioId,
        caseTitle: scenario.caseDef.title,
        locationLabel: scenario.location.label,
        top: summarize(top),
        maxTransportTimeMin: scenario.caseDef.params.max_transport_time_min,
        adjustedTravelTimeMin,
        adjustedSlackMin,
        exceedsMaxTransportTime: typeof adjustedSlackMin === "number" && adjustedSlackMin < 0,
        tightAfterShock: typeof adjustedSlackMin === "number" && adjustedSlackMin >= 0 && adjustedSlackMin < 5,
      };
    });
    return {
      travelMultiplier: multiplier,
      exceededTopRecommendationCount: scenarioRows.filter((row) => row.exceedsMaxTransportTime).length,
      tightButStillFeasibleCount: scenarioRows.filter((row) => row.tightAfterShock).length,
      robustCount: scenarioRows.filter((row) => !row.exceedsMaxTransportTime && !row.tightAfterShock).length,
      examples: scenarioRows.filter((row) => row.exceedsMaxTransportTime || row.tightAfterShock).slice(0, 8),
    };
  });
  return {
    summary: {
      testedMultipliers: multipliers,
      exceededAtTwentyPercentShock: rows.find((row) => row.travelMultiplier === 1.2)?.exceededTopRecommendationCount ?? null,
      tightAtTwentyPercentShock: rows.find((row) => row.travelMultiplier === 1.2)?.tightButStillFeasibleCount ?? null,
      exceededAtThirtyPercentShock: rows.find((row) => row.travelMultiplier === 1.3)?.exceededTopRecommendationCount ?? null,
    },
    rows,
  };
}

function runLlmParameterNoise(scenarios: Scenario[]) {
  const rows = scenarios.flatMap((scenario) => {
    const baseTop = firstFeasible(fullRanking(scenario));
    return parameterVariants(scenario.caseDef.params).map((variant) => {
      const ranking = rankHospitals({
        candidates: loadHospitalData().primaryCandidates,
        incidentLocation: scenario.location,
        orParameters: variant.params,
        limit: loadHospitalData().primaryCandidates.length,
      }).rankings;
      const variantTop = firstFeasible(ranking);
      return {
        scenarioId: scenario.scenarioId,
        caseTitle: scenario.caseDef.title,
        locationLabel: scenario.location.label,
        variant: variant.name,
        baseTop: summarize(baseTop),
        variantTop: summarize(variantTop),
        changed: Boolean(baseTop && variantTop && baseTop.hospital.hospital.hospital_id !== variantTop.hospital.hospital.hospital_id),
        noFeasible: !variantTop,
      };
    });
  });
  const grouped = groupRows(rows, (row) => row.variant).map(([variant, variantRows]) => ({
    variant,
    count: variantRows.length,
    changedTopRecommendationCount: variantRows.filter((row) => row.changed).length,
    changedTopRecommendationRate: ratio(variantRows.filter((row) => row.changed).length, variantRows.length),
    noFeasibleCount: variantRows.filter((row) => row.noFeasible).length,
  }));
  return {
    summary: {
      testedVariantCount: rows.length,
      changedTopRecommendationCount: rows.filter((row) => row.changed).length,
      changedTopRecommendationRate: ratio(rows.filter((row) => row.changed).length, rows.length),
      noFeasibleCount: rows.filter((row) => row.noFeasible).length,
    },
    grouped,
    fragileExamples: rows.filter((row) => row.changed || row.noFeasible).slice(0, 12),
  };
}

function runResourceExtractionNoise(scenarios: Scenario[]) {
  const rows = scenarios.flatMap((scenario) => {
    const baseTop = firstFeasible(fullRanking(scenario));
    return resourceVariants(scenario.caseDef.params).map((variant) => {
      const ranking = rankHospitals({
        candidates: loadHospitalData().primaryCandidates,
        incidentLocation: scenario.location,
        orParameters: variant.params,
        limit: loadHospitalData().primaryCandidates.length,
      }).rankings;
      const variantTop = firstFeasible(ranking);
      return {
        scenarioId: scenario.scenarioId,
        caseTitle: scenario.caseDef.title,
        locationLabel: scenario.location.label,
        variant: variant.name,
        baseTop: summarize(baseTop),
        variantTop: summarize(variantTop),
        changed: Boolean(baseTop && variantTop && baseTop.hospital.hospital.hospital_id !== variantTop.hospital.hospital.hospital_id),
        noFeasible: !variantTop,
      };
    });
  });
  const grouped = groupRows(rows, (row) => row.variant).map(([variant, variantRows]) => ({
    variant,
    count: variantRows.length,
    changedTopRecommendationCount: variantRows.filter((row) => row.changed).length,
    changedTopRecommendationRate: ratio(variantRows.filter((row) => row.changed).length, variantRows.length),
    noFeasibleCount: variantRows.filter((row) => row.noFeasible).length,
  }));
  return {
    summary: {
      testedVariantCount: rows.length,
      changedTopRecommendationCount: rows.filter((row) => row.changed).length,
      changedTopRecommendationRate: ratio(rows.filter((row) => row.changed).length, rows.length),
      noFeasibleCount: rows.filter((row) => row.noFeasible).length,
    },
    grouped,
    fragileExamples: rows.filter((row) => row.changed || row.noFeasible).slice(0, 12),
  };
}

async function runLiveCapacityDrift(scenarios: Scenario[]) {
  const data = loadHospitalData();
  const serviceKey = loadSecret("NEMC_SERVICE_KEY");
  if (!serviceKey) {
    return {
      summary: {
        attempted: false,
        reason: "NEMC_SERVICE_KEY가 설정되어 있지 않아 현재 시점 재호출 검증을 실행하지 못했다.",
      },
      rows: [],
      recommendationComparison: [],
    };
  }

  try {
    const districts = [...new Set(data.hospitals.map((hospital) => hospital.district).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, "ko"),
    );
    const activeHospitalIds = new Set(data.hospitals.map((hospital) => hospital.hospital_id));
    const refreshed = await refreshSeoulCapacity({ serviceKey, districts, activeHospitalIds });
    const freshById = new Map(refreshed.rows.filter((row) => row.active_in_hospital_master).map((row) => [row.hospital_id, row]));
    const persistedById = new Map(data.capacitySnapshot.map((row) => [row.hospital_id, row]));
    const rows = [...freshById.values()].map((fresh) => {
      const old = persistedById.get(fresh.hospital_id);
      const oldBeds = old?.available_er_beds ?? null;
      const freshBeds = fresh.available_er_beds ?? null;
      return {
        hospitalId: fresh.hospital_id,
        hospitalName: fresh.duty_name_live,
        district: fresh.requested_district,
        persistedErBeds: oldBeds,
        freshErBeds: freshBeds,
        absoluteBedChange: isNumber(oldBeds) && isNumber(freshBeds) ? Math.abs(freshBeds - oldBeds) : null,
        crossedPositiveBoundary: isNumber(oldBeds) && isNumber(freshBeds) ? (oldBeds > 0 && freshBeds <= 0) || (oldBeds <= 0 && freshBeds > 0) : false,
      };
    });
    const freshCandidates = data.activeCandidates
      .map((candidate) => ({
        ...candidate,
        capacity: freshById.get(candidate.hospital.hospital_id),
      }))
      .filter((candidate): candidate is HospitalCandidate & { capacity: NonNullable<HospitalCandidate["capacity"]> } => Boolean(candidate.capacity));
    const recommendationComparison = scenarios.map((scenario) => {
      const persistedTop = firstFeasible(fullRanking(scenario));
      const freshRanking = rankHospitals({
        candidates: freshCandidates,
        incidentLocation: scenario.location,
        orParameters: scenario.caseDef.params,
        limit: freshCandidates.length,
      }).rankings;
      const freshTop = firstFeasible(freshRanking);
      return {
        scenarioId: scenario.scenarioId,
        caseTitle: scenario.caseDef.title,
        locationLabel: scenario.location.label,
        persistedTop: summarize(persistedTop),
        freshTop: summarize(freshTop),
        changed: Boolean(persistedTop && freshTop && persistedTop.hospital.hospital.hospital_id !== freshTop.hospital.hospital.hospital_id),
        persistedNoFeasible: !persistedTop,
        freshNoFeasible: !freshTop,
      };
    });
    const changedRows = rows.filter((row) => isNumber(row.absoluteBedChange) && row.absoluteBedChange > 0);
    return {
      summary: {
        attempted: true,
        fetchedAt: refreshed.fetchedAt,
        districtsRequested: districts.length,
        freshActiveRows: freshCandidates.length,
        comparableHospitalCount: rows.length,
        changedErBedRows: changedRows.length,
        crossedPositiveBoundaryRows: rows.filter((row) => row.crossedPositiveBoundary).length,
        medianAbsoluteBedChange: percentile(changedRows.map((row) => row.absoluteBedChange).filter(isNumber), 0.5),
        maxAbsoluteBedChange: percentile(changedRows.map((row) => row.absoluteBedChange).filter(isNumber), 1),
        changedTopRecommendationCount: recommendationComparison.filter((row) => row.changed).length,
        freshNoFeasibleCount: recommendationComparison.filter((row) => row.freshNoFeasible).length,
      },
      rows: rows.sort((a, b) => (b.absoluteBedChange ?? -1) - (a.absoluteBedChange ?? -1)).slice(0, 12),
      recommendationComparison: recommendationComparison.filter((row) => row.changed || row.freshNoFeasible).slice(0, 12),
    };
  } catch (error) {
    return {
      summary: {
        attempted: true,
        reason: error instanceof Error ? error.message : String(error),
      },
      rows: [],
      recommendationComparison: [],
    };
  }
}

function runStaticProfileGap() {
  const data = loadHospitalData();
  const profiles = data.staticProfiles;
  const rows = profiles.map((profile) => ({
    hospitalId: profile.hospital_id,
    hospitalName: profile.hospital_name,
    matchConfidence: profile.match_confidence,
    hasDoctorCount: isNumber(profile.total_doctors),
    hasSpecialistCount: isNumber(profile.specialist_doctors),
    hasTotalBeds: isNumber(profile.total_beds),
    hasIcuBeds: isNumber(profile.icu_beds),
  }));
  const usableProfiles = rows.filter((row) => row.matchConfidence === "high" || row.matchConfidence === "medium");
  return {
    summary: {
      staticProfileRows: rows.length,
      usableMatchedProfiles: usableProfiles.length,
      rowsWithDoctorCount: rows.filter((row) => row.hasDoctorCount).length,
      rowsWithSpecialistCount: rows.filter((row) => row.hasSpecialistCount).length,
      rowsWithTotalBeds: rows.filter((row) => row.hasTotalBeds).length,
      rowsWithIcuBeds: rows.filter((row) => row.hasIcuBeds).length,
      conclusion: "현재 정적 프로필은 병원 규모 보정 검증에 사용할 수 없고, 목적함수의 정적 신뢰도 항은 사실상 중립이다.",
    },
    examples: rows.slice(0, 8),
  };
}

function fullRanking(scenario: Scenario) {
  const data = loadHospitalData();
  return rankHospitals({
    candidates: data.primaryCandidates,
    incidentLocation: scenario.location,
    orParameters: scenario.caseDef.params,
    limit: data.primaryCandidates.length,
  }).rankings;
}

function firstFeasible(ranking: RankedHospital[]) {
  return ranking.find((row) => row.feasible) ?? null;
}

function chooseByAdjustedObjective(ranking: RankedHospital[], bedScale: number, resourceScale: number) {
  return [...ranking]
    .filter((row) => row.feasible)
    .sort((a, b) => adjustedCost(a, bedScale, resourceScale) - adjustedCost(b, bedScale, resourceScale) || a.estimatedTravelTimeMin - b.estimatedTravelTimeMin)[0] ?? null;
}

function adjustedCost(row: RankedHospital, bedScale: number, resourceScale: number) {
  const terms = row.objectiveTerms;
  return (
    terms.travel_cost +
    terms.bed_buffer_risk * bedScale +
    terms.resource_margin_risk * resourceScale +
    terms.level_penalty +
    terms.static_reliability_penalty
  );
}

function parameterVariants(params: OrParameters) {
  const variants: Array<{ name: string; params: OrParameters }> = [];
  variants.push({ name: "중증도 1단계 낮춤", params: { ...params, severity_level: clampScore(params.severity_level - 1) } });
  variants.push({ name: "중증도 1단계 높임", params: { ...params, severity_level: clampScore(params.severity_level + 1) } });
  variants.push({ name: "악화위험 1단계 낮춤", params: { ...params, deterioration_risk: clampScore(params.deterioration_risk - 1) } });
  variants.push({ name: "악화위험 1단계 높임", params: { ...params, deterioration_risk: clampScore(params.deterioration_risk + 1) } });
  variants.push({ name: "취약성 1단계 낮춤", params: { ...params, vulnerability_level: clampScore(params.vulnerability_level - 1) } });
  variants.push({ name: "취약성 1단계 높임", params: { ...params, vulnerability_level: clampScore(params.vulnerability_level + 1) } });
  variants.push({ name: "최대 이송시간 한 단계 축소", params: { ...params, max_transport_time_min: moveTransportBucket(params.max_transport_time_min, -1) } });
  variants.push({ name: "최대 이송시간 한 단계 확대", params: { ...params, max_transport_time_min: moveTransportBucket(params.max_transport_time_min, 1) } });
  return variants.filter((variant) => JSON.stringify(variant.params) !== JSON.stringify(params));
}

function resourceVariants(params: OrParameters) {
  const variants: Array<{ name: string; params: OrParameters }> = [];
  for (const resource of params.required_resources) {
    variants.push({
      name: `필수 자원 누락: ${formatResource(resource)}`,
      params: {
        ...params,
        required_resources: params.required_resources.filter((item) => item !== resource),
      },
    });
  }
  const additions: Resource[] = ["ct", "surgery_capability", "trauma_resuscitation"];
  for (const resource of additions) {
    if (params.required_resources.includes(resource)) continue;
    variants.push({
      name: `필수 자원 과잉 추가: ${formatResource(resource)}`,
      params: {
        ...params,
        required_resources: [...params.required_resources, resource],
      },
    });
  }
  return variants;
}

function summarize(row: RankedHospital | null): TopChoice | null {
  if (!row) return null;
  return {
    hospitalId: row.hospital.hospital.hospital_id,
    hospitalName: row.hospital.hospital.hospital_name,
    district: row.hospital.hospital.district,
    availableErBeds: row.availableErBeds,
    estimatedTravelTimeMin: row.estimatedTravelTimeMin,
    timeSlackMin: row.timeSlackMin,
    bedBufferTier: row.bedBufferTier,
    totalCost: row.totalCost,
  };
}

function buildGapReport(result: GapEvaluationResult) {
  const lines: string[] = [];
  const capacityDrift = result.tests.liveCapacityDrift.summary as Record<string, unknown>;
  lines.push("# OR 모델 추가 한계 검증 리포트");
  lines.push("");
  lines.push(`생성 시각: ${result.generatedAt}`);
  lines.push("");
  lines.push("## 핵심 결론");
  lines.push("");
  lines.push(
    `추가 검증은 기존 40개 시나리오에 대해 패널티 계수, 이송시간 대체값, LLM 파라미터 흔들림, 필수 자원 추출 오류, 실시간 병상 드리프트, 정적 병원 프로필 공백을 각각 고립해서 테스트했다.`,
  );
  lines.push(
    `패널티 계수 격자에서는 최대 ${result.tests.penaltySensitivity.summary.maxChangedTopRecommendationCount}/40개 시나리오의 1순위 추천이 바뀌었다. 즉 현재 계수는 실제 순위에 강하게 작동하므로, 연구 주장에는 계수 보정 근거가 필요하다.`,
  );
  lines.push(
    `이송시간을 20% 과소추정했다고 가정하면 ${result.tests.transportProxyShock.summary.exceededAtTwentyPercentShock}개 추천이 최대 이송시간을 초과하고 ${result.tests.transportProxyShock.summary.tightAtTwentyPercentShock}개 추천이 5분 미만 여유시간으로 빠듯해진다.`,
  );
  lines.push(
    `LLM 파라미터 1단계 흔들림은 ${result.tests.llmParameterNoise.summary.changedTopRecommendationCount}/${result.tests.llmParameterNoise.summary.testedVariantCount}개 변형에서 1순위 추천을 바꿨고, 필수 자원 누락/과잉 추출은 ${result.tests.resourceExtractionNoise.summary.changedTopRecommendationCount}/${result.tests.resourceExtractionNoise.summary.testedVariantCount}개 변형에서 1순위 추천을 바꿨다.`,
  );
  if (capacityDrift.attempted === true && typeof capacityDrift.changedTopRecommendationCount === "number") {
    lines.push(
      `NEMC 실시간 병상 재호출 결과, 저장된 스냅샷 대비 ${capacityDrift.changedErBedRows}개 병원의 응급실 가용 병상 수가 달랐고, 재호출 병상 기준으로 재평가하면 ${capacityDrift.changedTopRecommendationCount}/40개 시나리오의 1순위 추천이 바뀌었다.`,
    );
  } else {
    lines.push(`NEMC 실시간 병상 재호출 검증은 실패했다. 사유: ${String(capacityDrift.reason ?? "알 수 없음")}`);
  }
  lines.push("");
  appendPenaltySensitivity(lines, result.tests.penaltySensitivity);
  appendTransportShock(lines, result.tests.transportProxyShock);
  appendLlmNoise(lines, result.tests.llmParameterNoise);
  appendResourceNoise(lines, result.tests.resourceExtractionNoise);
  appendCapacityDrift(lines, result.tests.liveCapacityDrift);
  appendStaticGap(lines, result.tests.staticProfileGap);
  lines.push("## 추가 검증 후 판단");
  lines.push("");
  lines.push("- 모델 구조 자체는 병상 버퍼와 자원 여유를 실제 순위에 반영하고 있다.");
  lines.push("- 다만 연구 수준으로 주장하려면 계수 보정, 이송시간 산정, 실시간 병상 갱신 주기, LLM 파라미터 추출 안정성을 별도 실험 설계로 계속 묶어야 한다.");
  lines.push("- 특히 실시간 병상 재호출에서 추천이 바뀌는 경우가 관찰되면, 저장 스냅샷 기반 데모와 실시간 API 기반 데모를 명확히 구분해야 한다.");
  lines.push("- HIRA 의사 수/총 병상 수는 아직 데이터가 없으므로 현재 모델의 연구 주장에 포함하면 안 된다. 확보 전까지는 정적 신뢰도 항을 중립 항으로만 설명해야 한다.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function appendPenaltySensitivity(lines: string[], test: ReturnType<typeof runPenaltySensitivity>) {
  lines.push("<details>");
  lines.push("<summary>추가 테스트 1. 패널티 계수 민감도 검증</summary>");
  lines.push("");
  lines.push("### 목적");
  lines.push("병상 버퍼 패널티와 자원 여유 패널티가 수작업 계수에 얼마나 민감한지 확인한다.");
  lines.push("");
  lines.push("### 결과");
  lines.push(`- 테스트한 계수 조합 수: ${test.summary.testedGridCount}`);
  lines.push(`- 가장 많이 1순위 추천이 바뀐 조합의 변경 수: ${test.summary.maxChangedTopRecommendationCount}/40`);
  lines.push(`- 20개 이상 시나리오에서 1순위가 바뀐 고불안정 조합 수: ${test.summary.highInstabilityGridCount}`);
  lines.push("");
  lines.push("| 병상 패널티 배율 | 자원 패널티 배율 | 1순위 변경 수 | 변경률 | 선택 병상 중앙값 | 선택 이송시간 중앙값 |");
  lines.push("|---:|---:|---:|---:|---:|---:|");
  for (const row of test.rows.filter((item) => item.bedScale === 0 || item.bedScale === 1 || item.bedScale === 2 || item.bedScale === 3)) {
    lines.push(
      `| ${row.bedScale} | ${row.resourceScale} | ${row.changedTopRecommendationCount} | ${formatPercent(row.changedTopRecommendationRate)} | ${formatNumber(row.medianAdjustedTopBeds)} | ${formatNumber(row.medianAdjustedTopTravelMin)} |`,
    );
  }
  lines.push("");
  lines.push("### 포렌식 해석");
  lines.push("계수 변화가 추천을 많이 바꾸면 목적함수가 실제로 작동한다는 장점과, 계수 보정 근거가 필요하다는 한계가 동시에 드러난다. 발표에서는 계수를 임의 상수로 말하지 말고, 민감도 분석으로 보정 필요성을 인정해야 한다.");
  lines.push("</details>");
  lines.push("");
}

function appendTransportShock(lines: string[], test: ReturnType<typeof runTransportProxyShock>) {
  lines.push("<details>");
  lines.push("<summary>추가 테스트 2. 이송시간 대체값 충격 검증</summary>");
  lines.push("");
  lines.push("### 목적");
  lines.push("현재 이송시간이 직선거리 기반 대체값이므로, 실제 도로 시간보다 과소추정됐을 때 추천이 얼마나 취약한지 확인한다.");
  lines.push("");
  lines.push("### 결과");
  lines.push("| 이송시간 증가 가정 | 최대 이송시간 초과 | 5분 미만 여유 | 안정권 |");
  lines.push("|---:|---:|---:|---:|");
  for (const row of test.rows) {
    lines.push(`| ${Math.round((row.travelMultiplier - 1) * 100)}% | ${row.exceededTopRecommendationCount} | ${row.tightButStillFeasibleCount} | ${row.robustCount} |`);
  }
  lines.push("");
  lines.push("### 취약 사례");
  for (const example of test.rows.find((row) => row.travelMultiplier === 1.2)?.examples ?? []) {
    lines.push(
      `- ${example.scenarioId} (${example.caseTitle}, ${example.locationLabel}): 기존 ${example.top?.hospitalName ?? "없음"}, 기존 ${example.top?.estimatedTravelTimeMin ?? "없음"}분, 보정 후 ${example.adjustedTravelTimeMin ?? "없음"}분, 여유시간 ${example.adjustedSlackMin ?? "없음"}분`,
    );
  }
  lines.push("");
  lines.push("### 포렌식 해석");
  lines.push("20% 수준의 과소추정만으로도 빠듯하거나 제약을 넘는 추천이 생긴다면, 연구 문서에서는 현재 시간을 실제 경로시간이 아니라 임시 대체값으로 명시해야 한다. 실제 연구 수준으로 올리려면 경로 API 또는 실제 구급 이송시간 데이터가 필요하다.");
  lines.push("</details>");
  lines.push("");
}

function appendLlmNoise(lines: string[], test: ReturnType<typeof runLlmParameterNoise>) {
  lines.push("<details>");
  lines.push("<summary>추가 테스트 3. LLM OR 파라미터 1단계 흔들림 검증</summary>");
  lines.push("");
  lines.push("### 목적");
  lines.push("LLM이 중증도, 악화위험, 취약성, 최대 이송시간을 한 단계 다르게 추출했을 때 추천이 얼마나 바뀌는지 확인한다.");
  lines.push("");
  lines.push("### 결과");
  lines.push(`- 전체 변형 수: ${test.summary.testedVariantCount}`);
  lines.push(`- 1순위 추천 변경 수: ${test.summary.changedTopRecommendationCount} (${formatPercent(test.summary.changedTopRecommendationRate)})`);
  lines.push(`- 제약 만족 후보 없음 수: ${test.summary.noFeasibleCount}`);
  lines.push("");
  lines.push("| 변형 | 변형 수 | 1순위 변경 수 | 변경률 | 제약 만족 후보 없음 |");
  lines.push("|---|---:|---:|---:|---:|");
  for (const row of test.grouped) {
    lines.push(`| ${row.variant} | ${row.count} | ${row.changedTopRecommendationCount} | ${formatPercent(row.changedTopRecommendationRate)} | ${row.noFeasibleCount} |`);
  }
  lines.push("");
  lines.push("### 포렌식 해석");
  lines.push("OR 엔진의 안정성은 LLM 구조화 출력의 안정성과 분리해서 봐야 한다. 특히 최대 이송시간이나 위험도 점수의 한 단계 오차가 추천을 자주 바꾸면, LLM 출력 검증과 재질문/수정 루프가 연구 설계에 필요하다.");
  lines.push("</details>");
  lines.push("");
}

function appendResourceNoise(lines: string[], test: ReturnType<typeof runResourceExtractionNoise>) {
  lines.push("<details>");
  lines.push("<summary>추가 테스트 4. 필수 자원 누락/과잉 추출 검증</summary>");
  lines.push("");
  lines.push("### 목적");
  lines.push("LLM이 필수 자원을 하나 빠뜨리거나 불필요한 자원을 추가했을 때 추천이 얼마나 바뀌는지 확인한다.");
  lines.push("");
  lines.push("### 결과");
  lines.push(`- 전체 변형 수: ${test.summary.testedVariantCount}`);
  lines.push(`- 1순위 추천 변경 수: ${test.summary.changedTopRecommendationCount} (${formatPercent(test.summary.changedTopRecommendationRate)})`);
  lines.push(`- 제약 만족 후보 없음 수: ${test.summary.noFeasibleCount}`);
  lines.push("");
  lines.push("| 변형 | 변형 수 | 1순위 변경 수 | 변경률 | 제약 만족 후보 없음 |");
  lines.push("|---|---:|---:|---:|---:|");
  for (const row of test.grouped) {
    lines.push(`| ${row.variant} | ${row.count} | ${row.changedTopRecommendationCount} | ${formatPercent(row.changedTopRecommendationRate)} | ${row.noFeasibleCount} |`);
  }
  lines.push("");
  lines.push("### 포렌식 해석");
  lines.push("필수 자원은 하드 제약에 들어가므로 LLM 추출 오류의 영향이 크다. 이 테스트에서 변경률이 높은 자원은 2단계 LLM 출력 후 결정론적 검증기에서 강하게 점검해야 한다.");
  lines.push("</details>");
  lines.push("");
}

function appendCapacityDrift(lines: string[], test: Awaited<ReturnType<typeof runLiveCapacityDrift>>) {
  lines.push("<details>");
  lines.push("<summary>추가 테스트 5. NEMC 실시간 병상 재호출 드리프트 검증</summary>");
  lines.push("");
  lines.push("### 목적");
  lines.push("저장된 병상 스냅샷과 현재 API 재호출 결과가 얼마나 달라지는지, 그리고 그 차이가 추천 순위에 영향을 주는지 확인한다.");
  lines.push("");
  lines.push("### 결과");
  if (test.summary.attempted !== true || typeof test.summary.changedErBedRows !== "number") {
    lines.push(`- 실행 실패 또는 미실행: ${String(test.summary.reason ?? "알 수 없음")}`);
  } else {
    lines.push(`- 재호출 시각: ${test.summary.fetchedAt}`);
    lines.push(`- 재호출 대상 구 수: ${test.summary.districtsRequested}`);
    lines.push(`- 현재 API에서 확인된 활성 병원 수: ${test.summary.freshActiveRows}`);
    lines.push(`- 응급실 가용 병상 수가 달라진 병원 수: ${test.summary.changedErBedRows}`);
    lines.push(`- 양수/비양수 경계를 넘은 병원 수: ${test.summary.crossedPositiveBoundaryRows}`);
    lines.push(`- 병상 변화 절댓값 중앙값: ${formatNumber(test.summary.medianAbsoluteBedChange)}`);
    lines.push(`- 병상 변화 절댓값 최댓값: ${formatNumber(test.summary.maxAbsoluteBedChange)}`);
    lines.push(`- 재호출 병상 기준 1순위 추천 변경 수: ${test.summary.changedTopRecommendationCount}/40`);
    lines.push(`- 재호출 병상 기준 제약 만족 후보 없음 수: ${test.summary.freshNoFeasibleCount}`);
    lines.push("");
    lines.push("### 병상 변화가 큰 병원 예시");
    for (const row of test.rows.slice(0, 8)) {
      lines.push(`- ${row.hospitalName} (${row.district}): 저장 ${row.persistedErBeds}개 -> 현재 ${row.freshErBeds}개, 변화 ${row.absoluteBedChange}`);
    }
    lines.push("");
    lines.push("### 추천 변경 예시");
    for (const row of test.recommendationComparison.slice(0, 8)) {
      lines.push(`- ${row.scenarioId}: 저장 기준 ${row.persistedTop?.hospitalName ?? "없음"} -> 현재 기준 ${row.freshTop?.hospitalName ?? "없음"}`);
    }
  }
  lines.push("");
  lines.push("### 포렌식 해석");
  lines.push("이 테스트는 가용 병상을 단순히 저장 데이터로 두면 추천이 시간에 따라 달라질 수 있음을 직접 보여준다. 실제 데모에서는 추천 직전 병상 재호출을 수행하거나, 스냅샷 시각을 결과와 함께 노출해야 한다.");
  lines.push("</details>");
  lines.push("");
}

function appendStaticGap(lines: string[], test: ReturnType<typeof runStaticProfileGap>) {
  lines.push("<details>");
  lines.push("<summary>추가 테스트 6. HIRA 정적 병원 프로필 공백 검증</summary>");
  lines.push("");
  lines.push("### 목적");
  lines.push("의사 수, 전문의 수, 총 병상 수, 중환자실 병상 수가 실제 목적함수 보정에 쓸 수 있는 수준으로 적재되어 있는지 확인한다.");
  lines.push("");
  lines.push("### 결과");
  lines.push(`- 정적 프로필 행 수: ${test.summary.staticProfileRows}`);
  lines.push(`- 중간 이상 매칭 신뢰도 프로필 수: ${test.summary.usableMatchedProfiles}`);
  lines.push(`- 의사 수가 있는 행 수: ${test.summary.rowsWithDoctorCount}`);
  lines.push(`- 전문의 수가 있는 행 수: ${test.summary.rowsWithSpecialistCount}`);
  lines.push(`- 총 병상 수가 있는 행 수: ${test.summary.rowsWithTotalBeds}`);
  lines.push(`- 중환자실 병상 수가 있는 행 수: ${test.summary.rowsWithIcuBeds}`);
  lines.push("");
  lines.push("### 포렌식 해석");
  lines.push(test.summary.conclusion);
  lines.push("따라서 현재 연구 주장은 실시간 NEMC 병상/자원 기반 추천으로 제한해야 하며, 의사 수 기반 안정성 보정은 HIRA 권한 확보 후 별도 검증 전까지 주장하면 안 된다.");
  lines.push("</details>");
  lines.push("");
}

function combineReports(gapReport: string) {
  const baseReportPath = path.resolve("outputs/or-evaluation/latest/report.md");
  const baseReport = fs.existsSync(baseReportPath) ? fs.readFileSync(baseReportPath, "utf8").trimEnd() : "# OR 모델 평가 리포트\n";
  return `${baseReport}\n\n---\n\n${gapReport}`;
}

function clampScore(value: number) {
  return Math.min(5, Math.max(1, value));
}

function moveTransportBucket(value: OrParameters["max_transport_time_min"], direction: -1 | 1) {
  const index = transportBuckets.indexOf(value);
  const nextIndex = Math.min(transportBuckets.length - 1, Math.max(0, index + direction));
  return transportBuckets[nextIndex];
}

function groupRows<T>(rows: T[], keyFn: (row: T) => string) {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyFn(row);
    map.set(key, [...(map.get(key) ?? []), row]);
  }
  return [...map.entries()];
}

function percentile(values: number[], p: number) {
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

function formatResource(resource: Resource) {
  const labels: Record<Resource, string> = {
    ct: "CT",
    xray: "엑스레이",
    orthopedic_trauma: "정형외과 외상 대응",
    surgery_capability: "수술 가능성",
    bleeding_control: "출혈 처치",
    trauma_resuscitation: "외상 소생",
    cath_lab_pci: "심혈관 중재술(PCI)",
    thrombectomy_thrombolysis: "혈전 제거/용해",
    airway_ventilation: "기도/인공호흡",
    defibrillation_resuscitation: "제세동/소생",
    critical_care: "중환자 집중치료",
  };
  return labels[resource];
}

function loadSecret(name: string) {
  if (process.env[name]) return process.env[name];
  for (const file of [".env.local", ".env"]) {
    const value = readEnvValue(file, name);
    if (value) return value;
  }
  return "";
}

function readEnvValue(filePath: string, name: string) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) return "";
  const line = fs
    .readFileSync(resolved, "utf8")
    .split(/\r?\n/)
    .find((item) => item.trim().startsWith(`${name}=`));
  if (!line) return "";
  return line.slice(line.indexOf("=") + 1).trim().replace(/^['"]|['"]$/g, "");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
