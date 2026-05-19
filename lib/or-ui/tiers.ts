import type { BedBufferTier } from "./types";

export type TierStyle = {
  fg: string;
  bg: string;
  border: string;
  swatch: string;
};

export const bedBufferTierStyle: Record<BedBufferTier, TierStyle> = {
  stable_buffer_gt_10: {
    fg: "text-tier-stable",
    bg: "bg-tier-stable-soft",
    border: "border-tier-stable/40",
    swatch: "bg-tier-stable",
  },
  low_risk_6_10: {
    fg: "text-tier-low",
    bg: "bg-tier-low-soft",
    border: "border-tier-low/40",
    swatch: "bg-tier-low",
  },
  medium_risk_3_5: {
    fg: "text-tier-medium",
    bg: "bg-tier-medium-soft",
    border: "border-tier-medium/40",
    swatch: "bg-tier-medium",
  },
  high_risk_1_2: {
    fg: "text-tier-high",
    bg: "bg-tier-high-soft",
    border: "border-tier-high/40",
    swatch: "bg-tier-high",
  },
  infeasible_full_or_overcapacity: {
    fg: "text-tier-infeasible",
    bg: "bg-tier-infeasible-soft",
    border: "border-tier-infeasible/40",
    swatch: "bg-tier-infeasible",
  },
  unknown: {
    fg: "text-tier-unknown",
    bg: "bg-tier-unknown-soft",
    border: "border-tier-unknown/30",
    swatch: "bg-tier-unknown",
  },
};

export const tierOrder: BedBufferTier[] = [
  "stable_buffer_gt_10",
  "low_risk_6_10",
  "medium_risk_3_5",
  "high_risk_1_2",
  "infeasible_full_or_overcapacity",
  "unknown",
];
