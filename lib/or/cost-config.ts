// Centralized cost coefficients for the OR ranking objective.
//
// These were previously inline literals scattered through `recommendation.ts`.
// They are externalized here so sensitivity analysis (scripts/evaluate-or-model.ts)
// can perturb them in one principled place. NOTE: there is no labeled "correct
// hospital" gold set, so these are NOT fit to labels — they are hand-set priors
// whose sensitivity must be reported, not claimed as calibrated.
//
// Extraction-only: values match the prior inline literals exactly, EXCEPT the new
// `time.*` block, which powers the soft (graduated) travel-time penalty that
// replaced the former hard `max_transport_time` cutoff.

export const OR_COST_CONFIG = {
  // Linear scaling of estimated travel minutes (× urgency weight).
  travelCostPerMin: 10,

  // Soft penalty per administrative-tier gap below the requested minimum level.
  // Emergency level is a PREFERENCE, not a hard gate — real acceptance is decided
  // by capability matching (required_departments/resources). A 1-tier gap costs
  // this much, a 2-tier gap twice as much (preserving the prior max magnitude).
  levelPenaltyPerTier: 350,

  // Penalty applied to genuine binary hard-constraint violations
  // (ER beds, level, required departments/resources). Travel time is NOT here.
  hardConstraint: { base: 100_000, perViolation: 2_500 },

  // Urgency weight = 1 + Σ coef·(score − 1) over severity/deterioration/vulnerability.
  urgency: { severity: 0.25, deterioration: 0.2, vulnerability: 0.1 },

  // Bed-buffer risk: base penalty per ER-bed tier, scaled by slack factor × urgency.
  bedBuffer: {
    base: {
      unknown: 260,
      infeasible_full_or_overcapacity: 900,
      high_risk_1: 180, // exactly 1 available ER bed
      high_risk_2: 140, // 2 available ER beds
      medium_risk_3_5: 70,
      low_risk_6_10: 25,
      stable_buffer_gt_10: 5,
    },
    slack: { tightUnder5: 1.4, tightUnder10: 1.15, normal: 1 },
  },

  // Resource-margin risk: graduated penalties for thin surgical/ICU capacity,
  // plus flat penalties when a required live resource signal is missing.
  margin: {
    surgery: { thresholds: [0, 2, 5] as [number, number, number], penalties: [180, 110, 45, 0] as [number, number, number, number] },
    icu: { thresholds: [0, 2, 5] as [number, number, number], penalties: [150, 80, 35, 0] as [number, number, number, number] },
    ctFallback: 35, // CT required, not live-available, but statically present
    ventilatorMissing: 60, // ventilation required but live ventilator reported false
    angiographyMissing: 50, // cath/PCI required but live angiography not available
    mriMissing: 50, // thrombectomy/thrombolysis required but live MRI not available
    urgencyBase: 0.65,
    urgencyFactor: 0.12,
  },

  // Static reliability (HIRA profile) penalties. Currently inert (profiles unloaded).
  staticReliability: {
    doctorsLt50: 55,
    doctorsLt150: 25,
    bedsLt100: 45,
    bedsLt300: 20,
    icuLt5: 25,
  },

  // Soft travel-time penalty. Replaces the former hard cutoff so a hospital that
  // only exceeds the requested window stays feasible but pays a steep, convex cost.
  // cost = softBase + perMin·overMin + quadratic·overMin²  (overMin = travel − max_t).
  time: { softBase: 400, perMin: 120, quadratic: 6 },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// normalized_utility_v3 — dimensionless, interpretable objective.
//
// First-principles redesign. The v2 objective above summed incommensurable
// magic-number penalties (travel≈100-300, bedRisk 5-900, level 700, hard 100000);
// the gap report showed coefficient perturbations flipped up to 18/40 top picks,
// i.e. rankings were an artifact of arbitrary scaling. v3 instead maps every
// criterion to a unit utility u∈[0,1] (higher = better) and combines them with a
// few weights that SUM TO 1 — so each weight is a real, defensible tradeoff share,
// not a magnitude. Urgency shifts the weight BALANCE (not a cost multiplier):
// sicker patients value speed + definitive capability over bed-buffer comfort.
//
// Still hand-set priors (no patient-outcome gold set), but now few, dimensionless,
// and sensitivity-reported — the honest research-grade stance.
export const OR_UTILITY_V3_CONFIG = {
  // Base weight shares at acuity 0 (sum to 1).
  weights: { time: 0.4, capacity: 0.3, capability: 0.3 },
  // Added to the time / capability shares at acuity 1, then all three renormalized
  // to sum 1 (so capacity's relative share shrinks for critical patients).
  urgencyShift: { time: 0.5, capability: 0.3 },

  // acuity a∈[0,1] = Σ urgency.coef·(score−1) / maxΣ, reusing OR_COST_CONFIG.urgency.
  // maxΣ = (0.25+0.2+0.1)·4 = 2.2 (all three scores at 5).
  acuityMaxSum: 2.2,

  // u_time = exp(−travelMin / tauMin): smooth, monotone, clinically interpretable
  // half-life (~tau·ln2 min halves desirability). Over-window decays naturally.
  uTime: { tauMin: 12 },

  // u_capacity: saturating headroom from LIVE availability (not total capacity,
  // which HIRA doesn't expose). bed = beds/(beds+halfSat); resource margin same.
  uCapacity: { bedHalfSat: 5, resourceHalfSat: 3, bedWeight: 0.6, resourceWeight: 0.4 },

  // u_capability: definitive-care fit. depth = specialists/(specialists+halfSat)
  // averaged over required departments (HIRA specialty_doctor_counts); blended with
  // level adequacy. neutralDepth used when no HIRA counts are available (unmatched).
  uCapability: {
    specialistHalfSat: 5,
    neutralDepth: 0.5,
    depthWeight: 0.6,
    levelWeight: 0.4,
    // level adequacy ∈ [0,1]: meets requirement → levelMeets; +levelPerTier per tier
    // above; −levelPerTier per tier below. Clamped to [0,1].
    levelMeets: 0.6,
    levelPerTier: 0.2,
  },
} as const;

// Ambulance correction applied to Kakao *car* travel time when building the
// precomputed road-time matrix (scripts/build-travel-matrix.ts). Ambulances move
// faster than general traffic (priority + sirens), so car time is scaled down.
// Hand-set prior — no ambulance-trajectory data to calibrate it — kept as one
// labeled constant, tunable once real EMS transit data exists.
export const AMBULANCE_SPEED_FACTOR = 0.8;
