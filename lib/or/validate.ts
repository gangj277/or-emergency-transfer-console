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
