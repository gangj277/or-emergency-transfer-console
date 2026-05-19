"use client";

import type { ReactNode } from "react";
import type { BedBufferTier } from "@/lib/or-ui/types";
import { bedBufferLabel } from "@/lib/or-ui/labels";
import { bedBufferTierStyle } from "@/lib/or-ui/tiers";

export function Panel({
  title,
  subtitle,
  meta,
  children,
  className = "",
  bodyClassName = "",
}: {
  title: string;
  subtitle?: string;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={`flex flex-col rounded-lg border border-line bg-surface ${className}`}
    >
      <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex flex-col">
          <h2 className="text-[13px] font-semibold tracking-tight text-ink">{title}</h2>
          {subtitle ? (
            <p className="mt-0.5 text-[11px] leading-snug text-ink-muted">{subtitle}</p>
          ) : null}
        </div>
        {meta ? <div className="shrink-0 text-[11px] text-ink-muted">{meta}</div> : null}
      </header>
      <div className={`flex-1 ${bodyClassName || "p-4"}`}>{children}</div>
    </section>
  );
}

export function SubSection({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
          {label}
        </h3>
        {hint ? <span className="text-[10px] text-ink-faint">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

export function Pill({
  children,
  tone = "neutral",
  size = "sm",
  title,
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "ok" | "warn" | "danger" | "muted";
  size?: "sm" | "xs";
  title?: string;
}) {
  const toneCls = {
    neutral: "border-line-strong bg-surface-muted text-ink-soft",
    accent: "border-accent/30 bg-accent-soft text-accent-ink",
    ok: "border-tier-stable/30 bg-tier-stable-soft text-tier-stable",
    warn: "border-tier-medium/30 bg-tier-medium-soft text-tier-medium",
    danger: "border-tier-infeasible/30 bg-tier-infeasible-soft text-tier-infeasible",
    muted: "border-line bg-surface-sunken text-ink-muted",
  }[tone];
  const sizeCls = size === "xs" ? "px-1.5 py-0 text-[10px]" : "px-2 py-0.5 text-[11px]";
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border ${toneCls} ${sizeCls} font-medium leading-4`}
    >
      {children}
    </span>
  );
}

export function KPI({
  label,
  value,
  unit,
  tone = "default",
  hint,
  align = "left",
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  tone?: "default" | "accent" | "warn" | "danger" | "ok" | "muted";
  hint?: ReactNode;
  align?: "left" | "right";
}) {
  const toneCls = {
    default: "text-ink",
    accent: "text-accent-ink",
    warn: "text-tier-medium",
    danger: "text-tier-infeasible",
    ok: "text-tier-stable",
    muted: "text-ink-muted",
  }[tone];
  return (
    <div className={`flex flex-col ${align === "right" ? "items-end" : "items-start"}`}>
      <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-muted">
        {label}
      </span>
      <span className={`num mt-1 text-[20px] font-semibold leading-none ${toneCls}`}>
        {value}
        {unit ? (
          <span className="ml-1 text-[11px] font-normal text-ink-muted">{unit}</span>
        ) : null}
      </span>
      {hint ? <span className="mt-1 text-[10px] text-ink-faint">{hint}</span> : null}
    </div>
  );
}

export function TierBadge({
  tier,
  beds,
  size = "md",
}: {
  tier: BedBufferTier;
  beds: number | null;
  size?: "md" | "sm";
}) {
  const style = bedBufferTierStyle[tier];
  const sizeCls =
    size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-[11px]";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border ${style.border} ${style.bg} ${style.fg} ${sizeCls} font-medium`}
      title={bedBufferLabel[tier]}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.swatch}`} />
      <span>{bedBufferLabel[tier]}</span>
      {beds !== null ? (
        <span className="num text-ink-muted">· {beds} beds</span>
      ) : null}
    </span>
  );
}

export function StatusDot({
  state,
  pulse = false,
}: {
  state: "ok" | "warn" | "off" | "info";
  pulse?: boolean;
}) {
  const cls = {
    ok: "bg-tier-stable",
    warn: "bg-tier-medium",
    off: "bg-line-strong",
    info: "bg-accent",
  }[state];
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${cls} ${pulse ? "or-pulse" : ""}`}
    />
  );
}

export function MetricMeter({
  value,
  max = 5,
  label,
  tone = "accent",
}: {
  value: number;
  max?: number;
  label: string;
  tone?: "accent" | "warn" | "danger";
}) {
  const clamped = Math.max(0, Math.min(max, value));
  const segments = Array.from({ length: max }, (_, i) => i < clamped);
  const fillCls = {
    accent: "bg-accent",
    warn: "bg-tier-medium",
    danger: "bg-tier-infeasible",
  }[tone];
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
          {label}
        </span>
        <span className="num shrink-0 whitespace-nowrap text-[12px] font-semibold text-ink">
          {clamped}
          <span className="text-[10px] font-normal text-ink-faint">/{max}</span>
        </span>
      </div>
      <div className="flex h-1.5 gap-1">
        {segments.map((on, i) => (
          <span
            key={i}
            className={`flex-1 rounded-sm ${on ? fillCls : "bg-surface-sunken"}`}
          />
        ))}
      </div>
    </div>
  );
}

export function Divider({ className = "" }: { className?: string }) {
  return <div className={`h-px w-full bg-line ${className}`} />;
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[120px] items-center justify-center rounded-md border border-dashed border-line bg-surface-muted px-4 py-6 text-center text-[12px] leading-5 text-ink-muted">
      <div className="max-w-sm">{children}</div>
    </div>
  );
}

export function InfoNote({
  tone = "info",
  children,
}: {
  tone?: "info" | "warn" | "danger";
  children: ReactNode;
}) {
  const cls = {
    info: "border-accent/30 bg-accent-soft/60 text-accent-ink",
    warn: "border-tier-medium/30 bg-tier-medium-soft/60 text-tier-medium",
    danger: "border-tier-infeasible/30 bg-tier-infeasible-soft/60 text-tier-infeasible",
  }[tone];
  return (
    <div className={`rounded-md border px-3 py-2 text-[11px] leading-5 ${cls}`}>
      {children}
    </div>
  );
}
