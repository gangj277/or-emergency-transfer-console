export const incidentTypes = [
  // trauma / surgical (retained — fixtures, tests, and UI depend on these)
  "fall_head_injury",
  "fall_orthopedic",
  "traffic_trauma",
  "blunt_abdominal_trauma",
  "minor_head_injury_anticoagulant",
  "other_trauma",
  // medical high-acuity (added to match the real Seoul 119 case distribution)
  "cardiac_arrest",
  "stroke",
  "respiratory_failure",
  "seizure",
  "cardiac",
  "gi_bleeding",
] as const;

export const departments = [
  "emergency_medicine",
  "neurosurgery",
  "orthopedics",
  "general_surgery",
  "trauma_surgery",
  // medical specialties
  "cardiology",
  "neurology",
  "pulmonology",
  "internal_medicine",
] as const;

export const resources = [
  "ct",
  "xray",
  "orthopedic_trauma",
  "surgery_capability",
  "bleeding_control",
  "trauma_resuscitation",
  // medical critical-care resources (mapped to already-collected live capacity signals)
  "cath_lab_pci",
  "thrombectomy_thrombolysis",
  "airway_ventilation",
  "defibrillation_resuscitation",
  "critical_care",
] as const;

export const hospitalLevels = [
  "regional_center",
  "local_center_or_above",
  "emergency_institution_ok",
] as const;

export type IncidentType = (typeof incidentTypes)[number];
export type Department = (typeof departments)[number];
export type Resource = (typeof resources)[number];
export type HospitalLevel = (typeof hospitalLevels)[number];

export type OrParameters = {
  incident_type: IncidentType;
  severity_level: number;
  deterioration_risk: number;
  vulnerability_level: number;
  required_departments: Department[];
  required_resources: Resource[];
  max_transport_time_min: 10 | 15 | 20 | 30 | 45 | 60;
  minimum_hospital_level: HospitalLevel;
  or_notes: string;
};

export type LocationPoint = {
  lat: number;
  lon: number;
};

export type HospitalDim = {
  hospital_id: string;
  hpid: string;
  hospital_name: string;
  address: string;
  district: string;
  lat: number;
  lon: number;
  emergency_level_raw: string;
  emergency_level_code: string;
  current_emergency_level_raw: string;
  emergency_level_model: HospitalLevel;
  emergency_level_rank: number;
  hospital_type_raw: string;
  er_phone: string;
  representative_phone: string;
  er_open_static: boolean;
  is_designated_emergency_medical_institution: boolean;
  current_egen_present: boolean;
  current_egen_updated_at: string;
  current_egen_operationyn: string;
  current_egen_silson24_chk: string;
  or_candidate_active: boolean;
};

export type HospitalCapability = {
  hospital_id: string;
  has_ct_static: boolean;
  has_xray_static: boolean;
  has_neurosurgery_department: boolean;
  has_orthopedics_department: boolean;
  has_general_surgery_department: boolean;
  has_trauma_surgery_department: boolean;
  has_emergency_medicine_department: boolean;
  has_or_static: boolean;
  has_icu_static: boolean;
  has_neuro_icu_static: boolean;
  has_trauma_icu_static: boolean;
  capability_source: string;
  capability_confidence: "high" | "medium" | "low" | string;
  capability_notes: string;
};

export type HospitalCapacity = {
  hospital_id: string;
  hpid: string;
  previous_hpid?: string;
  duty_name_live: string;
  er_phone_live: string;
  requested_stage1: string;
  requested_district: string;
  fetched_at: string;
  hvidate_raw: string;
  available_er_beds: number | null;
  available_operating_rooms: number | null;
  available_neuro_icu_beds: number | null;
  available_neonatal_icu_beds: number | null;
  available_thoracic_icu_beds: number | null;
  available_general_icu_beds: number | null;
  available_inpatient_beds: number | null;
  available_internal_medicine_icu_beds: number | null;
  available_surgical_icu_beds: number | null;
  available_orthopedic_inpatient_beds: number | null;
  available_neurology_inpatient_beds: number | null;
  available_neurosurgery_icu_beds: number | null;
  available_drug_intoxication_icu_beds: number | null;
  available_burn_icu_beds: number | null;
  available_trauma_icu_beds: number | null;
  ct_available_live: boolean | null;
  mri_available_live: boolean | null;
  angiography_available_live: boolean | null;
  ventilator_available_live: boolean | null;
  ambulance_available_live: boolean | null;
  pediatric_ventilator_available_live: boolean | null;
  incubator_available_live: boolean | null;
  live_congestion_score: number | null;
  live_congestion_level: "unknown" | "full" | "high" | "medium" | "low";
  live_congestion_penalty: number | null;
  capacity_source: string;
  active_in_hospital_master: boolean;
};

export type HospitalStaticProfile = {
  hospital_id: string;
  hospital_name: string;
  district: string;
  address: string;
  total_doctors: number | null;
  specialist_doctors: number | null;
  total_beds: number | null;
  icu_beds: number | null;
  specialty_doctor_counts: Partial<Record<Department, number>>;
  source: string;
  collected_at: string;
  match_confidence: "high" | "medium" | "low" | "none" | string;
  notes: string;
};

export type MissingActiveCapacity = {
  hospital_id: string;
  hpid: string;
  hospital_name: string;
  district: string;
  emergency_level_raw: string;
  current_emergency_level_raw: string;
  emergency_level_model: HospitalLevel;
  capacity_missing_reason: string;
};

export type HospitalCandidate = {
  hospital: HospitalDim;
  capability: HospitalCapability;
  capacity?: HospitalCapacity;
  staticProfile?: HospitalStaticProfile;
};

export type TranscriptCase = {
  case_id: string;
  title: string;
  transcript: string;
};

export type ValidationResult = {
  valid: boolean;
  failures: string[];
  warnings: string[];
};
