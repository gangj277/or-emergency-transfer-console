import type { OrParameters } from "./types";
import { TIME_SOFT_FLAG, type RankedHospital } from "./recommendation";

export const GOLD_LOCATION_SET_VERSION = "seoul_balanced_v1" as const;

export type SeoulZone = "north" | "south" | "west" | "east" | "central" | "outer";

export type SeoulDistrictAnchor = {
  district: string;
  zone: SeoulZone;
  lat: number;
  lon: number;
};

export const SEOUL_DISTRICT_ANCHORS: SeoulDistrictAnchor[] = [
  { district: "종로구", zone: "central", lat: 37.5735, lon: 126.9788 },
  { district: "중구", zone: "central", lat: 37.5636, lon: 126.9976 },
  { district: "용산구", zone: "central", lat: 37.5326, lon: 126.9904 },
  { district: "성동구", zone: "east", lat: 37.5633, lon: 127.0369 },
  { district: "광진구", zone: "east", lat: 37.5385, lon: 127.0823 },
  { district: "동대문구", zone: "east", lat: 37.5744, lon: 127.0396 },
  { district: "중랑구", zone: "east", lat: 37.6063, lon: 127.0925 },
  { district: "성북구", zone: "north", lat: 37.5894, lon: 127.0167 },
  { district: "강북구", zone: "north", lat: 37.6396, lon: 127.0257 },
  { district: "도봉구", zone: "outer", lat: 37.6688, lon: 127.0471 },
  { district: "노원구", zone: "outer", lat: 37.6543, lon: 127.0568 },
  { district: "은평구", zone: "north", lat: 37.6027, lon: 126.9291 },
  { district: "서대문구", zone: "west", lat: 37.5791, lon: 126.9368 },
  { district: "마포구", zone: "west", lat: 37.5663, lon: 126.9019 },
  { district: "양천구", zone: "west", lat: 37.5169, lon: 126.8664 },
  { district: "강서구", zone: "outer", lat: 37.5509, lon: 126.8495 },
  { district: "구로구", zone: "west", lat: 37.4955, lon: 126.8877 },
  { district: "금천구", zone: "outer", lat: 37.4569, lon: 126.8955 },
  { district: "영등포구", zone: "west", lat: 37.5264, lon: 126.8963 },
  { district: "동작구", zone: "south", lat: 37.5124, lon: 126.9393 },
  { district: "관악구", zone: "south", lat: 37.4784, lon: 126.9516 },
  { district: "서초구", zone: "south", lat: 37.4837, lon: 127.0324 },
  { district: "강남구", zone: "south", lat: 37.5172, lon: 127.0473 },
  { district: "송파구", zone: "east", lat: 37.5145, lon: 127.1059 },
  { district: "강동구", zone: "outer", lat: 37.5301, lon: 127.1238 },
];

export type GoldCase = {
  case_id: string;
  labels?: Record<string, unknown>;
  selection: {
    category: string;
    or_relevance_reason?: string;
    key_medical_phrases?: string[];
  };
  transcript: string;
  [key: string]: unknown;
};

export type SyntheticLocation = SeoulDistrictAnchor & {
  location_set_version: typeof GOLD_LOCATION_SET_VERSION;
  assignment_reason: string;
};

export type GoldCaseWithSyntheticLocation = GoldCase & {
  synthetic_location: SyntheticLocation;
};

export type HospitalSummary = {
  rank?: number;
  hospitalId: string;
  hospitalName: string;
  district: string;
  feasible: boolean;
  estimatedTravelTimeMin: number;
  timeSlackMin: number;
  distanceKm: number;
  availableErBeds: number | null;
  bedBufferTier: string;
  desirability: number;
  overWindow: boolean;
  objectiveTerms: RankedHospital["objectiveTerms"];
  constraintViolations: string[];
  softFlags: string[];
  withinMaxTransportTime: boolean;
};

export type GoldE2eCaseMetric = {
  case_id: string;
  category: string;
  synthetic_location: Pick<SyntheticLocation, "district" | "zone">;
  pipeline_status: "succeeded" | "failed";
  pipeline_latency_ms: number;
  stage1_fact_count: number;
  stage1_missing_info_count: number;
  stage2_parameters: OrParameters | null;
  validation_failure_count: number;
  validation_warning_count: number;
  ranking_status: "succeeded" | "skipped" | "failed";
  strict_feasible_count: number | null;
  within_time_feasible_count?: number | null;
  soft_time_exceeded_candidate_count?: number | null;
  top1: HospitalSummary | null;
  nearest_feasible_top1: HospitalSummary | null;
};

export function assignSyntheticLocations(cases: GoldCase[]): GoldCaseWithSyntheticLocation[] {
  const failures = validateGoldCases(cases);
  if (failures.length > 0) throw new Error(`Invalid gold cases: ${failures.join("; ")}`);

  const locationSlots = SEOUL_DISTRICT_ANCHORS.flatMap((anchor) => Array.from({ length: 4 }, () => anchor));
  const ordered = roundRobinByCategory(cases);
  const locationByCaseId = new Map<string, SyntheticLocation>();

  ordered.forEach((goldCase, index) => {
    const anchor = locationSlots[index];
    locationByCaseId.set(goldCase.case_id, {
      ...anchor,
      location_set_version: GOLD_LOCATION_SET_VERSION,
      assignment_reason: `category-balanced round-robin assignment for ${goldCase.selection.category}; no source address used`,
    });
  });

  return cases.map((goldCase) => ({
    ...goldCase,
    synthetic_location: locationByCaseId.get(goldCase.case_id)!,
  }));
}

export function validateGoldCases(cases: GoldCase[]) {
  const failures: string[] = [];
  if (cases.length !== 100) failures.push(`expected 100 cases, got ${cases.length}`);
  const seen = new Set<string>();
  cases.forEach((goldCase, index) => {
    if (!goldCase.case_id) failures.push(`case at index ${index} missing case_id`);
    if (seen.has(goldCase.case_id)) failures.push(`duplicate case_id ${goldCase.case_id}`);
    seen.add(goldCase.case_id);
    if (!goldCase.transcript?.trim()) failures.push(`${goldCase.case_id} missing transcript`);
    if (!goldCase.selection?.category) failures.push(`${goldCase.case_id} missing selection.category`);
  });
  return failures;
}

export function summarizeLocationCoverage(cases: GoldCaseWithSyntheticLocation[]) {
  return {
    caseCount: cases.length,
    locationSetVersion: GOLD_LOCATION_SET_VERSION,
    districtCounts: countBy(cases, (item) => item.synthetic_location.district),
    zoneCounts: countBy(cases, (item) => item.synthetic_location.zone),
    categoryByDistrict: Object.fromEntries(
      SEOUL_DISTRICT_ANCHORS.map((anchor) => [
        anchor.district,
        countBy(
          cases.filter((item) => item.synthetic_location.district === anchor.district),
          (item) => item.selection.category,
        ),
      ]),
    ),
  };
}

export function assertSyntheticLocationCoverage(cases: GoldCaseWithSyntheticLocation[]) {
  const failures: string[] = [];
  const districtCounts = countBy(cases, (item) => item.synthetic_location.district);
  for (const anchor of SEOUL_DISTRICT_ANCHORS) {
    if (districtCounts[anchor.district] !== 4) failures.push(`${anchor.district} has ${districtCounts[anchor.district] ?? 0} cases`);
  }
  for (const item of cases) {
    const { lat, lon } = item.synthetic_location;
    if (lat < 37.41 || lat > 37.72 || lon < 126.74 || lon > 127.2) {
      failures.push(`${item.case_id} synthetic location is outside Seoul bounds`);
    }
  }
  return failures;
}

export function summarizeRankedHospital(item: RankedHospital | null | undefined): HospitalSummary | null {
  if (!item) return null;
  return {
    rank: item.rank,
    hospitalId: item.hospital.hospital.hospital_id,
    hospitalName: item.hospital.hospital.hospital_name,
    district: item.hospital.hospital.district,
    feasible: item.feasible,
    estimatedTravelTimeMin: item.estimatedTravelTimeMin,
    timeSlackMin: item.timeSlackMin,
    distanceKm: item.distanceKm,
    availableErBeds: item.availableErBeds,
    bedBufferTier: item.bedBufferTier,
    desirability: item.desirability,
    overWindow: !item.checks.withinMaxTransportTime,
    objectiveTerms: item.objectiveTerms,
    constraintViolations: item.constraintViolations,
    softFlags: item.softFlags,
    withinMaxTransportTime: item.checks.withinMaxTransportTime,
  };
}

export function chooseNearestFeasible(ranking: RankedHospital[]) {
  return [...ranking].filter((item) => item.feasible).sort((a, b) => a.distanceKm - b.distanceKm)[0] ?? null;
}

export function buildGoldE2eSummary(rows: GoldE2eCaseMetric[]) {
  const succeeded = rows.filter((row) => row.pipeline_status === "succeeded");
  const failed = rows.filter((row) => row.pipeline_status === "failed");
  const ranked = rows.filter((row) => row.ranking_status === "succeeded");
  const noFeasible = ranked.filter((row) => row.strict_feasible_count === 0);
  const rowsWithWithinTimeMetric = ranked.filter((row) => typeof row.within_time_feasible_count === "number");
  const noWithinTimeFeasible = rowsWithWithinTimeMetric.filter((row) => row.within_time_feasible_count === 0);
  const top1SoftTimeExceeded = ranked.filter((row) => isTimeSoftExceeded(row.top1));
  const changedVsNearest = ranked.filter(
    (row) => row.top1 && row.nearest_feasible_top1 && row.top1.hospitalId !== row.nearest_feasible_top1.hospitalId,
  );

  return {
    caseCount: rows.length,
    generatedAt: new Date().toISOString(),
    distributions: {
      categoryCounts: countBy(rows, (row) => row.category),
      districtCounts: countBy(rows, (row) => row.synthetic_location.district),
      zoneCounts: countBy(rows, (row) => row.synthetic_location.zone),
    },
    pipeline: {
      succeeded: succeeded.length,
      failed: failed.length,
      validationFailureCases: rows.filter((row) => row.validation_failure_count > 0).length,
      validationWarningCases: rows.filter((row) => row.validation_warning_count > 0).length,
      medianLatencyMs: percentile(succeeded.map((row) => row.pipeline_latency_ms), 0.5),
    },
    stage1: {
      medianClinicalFactCount: percentile(succeeded.map((row) => row.stage1_fact_count), 0.5),
      medianMissingInfoCount: percentile(succeeded.map((row) => row.stage1_missing_info_count), 0.5),
      lowFactCountCases: succeeded.filter((row) => row.stage1_fact_count < 4).map((row) => row.case_id),
    },
    stage2: {
      incidentTypeCounts: countBy(
        succeeded.filter((row) => row.stage2_parameters),
        (row) => row.stage2_parameters!.incident_type,
      ),
      maxTransportTimeCounts: countBy(
        succeeded.filter((row) => row.stage2_parameters),
        (row) => String(row.stage2_parameters!.max_transport_time_min),
      ),
      severityCounts: countBy(
        succeeded.filter((row) => row.stage2_parameters),
        (row) => String(row.stage2_parameters!.severity_level),
      ),
    },
    ranking: {
      succeeded: ranked.length,
      skippedOrFailed: rows.length - ranked.length,
      noFeasibleCount: noFeasible.length,
      noHardFeasibleCount: noFeasible.length,
      noFeasibleCaseIds: noFeasible.map((row) => row.case_id),
      noWithinTimeFeasibleCount: noWithinTimeFeasible.length,
      noWithinTimeFeasibleCaseIds: noWithinTimeFeasible.map((row) => row.case_id),
      changedVsNearestCount: changedVsNearest.length,
      softTimeExceededTop1Count: top1SoftTimeExceeded.length,
      softTimeExceededTop1CaseIds: top1SoftTimeExceeded.map((row) => row.case_id),
      medianSoftTimeExceededCandidateCount: percentile(
        ranked.map((row) => row.soft_time_exceeded_candidate_count ?? Number.NaN),
        0.5,
      ),
      medianTop1Desirability: percentile(
        ranked.map((row) => row.top1?.desirability ?? Number.NaN),
        0.5,
      ),
      top1BedTierCounts: countBy(
        ranked.filter((row) => row.top1),
        (row) => row.top1!.bedBufferTier,
      ),
      lowSlackUnder5MinCount: ranked.filter(
        (row) => typeof row.top1?.timeSlackMin === "number" && row.top1.timeSlackMin >= 0 && row.top1.timeSlackMin < 5,
      ).length,
      softFlagCounts: countBy(
        ranked.flatMap((row) => row.top1?.softFlags ?? []),
        (flag) => flag,
      ),
      hardConstraintViolationCounts: countBy(
        ranked.flatMap((row) => row.top1?.constraintViolations ?? []),
        (violation) => violation,
      ),
      top1HospitalCounts: countBy(
        ranked.filter((row) => row.top1),
        (row) => row.top1!.hospitalName,
      ),
    },
  };
}

export const GOLD_E2E_MAX_WORKERS = 20;

export function clampGoldE2eWorkerCount(value: number | null | undefined, maxWorkers = GOLD_E2E_MAX_WORKERS) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(maxWorkers, Math.max(1, Math.floor(Number(value))));
}

export async function runWithConcurrency<T, R>(
  items: T[],
  workerCount: number,
  runItem: (item: T, index: number, workerId: number) => Promise<R>,
  onSettled?: (result: R, index: number) => void | Promise<void>,
) {
  const boundedWorkerCount = Math.min(items.length, clampGoldE2eWorkerCount(workerCount));
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function runWorker(workerId: number) {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;

      const result = await runItem(items[index], index, workerId);
      results[index] = result;
      await onSettled?.(result, index);
    }
  }

  await Promise.all(Array.from({ length: boundedWorkerCount }, (_, index) => runWorker(index + 1)));
  return results;
}

function roundRobinByCategory(cases: GoldCase[]) {
  const groups = new Map<string, GoldCase[]>();
  for (const goldCase of cases) {
    const key = goldCase.selection.category;
    groups.set(key, [...(groups.get(key) ?? []), goldCase]);
  }
  const categories = [...groups.keys()].sort();
  const ordered: GoldCase[] = [];
  while (ordered.length < cases.length) {
    for (const category of categories) {
      const next = groups.get(category)?.shift();
      if (next) ordered.push(next);
    }
  }
  return ordered;
}

export function countBy<T>(items: T[], getKey: (item: T) => string) {
  return items.reduce<Record<string, number>>((acc, item) => {
    const key = getKey(item);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

function percentile(values: number[], p: number) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[index];
}

function isTimeSoftExceeded(item: HospitalSummary | null) {
  return Boolean(item?.softFlags.includes(TIME_SOFT_FLAG) || (typeof item?.timeSlackMin === "number" && item.timeSlackMin < 0));
}
