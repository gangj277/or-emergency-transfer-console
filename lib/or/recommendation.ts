import type {
  Department,
  HospitalCandidate,
  HospitalCapacity,
  HospitalLevel,
  LocationPoint,
  OrParameters,
  Resource,
} from "./types";

const levelRank: Record<HospitalLevel, number> = {
  emergency_institution_ok: 1,
  local_center_or_above: 2,
  regional_center: 3,
};

export type RankedHospital = {
  rank: number;
  hospital: HospitalCandidate;
  feasible: boolean;
  estimatedTravelTimeMin: number;
  timeSlackMin: number;
  distanceKm: number;
  availableErBeds: number | null;
  bedBufferTier: BedBufferTier;
  totalCost: number;
  costBreakdown: {
    travelCost: number;
    bedBufferRisk: number;
    resourceMarginRisk: number;
    levelPenalty: number;
    staticReliabilityPenalty: number;
    hardConstraintPenalty: number;
  };
  objectiveTerms: {
    estimated_travel_time_min: number;
    time_slack_min: number;
    available_er_beds: number | null;
    bed_buffer_tier: BedBufferTier;
    bed_buffer_risk: number;
    resource_margin_risk: number;
    static_reliability_penalty: number;
    travel_cost: number;
    level_penalty: number;
    hard_constraint_penalty: number;
    total_cost: number;
  };
  constraintViolations: string[];
  checks: {
    withinMaxTransportTime: boolean;
    levelMatch: boolean;
    departmentMatches: Record<Department, boolean>;
    resourceMatches: Record<Resource, boolean>;
    hasAvailableErBed: boolean;
  };
};

export type BedBufferTier =
  | "unknown"
  | "infeasible_full_or_overcapacity"
  | "high_risk_1_2"
  | "medium_risk_3_5"
  | "low_risk_6_10"
  | "stable_buffer_gt_10";

export function rankHospitals({
  candidates,
  incidentLocation,
  orParameters,
  limit = 10,
}: {
  candidates: HospitalCandidate[];
  incidentLocation: LocationPoint;
  orParameters: OrParameters;
  limit?: number;
}) {
  const ranked = candidates
    .map((candidate) => scoreCandidate(candidate, incidentLocation, orParameters))
    .sort((a, b) => a.totalCost - b.totalCost)
    .slice(0, limit)
    .map((item, index) => ({ ...item, rank: index + 1 }));

  return {
    formulation: {
      version: "capacity_buffer_v2" as const,
      objective: "min travel_cost + bed_buffer_risk + resource_margin_risk + level_penalty + static_reliability_penalty",
      hardConstraints: [
        "estimated_travel_time_min <= max_transport_time_min",
        "available_er_beds > 0",
        "minimum_hospital_level satisfied",
        "all required_departments and required_resources available",
      ],
      candidateSetPolicy: "primary_live_capacity_only",
    },
    candidateSet: "live_capacity" as const,
    requestedLimit: limit,
    returned: ranked.length,
    rankings: ranked,
  };
}

function scoreCandidate(
  candidate: HospitalCandidate,
  incidentLocation: LocationPoint,
  params: OrParameters,
): Omit<RankedHospital, "rank"> {
  const distanceKm = haversineKm(incidentLocation, {
    lat: candidate.hospital.lat,
    lon: candidate.hospital.lon,
  });
  const estimatedTravelTimeMin = estimateUrbanAmbulanceMinutes(distanceKm);
  const urgencyWeight =
    1 + 0.25 * (params.severity_level - 1) + 0.2 * (params.deterioration_risk - 1) + 0.1 * (params.vulnerability_level - 1);

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
  const timeSlackMin = params.max_transport_time_min - estimatedTravelTimeMin;
  const bedBufferTier = getBedBufferTier(availableErBeds);

  const missingDepartments = Object.values(departmentMatches).filter((value) => !value).length;
  const missingResources = Object.values(resourceMatches).filter((value) => !value).length;
  const levelPenalty = levelMatch ? 0 : 700;
  const travelCost = estimatedTravelTimeMin * urgencyWeight * 10;
  const bedBufferRisk = calculateBedBufferRisk({
    availableErBeds,
    urgencyWeight,
    timeSlackMin,
  });
  const resourceMarginRisk = calculateResourceMarginRisk(candidate, params, urgencyWeight);
  const staticReliabilityPenalty = calculateStaticReliabilityPenalty(candidate);
  const constraintViolations = buildConstraintViolations({
    withinMaxTransportTime,
    levelMatch,
    hasAvailableErBed,
    missingDepartments,
    missingResources,
    availableErBeds,
  });
  const hardConstraintPenalty = constraintViolations.length > 0 ? 100_000 + constraintViolations.length * 2_500 : 0;
  const totalCost = Number(
    (travelCost + bedBufferRisk + resourceMarginRisk + levelPenalty + staticReliabilityPenalty + hardConstraintPenalty).toFixed(2),
  );

  return {
    hospital: candidate,
    feasible: constraintViolations.length === 0,
    estimatedTravelTimeMin,
    timeSlackMin,
    distanceKm: Number(distanceKm.toFixed(2)),
    availableErBeds,
    bedBufferTier,
    totalCost,
    costBreakdown: {
      travelCost: Number(travelCost.toFixed(2)),
      bedBufferRisk,
      resourceMarginRisk,
      levelPenalty,
      staticReliabilityPenalty,
      hardConstraintPenalty,
    },
    objectiveTerms: {
      estimated_travel_time_min: estimatedTravelTimeMin,
      time_slack_min: timeSlackMin,
      available_er_beds: availableErBeds,
      bed_buffer_tier: bedBufferTier,
      bed_buffer_risk: bedBufferRisk,
      resource_margin_risk: resourceMarginRisk,
      static_reliability_penalty: staticReliabilityPenalty,
      travel_cost: Number(travelCost.toFixed(2)),
      level_penalty: levelPenalty,
      hard_constraint_penalty: hardConstraintPenalty,
      total_cost: totalCost,
    },
    constraintViolations,
    checks: {
      withinMaxTransportTime,
      levelMatch,
      departmentMatches,
      resourceMatches,
      hasAvailableErBed,
    },
  };
}

export function getBedBufferTier(availableErBeds: number | null | undefined): BedBufferTier {
  if (typeof availableErBeds !== "number" || !Number.isFinite(availableErBeds)) return "unknown";
  if (availableErBeds <= 0) return "infeasible_full_or_overcapacity";
  if (availableErBeds <= 2) return "high_risk_1_2";
  if (availableErBeds <= 5) return "medium_risk_3_5";
  if (availableErBeds <= 10) return "low_risk_6_10";
  return "stable_buffer_gt_10";
}

function calculateBedBufferRisk({
  availableErBeds,
  urgencyWeight,
  timeSlackMin,
}: {
  availableErBeds: number | null;
  urgencyWeight: number;
  timeSlackMin: number;
}) {
  const basePenaltyByTier: Record<BedBufferTier, number> = {
    unknown: 520,
    infeasible_full_or_overcapacity: 900,
    high_risk_1_2: availableErBeds === 1 ? 460 : 340,
    medium_risk_3_5: 155,
    low_risk_6_10: 45,
    stable_buffer_gt_10: 5,
  };
  const slackFactor = timeSlackMin < 5 ? 1.6 : timeSlackMin < 10 ? 1.25 : 1;
  const risk = basePenaltyByTier[getBedBufferTier(availableErBeds)] * slackFactor * urgencyWeight;
  return Number(risk.toFixed(2));
}

function calculateResourceMarginRisk(candidate: HospitalCandidate, params: OrParameters, urgencyWeight: number) {
  const surgeryNeeded =
    params.required_resources.some((resource) => resource === "surgery_capability" || resource === "bleeding_control") ||
    params.required_departments.some((department) => department === "general_surgery" || department === "trauma_surgery") ||
    params.incident_type === "traffic_trauma" ||
    params.incident_type === "blunt_abdominal_trauma";
  const icuNeeded =
    params.severity_level >= 4 ||
    params.deterioration_risk >= 4 ||
    params.required_resources.includes("trauma_resuscitation") ||
    params.required_departments.includes("neurosurgery");

  let risk = 0;
  if (surgeryNeeded) risk += marginPenalty(candidate.capacity?.available_operating_rooms, [0, 2, 5], [300, 180, 80, 0]);
  if (icuNeeded) risk += marginPenalty(relevantIcuBeds(candidate.capacity, params), [0, 2, 5], [220, 120, 45, 0]);
  if (params.required_resources.includes("ct") && candidate.capacity?.ct_available_live !== true && candidate.capability.has_ct_static) {
    risk += 35;
  }
  if (params.required_resources.includes("trauma_resuscitation") && candidate.capacity?.ventilator_available_live === false) {
    risk += 60;
  }

  return Number((risk * (0.75 + urgencyWeight * 0.15)).toFixed(2));
}

function marginPenalty(
  value: number | null | undefined,
  thresholds: [number, number, number],
  penalties: [number, number, number, number],
) {
  if (typeof value !== "number" || !Number.isFinite(value)) return penalties[1];
  if (value <= thresholds[0]) return penalties[0];
  if (value <= thresholds[1]) return penalties[1];
  if (value <= thresholds[2]) return penalties[2];
  return penalties[3];
}

function relevantIcuBeds(capacity: HospitalCapacity | undefined, params: OrParameters) {
  if (!capacity) return null;
  const headOrNeuroCase = params.incident_type === "fall_head_injury" || params.required_departments.includes("neurosurgery");
  const traumaCase =
    params.incident_type === "traffic_trauma" ||
    params.incident_type === "blunt_abdominal_trauma" ||
    params.required_departments.includes("trauma_surgery");
  const values = headOrNeuroCase
    ? [
        capacity.available_neuro_icu_beds,
        capacity.available_neurosurgery_icu_beds,
        capacity.available_general_icu_beds,
        capacity.available_surgical_icu_beds,
      ]
    : traumaCase
      ? [
          capacity.available_trauma_icu_beds,
          capacity.available_surgical_icu_beds,
          capacity.available_general_icu_beds,
          capacity.available_thoracic_icu_beds,
        ]
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

function calculateStaticReliabilityPenalty(candidate: HospitalCandidate) {
  const profile = candidate.staticProfile;
  if (!profile || profile.match_confidence === "none" || profile.match_confidence === "low") return 0;

  let penalty = 0;
  if (typeof profile.total_doctors === "number") {
    if (profile.total_doctors < 50) penalty += 55;
    else if (profile.total_doctors < 150) penalty += 25;
  }
  if (typeof profile.total_beds === "number") {
    if (profile.total_beds < 100) penalty += 45;
    else if (profile.total_beds < 300) penalty += 20;
  }
  if (typeof profile.icu_beds === "number" && profile.icu_beds < 5) penalty += 25;

  return penalty;
}

function buildConstraintViolations({
  withinMaxTransportTime,
  levelMatch,
  hasAvailableErBed,
  missingDepartments,
  missingResources,
  availableErBeds,
}: {
  withinMaxTransportTime: boolean;
  levelMatch: boolean;
  hasAvailableErBed: boolean;
  missingDepartments: number;
  missingResources: number;
  availableErBeds: number | null;
}) {
  const violations: string[] = [];
  if (!withinMaxTransportTime) violations.push("max_transport_time_exceeded");
  if (!levelMatch) violations.push("minimum_hospital_level_not_met");
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
      return (
        candidate.hospital.emergency_level_model === "regional_center" ||
        cap.has_icu_static ||
        positiveAnyIcu(capacity)
      );
  }
}

function positive(value: number | null | undefined) {
  return typeof value === "number" && value > 0;
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

function estimateUrbanAmbulanceMinutes(distanceKm: number) {
  return Math.max(3, Math.ceil((distanceKm / 28) * 60 + 3));
}
