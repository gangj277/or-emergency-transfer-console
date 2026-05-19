import type {
  BedBufferTier,
  Department,
  HospitalLevel,
  IncidentType,
  Resource,
} from "./types";

export const incidentTypeLabel: Record<IncidentType, string> = {
  fall_head_injury: "낙상 + 두부 손상",
  fall_orthopedic: "낙상 + 정형외과 손상",
  traffic_trauma: "교통/오토바이 외상",
  blunt_abdominal_trauma: "복부 둔상",
  minor_head_injury_anticoagulant: "경미 두부외상 + 항응고제/취약성",
  other_trauma: "기타 외상",
};

export const hospitalLevelLabel: Record<HospitalLevel, string> = {
  regional_center: "권역응급의료센터",
  local_center_or_above: "지역응급의료센터 이상",
  emergency_institution_ok: "응급의료기관 가능",
};

export const departmentLabel: Record<Department, string> = {
  emergency_medicine: "응급의학과",
  neurosurgery: "신경외과",
  orthopedics: "정형외과",
  general_surgery: "일반외과",
  trauma_surgery: "외상외과",
};

export const resourceLabel: Record<Resource, string> = {
  ct: "CT",
  xray: "X-ray",
  orthopedic_trauma: "정형외상 대응",
  surgery_capability: "수술 가능성",
  bleeding_control: "출혈 처치/수술",
  trauma_resuscitation: "외상 소생",
};

export const bedBufferLabel: Record<BedBufferTier, string> = {
  stable_buffer_gt_10: "안정 (10+ beds)",
  low_risk_6_10: "낮은 리스크 (6–10)",
  medium_risk_3_5: "중간 리스크 (3–5)",
  high_risk_1_2: "높은 리스크 (1–2)",
  infeasible_full_or_overcapacity: "부적합 (full / overcapacity)",
  unknown: "live 정보 없음",
};

export const constraintViolationLabel: Record<string, string> = {
  max_transport_time_exceeded: "최대 이송시간 초과",
  minimum_hospital_level_not_met: "요구 병원 수준 미충족",
  missing_live_er_bed_count: "실시간 응급실 병상 정보 없음",
  no_positive_available_er_beds: "가용 응급실 병상 없음",
  required_department_missing: "필수 진료과 미충족",
  required_resource_missing: "필수 자원 미충족",
};

export const factCategoryLabel: Record<string, string> = {
  incident_mechanism: "사고 기전",
  consciousness: "의식",
  breathing: "호흡",
  circulation_bleeding: "순환/출혈",
  pain: "통증",
  mobility: "보행/거동",
  injury_site: "손상 부위",
  vital_signs: "활력징후",
  time_course: "시간 경과",
  medication_history: "약물/병력",
  other: "기타",
};

export const factStatusLabel: Record<string, string> = {
  present: "있음",
  absent: "없음",
  unclear: "불명확",
};

export const ageGroupLabel: Record<string, string> = {
  unknown: "미상",
  adult: "성인",
  older_adult: "고령",
};
