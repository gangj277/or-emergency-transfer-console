import capabilitiesJson from "../../data/or/hospital_capability_active.json";
import capacityMetadataJson from "../../data/or/hospital_capacity_metadata.json";
import missingCapacityJson from "../../data/or/hospital_capacity_missing_active.json";
import capacityJson from "../../data/or/hospital_capacity_snapshot_active.json";
import hospitalsJson from "../../data/or/hospital_dim_active.json";
import staticProfilesJson from "../../data/or/hospital_static_profile.json";
import sourceCrosscheckJson from "../../data/or/source_crosscheck.json";
import type {
  HospitalCandidate,
  HospitalCapability,
  HospitalCapacity,
  HospitalDim,
  HospitalStaticProfile,
  MissingActiveCapacity,
} from "./types";

export function loadHospitalData() {
  const hospitals = hospitalsJson as HospitalDim[];
  const capabilities = capabilitiesJson as HospitalCapability[];
  const capacitySnapshot = capacityJson as HospitalCapacity[];
  const staticProfiles = staticProfilesJson as HospitalStaticProfile[];
  const missingActiveCapacity = missingCapacityJson as MissingActiveCapacity[];
  const capabilityById = new Map(capabilities.map((item) => [item.hospital_id, item]));
  const capacityById = new Map(capacitySnapshot.map((item) => [item.hospital_id, item]));
  const staticProfileById = new Map(staticProfiles.map((item) => [item.hospital_id, item]));

  const activeCandidates: HospitalCandidate[] = hospitals.map((hospital) => ({
    hospital,
    capability: capabilityById.get(hospital.hospital_id) ?? fallbackCapability(hospital.hospital_id),
    capacity: capacityById.get(hospital.hospital_id),
    staticProfile: staticProfileById.get(hospital.hospital_id) ?? fallbackStaticProfile(hospital),
  }));

  const primaryCandidates = activeCandidates.filter((candidate) => candidate.capacity);

  return {
    hospitals,
    capabilities,
    capacitySnapshot,
    missingActiveCapacity,
    activeCandidates,
    primaryCandidates,
    sourceCrosscheck: sourceCrosscheckJson,
    capacityMetadata: capacityMetadataJson,
    staticProfiles,
    summary: {
      activeHospitalCount: hospitals.length,
      liveCapacityHospitalCount: primaryCandidates.length,
      activeWithoutLiveCapacityCount: missingActiveCapacity.length,
      staticProfileCount: staticProfiles.length,
      candidatePolicy: "primary_live_capacity_51",
      staticProfilePolicy: "hira_pending_neutral_until_authorized_profile_available",
    },
  };
}

function fallbackCapability(hospitalId: string): HospitalCapability {
  return {
    hospital_id: hospitalId,
    has_ct_static: false,
    has_xray_static: false,
    has_neurosurgery_department: false,
    has_orthopedics_department: false,
    has_general_surgery_department: false,
    has_trauma_surgery_department: false,
    has_emergency_medicine_department: false,
    has_or_static: false,
    has_icu_static: false,
    has_neuro_icu_static: false,
    has_trauma_icu_static: false,
    capability_source: "missing_capability_row",
    capability_confidence: "low",
    capability_notes: "No capability row was found for this hospital.",
  };
}

function fallbackStaticProfile(hospital: HospitalDim): HospitalStaticProfile {
  return {
    hospital_id: hospital.hospital_id,
    hospital_name: hospital.hospital_name,
    district: hospital.district,
    address: hospital.address,
    total_doctors: null,
    specialist_doctors: null,
    total_beds: null,
    icu_beds: null,
    specialty_doctor_counts: {},
    source: "hira_profile_not_loaded",
    collected_at: "",
    match_confidence: "none",
    notes: "Neutral static profile fallback. Live NEMC capacity remains the primary scoring source.",
  };
}
