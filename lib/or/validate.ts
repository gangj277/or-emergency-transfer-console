import {
  departments,
  hospitalLevels,
  incidentTypes,
  resources,
  type Department,
  type HospitalLevel,
  type IncidentType,
  type OrParameters,
  type Resource,
  type ValidationResult,
} from "./types";

const forbiddenKeys = new Set([
  "age",
  "exact_age",
  "gender",
  "sex",
  "confidence",
  "confidence_score",
  "hospital",
  "hospital_name",
  "recommended_hospital",
  "diagnosis",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function walkForbiddenKeys(value: unknown, path = "$", failures: string[] = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkForbiddenKeys(item, `${path}[${index}]`, failures));
    return failures;
  }
  if (!isObject(value)) return failures;
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKeys.has(key)) failures.push(`${path}.${key} is forbidden in runtime output`);
    walkForbiddenKeys(child, `${path}.${key}`, failures);
  }
  return failures;
}

function enumIncludes<T extends readonly string[]>(allowed: T, value: unknown): value is T[number] {
  return typeof value === "string" && allowed.includes(value);
}

export function validateObservationOutput(output: unknown, expectedCaseId: string): ValidationResult {
  const failures = walkForbiddenKeys(output);
  const warnings: string[] = [];
  if (!isObject(output)) return { valid: false, failures: ["Stage 1 output must be an object"], warnings };
  if (output.case_id !== expectedCaseId) failures.push(`case_id mismatch: expected ${expectedCaseId}, got ${String(output.case_id)}`);
  if (!isObject(output.medical_observations)) failures.push("medical_observations must be an object");
  return { valid: failures.length === 0, failures, warnings };
}

// Per-incident clinical minimums. Used to deterministically warn about, and
// auto-correct, OR parameter sets that omit resources/departments a given
// incident almost always needs. Trauma incidents are intentionally absent
// (their resource expectations were already encoded in the original design).
//   resources         — each must be present (auto-added if missing)
//   anyOfResources    — at least one of each group present (auto-add group[0] if none)
//   departments       — each must be present
//   anyOfDepartments  — at least one of each group present
type IncidentRequirement = {
  resources?: Resource[];
  anyOfResources?: Resource[][];
  departments?: Department[];
  anyOfDepartments?: Department[][];
};

export const INCIDENT_REQUIREMENTS: Partial<Record<IncidentType, IncidentRequirement>> = {
  cardiac_arrest: {
    resources: ["defibrillation_resuscitation", "critical_care"],
    departments: ["emergency_medicine"],
  },
  cardiac: {
    anyOfResources: [["cath_lab_pci", "ct"]],
    departments: ["emergency_medicine", "cardiology"],
  },
  stroke: {
    resources: ["ct", "thrombectomy_thrombolysis"],
    departments: ["emergency_medicine", "neurology"],
  },
  respiratory_failure: {
    resources: ["airway_ventilation", "critical_care"],
    departments: ["emergency_medicine"],
    anyOfDepartments: [["pulmonology", "internal_medicine"]],
  },
  seizure: {
    resources: ["ct", "critical_care"],
    departments: ["emergency_medicine", "neurology"],
  },
  gi_bleeding: {
    resources: ["bleeding_control", "ct"],
    departments: ["emergency_medicine"],
    anyOfDepartments: [["general_surgery", "internal_medicine"]],
  },
};

// Deterministic consistency check + soft auto-correction. Returns warnings (never
// failures, so the pipeline does not throw) and a corrected param set with any
// missing clinical minimums injected.
export function checkIncidentConsistency(params: OrParameters): { warnings: string[]; params: OrParameters } {
  const req = INCIDENT_REQUIREMENTS[params.incident_type];
  if (!req) return { warnings: [], params };

  const warnings: string[] = [];
  const resources = [...params.required_resources];
  const departments = [...params.required_departments];

  for (const resource of req.resources ?? []) {
    if (!resources.includes(resource)) {
      resources.push(resource);
      warnings.push(`incident_consistency: ${params.incident_type} typically needs resource '${resource}' (auto-added)`);
    }
  }
  for (const group of req.anyOfResources ?? []) {
    if (!group.some((resource) => resources.includes(resource))) {
      resources.push(group[0]);
      warnings.push(`incident_consistency: ${params.incident_type} typically needs one of [${group.join(", ")}] (auto-added '${group[0]}')`);
    }
  }
  for (const department of req.departments ?? []) {
    if (!departments.includes(department)) {
      departments.push(department);
      warnings.push(`incident_consistency: ${params.incident_type} typically needs department '${department}' (auto-added)`);
    }
  }
  for (const group of req.anyOfDepartments ?? []) {
    if (!group.some((department) => departments.includes(department))) {
      departments.push(group[0]);
      warnings.push(`incident_consistency: ${params.incident_type} typically needs one of [${group.join(", ")}] (auto-added '${group[0]}')`);
    }
  }

  const changed = resources.length !== params.required_resources.length || departments.length !== params.required_departments.length;
  return {
    warnings,
    params: changed ? { ...params, required_resources: resources, required_departments: departments } : params,
  };
}

export function validateOrParameterOutput(output: unknown, expectedCaseId: string): ValidationResult {
  const failures = walkForbiddenKeys(output);
  const warnings: string[] = [];
  if (!isObject(output)) return { valid: false, failures: ["Stage 2 output must be an object"], warnings };
  if (output.case_id !== expectedCaseId) failures.push(`case_id mismatch: expected ${expectedCaseId}, got ${String(output.case_id)}`);
  if (!isObject(output.or_parameters)) {
    failures.push("or_parameters must be an object");
    return { valid: false, failures, warnings };
  }
  const params = output.or_parameters;
  const parsed = parseOrParameters(params);
  if (!parsed.valid) failures.push(...parsed.failures);
  if (parsed.params) {
    if (parsed.params.severity_level >= 4 && parsed.params.max_transport_time_min > 30) {
      warnings.push("High severity case has max_transport_time_min > 30");
    }
    if (parsed.params.deterioration_risk >= 4 && parsed.params.max_transport_time_min > 30) {
      warnings.push("High deterioration risk case has max_transport_time_min > 30");
    }
    warnings.push(...checkIncidentConsistency(parsed.params).warnings);
  }
  return { valid: failures.length === 0, failures, warnings };
}

export function parseOrParameters(value: unknown): { valid: true; params: OrParameters; failures: [] } | { valid: false; params?: undefined; failures: string[] } {
  const failures: string[] = [];
  if (!isObject(value)) return { valid: false, failures: ["or_parameters must be an object"] };

  const incidentType = enumIncludes(incidentTypes, value.incident_type) ? (value.incident_type as IncidentType) : null;
  if (!incidentType) failures.push("incident_type is invalid");
  const minimumHospitalLevel = enumIncludes(hospitalLevels, value.minimum_hospital_level)
    ? (value.minimum_hospital_level as HospitalLevel)
    : null;
  if (!minimumHospitalLevel) failures.push("minimum_hospital_level is invalid");
  const requiredDepartments = Array.isArray(value.required_departments)
    ? value.required_departments.filter((item): item is Department => enumIncludes(departments, item))
    : [];
  if (!Array.isArray(value.required_departments) || requiredDepartments.length !== value.required_departments.length || requiredDepartments.length === 0) {
    failures.push("required_departments is invalid");
  }
  const requiredResources = Array.isArray(value.required_resources)
    ? value.required_resources.filter((item): item is Resource => enumIncludes(resources, item))
    : [];
  if (!Array.isArray(value.required_resources) || requiredResources.length !== value.required_resources.length || requiredResources.length === 0) {
    failures.push("required_resources is invalid");
  }
  const maxTransport = value.max_transport_time_min;
  if (![10, 15, 20, 30, 45, 60].includes(Number(maxTransport))) failures.push("max_transport_time_min is invalid");
  for (const key of ["severity_level", "deterioration_risk", "vulnerability_level"] as const) {
    const n = value[key];
    if (!Number.isInteger(n) || (n as number) < 1 || (n as number) > 5) failures.push(`${key} must be an integer from 1 to 5`);
  }
  if (typeof value.or_notes !== "string") failures.push("or_notes must be a string");

  if (failures.length > 0 || !incidentType || !minimumHospitalLevel) return { valid: false, failures };
  return {
    valid: true,
    failures: [],
    params: {
      incident_type: incidentType,
      severity_level: value.severity_level as number,
      deterioration_risk: value.deterioration_risk as number,
      vulnerability_level: value.vulnerability_level as number,
      required_departments: requiredDepartments,
      required_resources: requiredResources,
      max_transport_time_min: Number(maxTransport) as OrParameters["max_transport_time_min"],
      minimum_hospital_level: minimumHospitalLevel,
      or_notes: value.or_notes as string,
    },
  };
}

export function assertLocation(value: unknown) {
  if (!isObject(value) || typeof value.lat !== "number" || typeof value.lon !== "number") {
    throw new Error("incident_location with numeric lat/lon is required.");
  }
  return { lat: value.lat, lon: value.lon };
}
