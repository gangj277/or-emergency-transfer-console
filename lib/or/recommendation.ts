import { OR_COST_CONFIG, OR_UTILITY_V3_CONFIG } from "./cost-config";
import type { TravelEstimate } from "./travel-matrix";
import type {
  Department,
  HospitalCandidate,
  HospitalCapacity,
  HospitalLevel,
  LocationPoint,
  OrParameters,
  Resource,
} from "./types";

// Precomputed travel times keyed by hospital_id (from the Kakao road-time matrix).
// When absent for a hospital, scoring falls back to estimateSeoulAmbulanceTravel.
export type TravelTimes = Map<string, TravelEstimate>;

const levelRank: Record<HospitalLevel, number> = {
  emergency_institution_ok: 1,
  local_center_or_above: 2,
  regional_center: 3,
};

// Resources that express a definitive-care preference rather than a minimum
// acceptance capability. These never hard-gate the feasible set; ICU-level care is
// needed after stabilization, so requiring it hard would wrongly exclude nearer ERs.
const SOFT_RESOURCES = new Set<Resource>(["critical_care"]);

export const TIME_SOFT_FLAG = "max_transport_time_soft_exceeded";

export type BedBufferTier =
  | "unknown"
  | "infeasible_full_or_overcapacity"
  | "high_risk_1_2"
  | "medium_risk_3_5"
  | "low_risk_6_10"
  | "stable_buffer_gt_10";

// normalized_utility_v3: a feasible hospital's desirability is U∈[0,1] (higher = better),
// a weighted blend of unit sub-utilities. See OR_UTILITY_V3_CONFIG for the rationale.
export type RankedHospital = {
  rank: number;
  hospital: HospitalCandidate;
  feasible: boolean;
  estimatedTravelTimeMin: number;
  timeSlackMin: number;
  distanceKm: number;
  estimatedRouteDistanceKm: number;
  availableErBeds: number | null;
  bedBufferTier: BedBufferTier;
  // Primary sort key for feasible hospitals (descending). ∈ [0,1].
  desirability: number;
  // Unit sub-utilities, each ∈ [0,1], higher = better.
  utilities: { time: number; capacity: number; capability: number };
  // Urgency-modulated weight shares (sum to 1).
  weights: { time: number; capacity: number; capability: number };
  // Weighted contributions (= weight × utility); sum to `desirability`.
  scoreBreakdown: { time: number; capacity: number; capability: number };
  acuity: number;
  objectiveTerms: {
    estimated_travel_time_min: number;
    time_slack_min: number;
    available_er_beds: number | null;
    bed_buffer_tier: BedBufferTier;
    u_time: number;
    u_capacity: number;
    u_capability: number;
    w_time: number;
    w_capacity: number;
    w_capability: number;
    capability_depth: number;
    level_adequacy: number;
    acuity: number;
    desirability: number;
  };
  constraintViolations: string[];
  // Non-binding flags (e.g. exceeded the requested transport window). The hospital
  // stays feasible (it just scores lower on u_time); surfaced for UX + diagnostics.
  softFlags: string[];
  checks: {
    withinMaxTransportTime: boolean;
    levelMatch: boolean;
    departmentMatches: Record<Department, boolean>;
    resourceMatches: Record<Resource, boolean>;
    hasAvailableErBed: boolean;
  };
};

export type ConstraintDiagnostics = {
  violationCounts: Record<string, number>;
  minimumTransportTimeForNonTimeFeasibleCandidateMin: number | null;
  nonTimeFeasibleCandidateCount: number;
  dominantRelaxationHint: string | null;
};

export function rankHospitals({
  candidates,
  incidentLocation,
  orParameters,
  limit = 10,
  travelTimes,
}: {
  candidates: HospitalCandidate[];
  incidentLocation: LocationPoint;
  orParameters: OrParameters;
  limit?: number;
  travelTimes?: TravelTimes;
}) {
  const scored = candidates
    .map((candidate) => scoreCandidate(candidate, incidentLocation, orParameters, travelTimes))
    .sort(compareRanked);
  const strictFeasibleCount = scored.filter((item) => item.feasible).length;
  const constraintDiagnostics = buildConstraintDiagnostics(scored);
  const ranked = scored.slice(0, limit).map((item, index) => ({ ...item, rank: index + 1 }));

  return {
    formulation: {
      version: "normalized_utility_v3" as const,
      objective:
        "max desirability = w_time·u_time + w_capacity·u_capacity + w_capability·u_capability  (each u∈[0,1]; weights sum to 1, urgency-modulated)",
      hardConstraints: [
        "available_er_beds > 0",
        "all required_departments available",
        "all gating required_resources available (excludes soft critical_care)",
      ],
      softPreferences: [
        "u_time: exp(−travelMin/tau) — over-window decays smoothly, no hard cutoff",
        "u_capacity: saturating live ER/OR/ICU headroom for the case",
        "u_capability: HIRA specialist depth for required departments + emergency-level adequacy",
        "urgency shifts weight share toward time + capability (not a cost multiplier)",
      ],
      candidateSetPolicy: "primary_live_capacity_only",
    },
    candidateSet: "live_capacity" as const,
    requestedLimit: limit,
    returned: ranked.length,
    strictFeasibleCount,
    relaxedFallbackUsed: strictFeasibleCount === 0,
    constraintDiagnostics,
    rankings: ranked,
  };
}

// Lexicographic ordering: feasible before infeasible; among infeasible, fewer
// violations first; then higher desirability. Keeps Stage-A feasibility crisp
// instead of melting it into the score via a 100000-style penalty.
function compareRanked(a: Omit<RankedHospital, "rank">, b: Omit<RankedHospital, "rank">) {
  if (a.feasible !== b.feasible) return a.feasible ? -1 : 1;
  if (!a.feasible && a.constraintViolations.length !== b.constraintViolations.length) {
    return a.constraintViolations.length - b.constraintViolations.length;
  }
  return b.desirability - a.desirability;
}

function buildConstraintDiagnostics(scored: Array<Omit<RankedHospital, "rank">>): ConstraintDiagnostics {
  const violationCounts = scored.reduce<Record<string, number>>((acc, item) => {
    for (const violation of item.constraintViolations) acc[violation] = (acc[violation] ?? 0) + 1;
    return acc;
  }, {});
  const nonTimeFeasible = scored.filter(
    (item) => item.constraintViolations.length === 0 && item.softFlags.includes(TIME_SOFT_FLAG),
  );
  const minimumTransportTimeForNonTimeFeasibleCandidateMin =
    nonTimeFeasible.length > 0 ? Math.min(...nonTimeFeasible.map((item) => item.estimatedTravelTimeMin)) : null;
  const strictlyWithinTimeFeasible = scored.filter(
    (item) => item.feasible && !item.softFlags.includes(TIME_SOFT_FLAG),
  );
  let dominantRelaxationHint: string | null = null;
  if (strictlyWithinTimeFeasible.length === 0 && nonTimeFeasible.length > 0) {
    dominantRelaxationHint = relaxationHint(TIME_SOFT_FLAG, minimumTransportTimeForNonTimeFeasibleCandidateMin);
  } else {
    const dominantViolation = Object.entries(violationCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    dominantRelaxationHint = dominantViolation
      ? relaxationHint(dominantViolation, minimumTransportTimeForNonTimeFeasibleCandidateMin)
      : null;
  }
  return {
    violationCounts,
    minimumTransportTimeForNonTimeFeasibleCandidateMin,
    nonTimeFeasibleCandidateCount: nonTimeFeasible.length,
    dominantRelaxationHint,
  };
}

function relaxationHint(violation: string, minimumTransportTimeForNonTimeFeasibleCandidateMin: number | null) {
  if (violation === TIME_SOFT_FLAG && minimumTransportTimeForNonTimeFeasibleCandidateMin !== null) {
    return `strict_time_window_too_tight_min_required_${minimumTransportTimeForNonTimeFeasibleCandidateMin}`;
  }
  if (violation === "required_department_missing") return "required_department_is_binding_constraint";
  if (violation === "required_resource_missing") return "required_resource_is_binding_constraint";
  if (violation === "no_positive_available_er_beds") return "live_er_bed_capacity_is_binding_constraint";
  if (violation === "minimum_hospital_level_not_met") return "minimum_hospital_level_is_binding_constraint";
  return `${violation}_is_binding_constraint`;
}

// ── v3 scoring ────────────────────────────────────────────────────────────────

function scoreCandidate(
  candidate: HospitalCandidate,
  incidentLocation: LocationPoint,
  params: OrParameters,
  travelTimes?: TravelTimes,
): Omit<RankedHospital, "rank"> {
  const dest = { lat: candidate.hospital.lat, lon: candidate.hospital.lon };
  const distanceKm = haversineKm(incidentLocation, dest);
  // Real Kakao road-time from the precomputed matrix when available; otherwise the
  // haversine heuristic (synthetic test coords / pre-build / off-matrix hospitals).
  const travelEstimate =
    travelTimes?.get(candidate.hospital.hospital_id) ?? estimateSeoulAmbulanceTravel(incidentLocation, dest);
  const estimatedTravelTimeMin = travelEstimate.minutes;
  const timeSlackMin = params.max_transport_time_min - estimatedTravelTimeMin;

  // ── Stage A: hard feasibility (binary; level & time stay soft, by design) ──
  const departmentMatches = Object.fromEntries(
    params.required_departments.map((department) => [department, hasDepartment(candidate, department)]),
  ) as Record<Department, boolean>;
  const resourceMatches = Object.fromEntries(
    params.required_resources.map((resource) => [resource, hasResource(candidate, resource)]),
  ) as Record<Resource, boolean>;
  const levelMatch = levelRank[candidate.hospital.emergency_level_model] >= levelRank[params.minimum_hospital_level];
  const withinMaxTransportTime = estimatedTravelTimeMin <= params.max_transport_time_min;
  const availableErBeds = candidate.capacity?.available_er_beds ?? null;
  const hasAvailableErBed = typeof availableErBeds === "number" && availableErBeds > 0;
  const bedBufferTier = getBedBufferTier(availableErBeds);

  const missingDepartments = Object.values(departmentMatches).filter((value) => !value).length;
  const missingResources = Object.entries(resourceMatches).filter(
    ([resource, matched]) => !matched && !SOFT_RESOURCES.has(resource as Resource),
  ).length;
  const constraintViolations = buildConstraintViolations({ hasAvailableErBed, missingDepartments, missingResources, availableErBeds });

  const softFlags: string[] = [];
  if (estimatedTravelTimeMin > params.max_transport_time_min) softFlags.push(TIME_SOFT_FLAG);

  // ── Stage B: unit sub-utilities ∈ [0,1] ──
  const uTime = computeTimeUtility(estimatedTravelTimeMin);
  const uCapacity = computeCapacityUtility(candidate, params);
  const { utility: uCapability, depth: capabilityDepth, levelAdequacy } = computeCapabilityUtility(candidate, params);

  // Urgency modulates the weight balance (not a cost multiplier).
  const acuity = computeAcuity(params);
  const weights = computeWeights(acuity);

  const contribTime = round4(weights.time * uTime);
  const contribCapacity = round4(weights.capacity * uCapacity);
  const contribCapability = round4(weights.capability * uCapability);
  const desirability = round4(contribTime + contribCapacity + contribCapability);

  return {
    hospital: candidate,
    feasible: constraintViolations.length === 0,
    estimatedTravelTimeMin,
    timeSlackMin,
    distanceKm: Number(distanceKm.toFixed(2)),
    estimatedRouteDistanceKm: travelEstimate.routeDistanceKm,
    availableErBeds,
    bedBufferTier,
    desirability,
    utilities: { time: round4(uTime), capacity: round4(uCapacity), capability: round4(uCapability) },
    weights: { time: round4(weights.time), capacity: round4(weights.capacity), capability: round4(weights.capability) },
    scoreBreakdown: { time: contribTime, capacity: contribCapacity, capability: contribCapability },
    acuity: round4(acuity),
    objectiveTerms: {
      estimated_travel_time_min: estimatedTravelTimeMin,
      time_slack_min: timeSlackMin,
      available_er_beds: availableErBeds,
      bed_buffer_tier: bedBufferTier,
      u_time: round4(uTime),
      u_capacity: round4(uCapacity),
      u_capability: round4(uCapability),
      w_time: round4(weights.time),
      w_capacity: round4(weights.capacity),
      w_capability: round4(weights.capability),
      capability_depth: round4(capabilityDepth),
      level_adequacy: round4(levelAdequacy),
      acuity: round4(acuity),
      desirability,
    },
    constraintViolations,
    softFlags,
    checks: { withinMaxTransportTime, levelMatch, departmentMatches, resourceMatches, hasAvailableErBed },
  };
}

function round4(value: number) {
  return Number(value.toFixed(4));
}

function computeAcuity(params: OrParameters) {
  const u = OR_COST_CONFIG.urgency;
  const raw =
    u.severity * (params.severity_level - 1) +
    u.deterioration * (params.deterioration_risk - 1) +
    u.vulnerability * (params.vulnerability_level - 1);
  return clamp01(raw / OR_UTILITY_V3_CONFIG.acuityMaxSum);
}

function computeWeights(acuity: number) {
  const { weights, urgencyShift } = OR_UTILITY_V3_CONFIG;
  const time = weights.time + acuity * urgencyShift.time;
  const capability = weights.capability + acuity * urgencyShift.capability;
  const capacity = weights.capacity;
  const sum = time + capability + capacity;
  return { time: time / sum, capacity: capacity / sum, capability: capability / sum };
}

function computeTimeUtility(travelMin: number) {
  return clamp01(Math.exp(-travelMin / OR_UTILITY_V3_CONFIG.uTime.tauMin));
}

function saturate(value: number | null | undefined, halfSat: number, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  if (value <= 0) return 0;
  return value / (value + halfSat);
}

function computeCapacityUtility(candidate: HospitalCandidate, params: OrParameters) {
  const cfg = OR_UTILITY_V3_CONFIG.uCapacity;
  const beds = candidate.capacity?.available_er_beds ?? null;
  // beds==null → 0 (no known headroom); feasible hospitals always have beds>0.
  const bedUtil = saturate(beds, cfg.bedHalfSat, 0);

  // Resource headroom only for margins the case actually needs (OR for surgery,
  // ICU for high-acuity/neuro/etc.). If none needed → full (1).
  const needs = caseNeeds(params);
  const margins: number[] = [];
  if (needs.surgery) margins.push(saturate(candidate.capacity?.available_operating_rooms, cfg.resourceHalfSat, 0.5));
  if (needs.icu) margins.push(saturate(relevantIcuBeds(candidate.capacity, params), cfg.resourceHalfSat, 0.5));
  const resourceUtil = margins.length > 0 ? margins.reduce((a, b) => a + b, 0) / margins.length : 1;

  return clamp01(cfg.bedWeight * bedUtil + cfg.resourceWeight * resourceUtil);
}

function computeCapabilityUtility(candidate: HospitalCandidate, params: OrParameters) {
  const cfg = OR_UTILITY_V3_CONFIG.uCapability;
  const counts = candidate.staticProfile?.specialty_doctor_counts ?? {};
  const hasProfile =
    candidate.staticProfile != null &&
    candidate.staticProfile.match_confidence !== "none" &&
    candidate.staticProfile.match_confidence !== "low";

  // Specialist depth: averaged saturating utility over required departments.
  // When no confident HIRA profile exists, fall back to neutralDepth (don't penalize).
  let depth: number;
  if (params.required_departments.length === 0) {
    depth = cfg.neutralDepth;
  } else {
    const perDept = params.required_departments.map((dept) => {
      const n = counts[dept];
      if (!hasProfile || typeof n !== "number") return cfg.neutralDepth;
      return saturate(n, cfg.specialistHalfSat, cfg.neutralDepth);
    });
    depth = perDept.reduce((a, b) => a + b, 0) / perDept.length;
  }

  // Level adequacy: graduated around the requested minimum (soft, by design).
  const tierGap = levelRank[candidate.hospital.emergency_level_model] - levelRank[params.minimum_hospital_level];
  const levelAdequacy = clamp01(cfg.levelMeets + cfg.levelPerTier * tierGap);

  const utility = clamp01(cfg.depthWeight * depth + cfg.levelWeight * levelAdequacy);
  return { utility, depth, levelAdequacy };
}

function caseNeeds(params: OrParameters) {
  const surgery =
    params.required_resources.some((r) => r === "surgery_capability" || r === "bleeding_control") ||
    params.required_departments.some((d) => d === "general_surgery" || d === "trauma_surgery") ||
    params.incident_type === "traffic_trauma" ||
    params.incident_type === "blunt_abdominal_trauma" ||
    params.incident_type === "gi_bleeding";
  const icu =
    params.severity_level >= 4 ||
    params.deterioration_risk >= 4 ||
    params.required_resources.includes("trauma_resuscitation") ||
    params.required_resources.includes("critical_care") ||
    params.required_resources.includes("airway_ventilation") ||
    params.required_resources.includes("thrombectomy_thrombolysis") ||
    params.required_departments.includes("neurosurgery") ||
    params.incident_type === "cardiac_arrest" ||
    params.incident_type === "respiratory_failure" ||
    params.incident_type === "stroke" ||
    params.incident_type === "cardiac" ||
    params.incident_type === "seizure";
  return { surgery, icu };
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function getBedBufferTier(availableErBeds: number | null | undefined): BedBufferTier {
  if (typeof availableErBeds !== "number" || !Number.isFinite(availableErBeds)) return "unknown";
  if (availableErBeds <= 0) return "infeasible_full_or_overcapacity";
  if (availableErBeds <= 2) return "high_risk_1_2";
  if (availableErBeds <= 5) return "medium_risk_3_5";
  if (availableErBeds <= 10) return "low_risk_6_10";
  return "stable_buffer_gt_10";
}

function relevantIcuBeds(capacity: HospitalCapacity | undefined, params: OrParameters) {
  if (!capacity) return null;
  const headOrNeuroCase =
    params.incident_type === "fall_head_injury" ||
    params.incident_type === "stroke" ||
    params.incident_type === "seizure" ||
    params.required_departments.includes("neurosurgery") ||
    params.required_departments.includes("neurology");
  const cardiacOrRespCase =
    params.incident_type === "cardiac" ||
    params.incident_type === "cardiac_arrest" ||
    params.incident_type === "respiratory_failure";
  const giCase = params.incident_type === "gi_bleeding";
  const traumaCase =
    params.incident_type === "traffic_trauma" ||
    params.incident_type === "blunt_abdominal_trauma" ||
    params.required_departments.includes("trauma_surgery");
  const values = headOrNeuroCase
    ? [capacity.available_neuro_icu_beds, capacity.available_neurosurgery_icu_beds, capacity.available_general_icu_beds, capacity.available_surgical_icu_beds]
    : cardiacOrRespCase
      ? [capacity.available_internal_medicine_icu_beds, capacity.available_general_icu_beds, capacity.available_thoracic_icu_beds]
    : giCase
      ? [capacity.available_surgical_icu_beds, capacity.available_general_icu_beds, capacity.available_internal_medicine_icu_beds]
    : traumaCase
      ? [capacity.available_trauma_icu_beds, capacity.available_surgical_icu_beds, capacity.available_general_icu_beds, capacity.available_thoracic_icu_beds]
      : [
          capacity.available_neuro_icu_beds,
          capacity.available_thoracic_icu_beds,
          capacity.available_general_icu_beds,
          capacity.available_internal_medicine_icu_beds,
          capacity.available_surgical_icu_beds,
          capacity.available_neurosurgery_icu_beds,
          capacity.available_burn_icu_beds,
          capacity.available_trauma_icu_beds,
        ];
  const numericValues = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (numericValues.length === 0) return null;
  return numericValues.reduce((sum, value) => sum + value, 0);
}

function buildConstraintViolations({
  hasAvailableErBed,
  missingDepartments,
  missingResources,
  availableErBeds,
}: {
  hasAvailableErBed: boolean;
  missingDepartments: number;
  missingResources: number;
  availableErBeds: number | null;
}) {
  const violations: string[] = [];
  if (!hasAvailableErBed) {
    violations.push(availableErBeds === null ? "missing_live_er_bed_count" : "no_positive_available_er_beds");
  }
  if (missingDepartments > 0) violations.push("required_department_missing");
  if (missingResources > 0) violations.push("required_resource_missing");
  return violations;
}

function hasDepartment(candidate: HospitalCandidate, department: Department) {
  const cap = candidate.capability;
  const capacity = candidate.capacity;
  switch (department) {
    case "emergency_medicine":
      return cap.has_emergency_medicine_department || candidate.hospital.er_open_static;
    case "neurosurgery":
      return (
        cap.has_neurosurgery_department ||
        positive(capacity?.available_neurosurgery_icu_beds) ||
        positive(capacity?.available_neuro_icu_beds)
      );
    case "orthopedics":
      return cap.has_orthopedics_department || positive(capacity?.available_orthopedic_inpatient_beds);
    case "general_surgery":
      return cap.has_general_surgery_department || cap.has_or_static || positive(capacity?.available_operating_rooms);
    case "trauma_surgery":
      return cap.has_trauma_surgery_department || candidate.hospital.emergency_level_model === "regional_center";
    case "cardiology":
      return (
        liveTrue(capacity?.angiography_available_live) ||
        positive(capacity?.available_internal_medicine_icu_beds) ||
        candidate.hospital.emergency_level_model !== "emergency_institution_ok"
      );
    case "neurology":
      return (
        liveTrue(capacity?.mri_available_live) ||
        positive(capacity?.available_neuro_icu_beds) ||
        positive(capacity?.available_neurosurgery_icu_beds) ||
        cap.has_neurosurgery_department ||
        candidate.hospital.emergency_level_model === "regional_center"
      );
    case "pulmonology":
      return (
        liveTrue(capacity?.ventilator_available_live) ||
        positive(capacity?.available_internal_medicine_icu_beds) ||
        positive(capacity?.available_general_icu_beds) ||
        candidate.hospital.emergency_level_model !== "emergency_institution_ok"
      );
    case "internal_medicine":
      return (
        positive(capacity?.available_internal_medicine_icu_beds) ||
        positive(capacity?.available_general_icu_beds) ||
        cap.has_icu_static ||
        candidate.hospital.er_open_static
      );
  }
}

function hasResource(candidate: HospitalCandidate, resource: Resource) {
  const cap = candidate.capability;
  const capacity = candidate.capacity;
  switch (resource) {
    case "ct":
      return capacity?.ct_available_live === true || cap.has_ct_static;
    case "xray":
      return cap.has_xray_static;
    case "orthopedic_trauma":
      return hasDepartment(candidate, "orthopedics");
    case "surgery_capability":
      return positive(capacity?.available_operating_rooms) || cap.has_or_static;
    case "bleeding_control":
      return positive(capacity?.available_operating_rooms) || candidate.hospital.emergency_level_model === "regional_center";
    case "trauma_resuscitation":
      return candidate.hospital.emergency_level_model === "regional_center" || cap.has_icu_static || positiveAnyIcu(capacity);
    case "cath_lab_pci":
      return liveTrue(capacity?.angiography_available_live) || hasDepartment(candidate, "cardiology");
    case "thrombectomy_thrombolysis":
      return liveTrue(capacity?.mri_available_live) || candidate.hospital.emergency_level_model === "regional_center";
    case "airway_ventilation":
      return liveTrue(capacity?.ventilator_available_live) || cap.has_icu_static || positiveAnyIcu(capacity);
    case "defibrillation_resuscitation":
      return candidate.hospital.er_open_static || cap.has_emergency_medicine_department || cap.has_icu_static;
    case "critical_care":
      return cap.has_icu_static || positiveAnyIcu(capacity) || candidate.hospital.emergency_level_model !== "emergency_institution_ok";
  }
}

function positive(value: number | null | undefined) {
  return typeof value === "number" && value > 0;
}

function liveTrue(value: boolean | null | undefined) {
  return value === true;
}

function positiveAnyIcu(capacity?: HospitalCapacity) {
  if (!capacity) return false;
  return [
    capacity.available_neuro_icu_beds,
    capacity.available_neonatal_icu_beds,
    capacity.available_thoracic_icu_beds,
    capacity.available_general_icu_beds,
    capacity.available_internal_medicine_icu_beds,
    capacity.available_surgical_icu_beds,
    capacity.available_neurosurgery_icu_beds,
    capacity.available_burn_icu_beds,
    capacity.available_trauma_icu_beds,
  ].some(positive);
}

function haversineKm(a: LocationPoint, b: LocationPoint) {
  const r = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

function toRad(value: number) {
  return (value * Math.PI) / 180;
}

export function estimateSeoulAmbulanceTravel(origin: LocationPoint, destination: LocationPoint) {
  const straightDistanceKm = haversineKm(origin, destination);
  const routeDistanceKm = straightDistanceKm * roadDetourFactor(origin, destination);
  const speedKph = routeDistanceKm <= 3 ? 22 : routeDistanceKm <= 8 ? 27 : routeDistanceKm <= 15 ? 31 : 35;
  const accessDelayMin = 2.5 + Math.min(4, routeDistanceKm * 0.18);
  const riverPenaltyMin = crossesHanRiver(origin, destination) ? 2 : 0;
  const corePenaltyMin = isSeoulCore(origin) || isSeoulCore(destination) ? 1 : 0;
  const minutes = Math.max(3, Math.ceil((routeDistanceKm / speedKph) * 60 + accessDelayMin + riverPenaltyMin + corePenaltyMin));

  return {
    model: "seoul_urban_detour_v2",
    straightDistanceKm: Number(straightDistanceKm.toFixed(2)),
    routeDistanceKm: Number(routeDistanceKm.toFixed(2)),
    minutes,
  };
}

function roadDetourFactor(origin: LocationPoint, destination: LocationPoint) {
  const latDelta = Math.abs(origin.lat - destination.lat);
  const lonDelta = Math.abs(origin.lon - destination.lon);
  const axisImbalance = Math.max(latDelta, lonDelta) / Math.max(0.0001, Math.min(latDelta, lonDelta));
  const gridFactor = axisImbalance > 2.5 ? 1.22 : 1.35;
  const riverFactor = crossesHanRiver(origin, destination) ? 0.1 : 0;
  const coreFactor = isSeoulCore(origin) || isSeoulCore(destination) ? 0.05 : 0;
  return gridFactor + riverFactor + coreFactor;
}

function crossesHanRiver(origin: LocationPoint, destination: LocationPoint) {
  const hanRiverLat = 37.53;
  return (origin.lat - hanRiverLat) * (destination.lat - hanRiverLat) < 0;
}

function isSeoulCore(point: LocationPoint) {
  return point.lat >= 37.52 && point.lat <= 37.59 && point.lon >= 126.94 && point.lon <= 127.04;
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy v2 cost scorer — RETAINED ONLY as an evaluation baseline so
// scripts/evaluate-or-model.ts can report the v2→v3 ranking diff. Not used by the
// app. Returns just the scalar total cost (lower = better) + feasibility.
export function scoreCandidateV2(candidate: HospitalCandidate, incidentLocation: LocationPoint, params: OrParameters, travelTimes?: TravelTimes) {
  const travel =
    travelTimes?.get(candidate.hospital.hospital_id) ??
    estimateSeoulAmbulanceTravel(incidentLocation, { lat: candidate.hospital.lat, lon: candidate.hospital.lon });
  const estimatedTravelTimeMin = travel.minutes;
  const u = OR_COST_CONFIG.urgency;
  const urgencyWeight =
    1 + u.severity * (params.severity_level - 1) + u.deterioration * (params.deterioration_risk - 1) + u.vulnerability * (params.vulnerability_level - 1);
  const availableErBeds = candidate.capacity?.available_er_beds ?? null;
  const timeSlackMin = params.max_transport_time_min - estimatedTravelTimeMin;
  const hasAvailableErBed = typeof availableErBeds === "number" && availableErBeds > 0;
  const missingDepartments = params.required_departments.filter((d) => !hasDepartment(candidate, d)).length;
  const missingResources = params.required_resources.filter((r) => !hasResource(candidate, r) && !SOFT_RESOURCES.has(r)).length;
  const constraintViolations = buildConstraintViolations({ hasAvailableErBed, missingDepartments, missingResources, availableErBeds });

  const levelGap = Math.max(0, levelRank[params.minimum_hospital_level] - levelRank[candidate.hospital.emergency_level_model]);
  const levelPenalty = levelGap * OR_COST_CONFIG.levelPenaltyPerTier;
  const travelCost = estimatedTravelTimeMin * urgencyWeight * OR_COST_CONFIG.travelCostPerMin;
  const bedBufferRisk = calculateBedBufferRiskV2({ availableErBeds, urgencyWeight, timeSlackMin });
  const resourceMarginRisk = calculateResourceMarginRiskV2(candidate, params, urgencyWeight);
  const overTimeMin = Math.max(0, estimatedTravelTimeMin - params.max_transport_time_min);
  const t = OR_COST_CONFIG.time;
  const timeSoftPenalty = overTimeMin > 0 ? t.softBase + t.perMin * overTimeMin + t.quadratic * overTimeMin ** 2 : 0;
  const hardConstraintPenalty =
    constraintViolations.length > 0 ? OR_COST_CONFIG.hardConstraint.base + constraintViolations.length * OR_COST_CONFIG.hardConstraint.perViolation : 0;

  const totalCost = travelCost + bedBufferRisk + resourceMarginRisk + levelPenalty + hardConstraintPenalty + timeSoftPenalty;
  return { hospitalId: candidate.hospital.hospital_id, totalCost: Number(totalCost.toFixed(2)), feasible: constraintViolations.length === 0 };
}

/** v2 baseline ranking — returns hospital ids ordered as v2 would (cost ascending). */
export function rankHospitalsV2({
  candidates,
  incidentLocation,
  orParameters,
  travelTimes,
}: {
  candidates: HospitalCandidate[];
  incidentLocation: LocationPoint;
  orParameters: OrParameters;
  travelTimes?: TravelTimes;
}) {
  return candidates
    .map((candidate) => scoreCandidateV2(candidate, incidentLocation, orParameters, travelTimes))
    .sort((a, b) => a.totalCost - b.totalCost);
}

function calculateBedBufferRiskV2({
  availableErBeds,
  urgencyWeight,
  timeSlackMin,
}: {
  availableErBeds: number | null;
  urgencyWeight: number;
  timeSlackMin: number;
}) {
  const base = OR_COST_CONFIG.bedBuffer.base;
  const basePenaltyByTier: Record<BedBufferTier, number> = {
    unknown: base.unknown,
    infeasible_full_or_overcapacity: base.infeasible_full_or_overcapacity,
    high_risk_1_2: availableErBeds === 1 ? base.high_risk_1 : base.high_risk_2,
    medium_risk_3_5: base.medium_risk_3_5,
    low_risk_6_10: base.low_risk_6_10,
    stable_buffer_gt_10: base.stable_buffer_gt_10,
  };
  const slack = OR_COST_CONFIG.bedBuffer.slack;
  const slackFactor = timeSlackMin < 5 ? slack.tightUnder5 : timeSlackMin < 10 ? slack.tightUnder10 : slack.normal;
  return basePenaltyByTier[getBedBufferTier(availableErBeds)] * slackFactor * urgencyWeight;
}

function calculateResourceMarginRiskV2(candidate: HospitalCandidate, params: OrParameters, urgencyWeight: number) {
  const margin = OR_COST_CONFIG.margin;
  const needs = caseNeeds(params);
  let risk = 0;
  if (needs.surgery) risk += marginPenalty(candidate.capacity?.available_operating_rooms, margin.surgery.thresholds, margin.surgery.penalties);
  if (needs.icu) risk += marginPenalty(relevantIcuBeds(candidate.capacity, params), margin.icu.thresholds, margin.icu.penalties);
  if (params.required_resources.includes("ct") && candidate.capacity?.ct_available_live !== true && candidate.capability.has_ct_static) risk += margin.ctFallback;
  if (params.required_resources.includes("trauma_resuscitation") && candidate.capacity?.ventilator_available_live === false) risk += margin.ventilatorMissing;
  if (params.required_resources.includes("cath_lab_pci") && candidate.capacity?.angiography_available_live !== true) risk += margin.angiographyMissing;
  if (params.required_resources.includes("thrombectomy_thrombolysis") && candidate.capacity?.mri_available_live !== true) risk += margin.mriMissing;
  if (params.required_resources.includes("airway_ventilation") && candidate.capacity?.ventilator_available_live === false) risk += margin.ventilatorMissing;
  return risk * (margin.urgencyBase + urgencyWeight * margin.urgencyFactor);
}

function marginPenalty(value: number | null | undefined, thresholds: [number, number, number], penalties: [number, number, number, number]) {
  if (typeof value !== "number" || !Number.isFinite(value)) return penalties[1];
  if (value <= thresholds[0]) return penalties[0];
  if (value <= thresholds[1]) return penalties[1];
  if (value <= thresholds[2]) return penalties[2];
  return penalties[3];
}
