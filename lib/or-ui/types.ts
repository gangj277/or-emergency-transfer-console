import type {
  Department,
  HospitalCandidate,
  HospitalCapability,
  HospitalCapacity,
  HospitalDim,
  HospitalLevel,
  HospitalStaticProfile,
  IncidentType,
  LocationPoint,
  MissingActiveCapacity,
  OrParameters,
  Resource,
} from "@/lib/or/types";
import type { BedBufferTier, RankedHospital } from "@/lib/or/recommendation";

export type {
  BedBufferTier,
  Department,
  HospitalCandidate,
  HospitalCapability,
  HospitalCapacity,
  HospitalDim,
  HospitalLevel,
  HospitalStaticProfile,
  IncidentType,
  LocationPoint,
  MissingActiveCapacity,
  OrParameters,
  RankedHospital,
  Resource,
};

export type HealthResponse = {
  status: string;
  runtime: string;
  env: {
    openrouterConfigured: boolean;
    openrouterModel: string;
    nemcConfigured: boolean;
  };
  data: HospitalDataSummary;
};

export type HospitalDataSummary = {
  activeHospitalCount: number;
  liveCapacityHospitalCount: number;
  activeWithoutLiveCapacityCount: number;
  staticProfileCount: number;
  candidatePolicy: string;
  staticProfilePolicy: string;
};

export type HospitalsResponse = {
  mode: "live" | "active";
  summary: HospitalDataSummary;
  candidates: HospitalCandidate[];
  missingActiveCapacity: MissingActiveCapacity[];
  capacityMetadata?: unknown;
};

export type Stage1Observations = {
  case_id?: string;
  medical_observations: {
    incident_context: {
      incident_type_text: string;
      location_context: string;
      injury_mechanism: string;
    };
    patient_context: {
      age_group: "unknown" | "adult" | "older_adult" | string;
      vulnerability_mentions: string[];
      medication_or_history_mentions: string[];
    };
    clinical_facts: Array<{
      category: string;
      finding: string;
      status: "present" | "absent" | "unclear" | string;
    }>;
    missing_critical_info: string[];
  };
};

export type PipelineValidation = {
  stage1?: { valid: boolean; failures: string[]; warnings: string[] };
  stage2?: { valid: boolean; failures: string[]; warnings: string[] };
};

export type RecommendationResponse = {
  candidatePolicy: string;
  dataSummary: HospitalDataSummary;
  pipeline: {
    source: "supplied_or_parameters" | "llm_two_stage_pipeline";
    orParameters: OrParameters;
    stage1?: Stage1Observations | null;
    validation?: PipelineValidation;
  };
  recommendations: {
    formulation: {
      version: "capacity_buffer_v2";
      objective: string;
      hardConstraints: string[];
      candidateSetPolicy: string;
    };
    candidateSet?: string;
    requestedLimit?: number;
    returned?: number;
    rankings: RankedHospital[];
  };
};

export type ApiError = { error: string };

export type RunStage = "extracting" | "converting" | "ranking";
export type RunState =
  | { kind: "idle" }
  | { kind: "validating_input" }
  | { kind: "running"; activeStage: RunStage; ranLLM: boolean }
  | { kind: "success"; ranLLM: boolean }
  | { kind: "error"; message: string };

export type InputMode = "transcript" | "manual";

export type SeoulPreset = { label: string; lat: number; lon: number };
