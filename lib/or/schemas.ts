import { departments, incidentTypes, resources } from "./types";

export const factCategories = [
  "incident_mechanism",
  "consciousness",
  "breathing",
  "circulation_bleeding",
  "pain",
  "mobility",
  "injury_site",
  "vital_signs",
  "time_course",
  "medication_history",
  "other",
];

export const factStatuses = ["present", "absent", "unclear"];

export const observationSchema = {
  type: "object",
  additionalProperties: false,
  required: ["case_id", "medical_observations"],
  properties: {
    case_id: { type: "string" },
    medical_observations: {
      type: "object",
      additionalProperties: false,
      required: ["incident_context", "patient_context", "clinical_facts", "missing_critical_info"],
      properties: {
        incident_context: {
          type: "object",
          additionalProperties: false,
          required: ["incident_type_text", "location_context", "injury_mechanism"],
          properties: {
            incident_type_text: { type: "string" },
            location_context: { type: "string" },
            injury_mechanism: { type: "string" },
          },
        },
        patient_context: {
          type: "object",
          additionalProperties: false,
          required: ["age_group", "vulnerability_mentions", "medication_or_history_mentions"],
          properties: {
            age_group: { type: "string", enum: ["unknown", "adult", "older_adult"] },
            vulnerability_mentions: { type: "array", items: { type: "string" } },
            medication_or_history_mentions: { type: "array", items: { type: "string" } },
          },
        },
        clinical_facts: {
          type: "array",
          minItems: 4,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["category", "finding", "status"],
            properties: {
              category: { type: "string", enum: factCategories },
              finding: { type: "string" },
              status: { type: "string", enum: factStatuses },
            },
          },
        },
        missing_critical_info: {
          type: "array",
          items: { type: "string" },
        },
      },
    },
  },
} as const;

export const orParameterSchema = {
  type: "object",
  additionalProperties: false,
  required: ["case_id", "or_parameters"],
  properties: {
    case_id: { type: "string" },
    or_parameters: {
      type: "object",
      additionalProperties: false,
      required: [
        "incident_type",
        "severity_level",
        "deterioration_risk",
        "vulnerability_level",
        "required_departments",
        "required_resources",
        "max_transport_time_min",
        "minimum_hospital_level",
        "or_notes",
      ],
      properties: {
        incident_type: {
          type: "string",
          // Single source of truth: keep in lockstep with lib/or/types.ts enums so the
          // strict structured-output call and parseOrParameters never disagree.
          enum: [...incidentTypes],
        },
        severity_level: { type: "integer", minimum: 1, maximum: 5 },
        deterioration_risk: { type: "integer", minimum: 1, maximum: 5 },
        vulnerability_level: { type: "integer", minimum: 1, maximum: 5 },
        required_departments: {
          type: "array",
          minItems: 1,
          items: {
            type: "string",
            enum: [...departments],
          },
        },
        required_resources: {
          type: "array",
          minItems: 1,
          items: {
            type: "string",
            enum: [...resources],
          },
        },
        max_transport_time_min: { type: "integer", enum: [10, 15, 20, 30, 45, 60] },
        minimum_hospital_level: {
          type: "string",
          enum: ["regional_center", "local_center_or_above", "emergency_institution_ok"],
        },
        or_notes: { type: "string" },
      },
    },
  },
} as const;
