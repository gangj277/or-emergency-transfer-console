"use client";

import { useState } from "react";
import type {
  OrParameters,
  RecommendationResponse,
  Stage1Observations,
} from "@/lib/or-ui/types";
import {
  ageGroupLabel,
  departmentLabel,
  factCategoryLabel,
  factStatusLabel,
  hospitalLevelLabel,
  incidentTypeLabel,
  resourceLabel,
} from "@/lib/or-ui/labels";
import { Divider, InfoNote, MetricMeter, Pill } from "./atoms";

export function ReasoningTrace({
  response,
  running,
  inputMode,
}: {
  response: RecommendationResponse | null;
  running: boolean;
  inputMode: "transcript" | "manual";
}) {
  const [expanded, setExpanded] = useState(false);

  if (!response && !running) return null;

  if (!response && running) {
    return (
      <div className="overflow-hidden rounded-md border border-line bg-surface">
        <div className="relative flex items-center gap-2 px-3 py-2">
          <Spinner />
          <span className="text-[11.5px] font-medium text-ink-soft">
            {inputMode === "transcript"
              ? "Reasoning… transcript → medical observations → OR parameters → ranking"
              : "Reasoning… ranking 51 live-capacity candidates"}
          </span>
          <span className="or-stage-bar absolute inset-x-0 bottom-0 top-auto h-0.5" />
        </div>
      </div>
    );
  }

  const data = response!;
  const ranLLM = data.pipeline.source === "llm_two_stage_pipeline";
  const orParams = data.pipeline.orParameters;
  const stage1 = data.pipeline.stage1 ?? null;
  const validation = data.pipeline.validation;
  const factCount = stage1?.medical_observations?.clinical_facts?.length ?? 0;

  return (
    <div className="overflow-hidden rounded-md border border-line bg-surface">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-muted"
        aria-expanded={expanded}
      >
        <Chevron open={expanded} />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-[11.5px] font-semibold text-ink">
            Reasoning trace
          </span>
          <Pill tone={ranLLM ? "accent" : "muted"} size="xs">
            {ranLLM ? "LLM 2-stage" : "manual OR"}
          </Pill>
          {ranLLM ? (
            <span className="mono text-[10.5px] text-ink-muted">{factCount} facts</span>
          ) : null}
          <span className="hidden h-3 w-px bg-line md:inline-block" />
          <SummaryChips params={orParams} />
        </div>
        <span className="mono shrink-0 text-[10px] text-ink-faint">
          {expanded ? "− 접기" : "+ 자세히"}
        </span>
      </button>

      {expanded ? (
        <div className="flex flex-col gap-4 border-t border-line bg-surface-muted/40 px-4 py-4">
          {validation ? <ValidationBanner validation={validation} /> : null}

          {ranLLM && stage1 ? (
            <Stage1Block stage1={stage1} />
          ) : (
            <SkippedNote text="Stage 1 medical observations — manual OR 모드라 생략됨" />
          )}

          <Divider />

          <Stage2Block params={orParams} ranLLM={ranLLM} />
        </div>
      ) : null}
    </div>
  );
}

function SummaryChips({ params }: { params: OrParameters }) {
  const depts = params.required_departments.slice(0, 2);
  const moreDept = params.required_departments.length - depts.length;
  const res = params.required_resources.slice(0, 2);
  const moreRes = params.required_resources.length - res.length;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <ScoreChip label="sev" value={params.severity_level} tone="danger" />
      <ScoreChip label="det" value={params.deterioration_risk} tone="warn" />
      <ScoreChip label="vuln" value={params.vulnerability_level} tone="accent" />
      <Pill tone="muted" size="xs">
        ≤ {params.max_transport_time_min} min
      </Pill>
      <Pill tone="muted" size="xs" title={hospitalLevelLabel[params.minimum_hospital_level]}>
        {shortLevelLabel(params.minimum_hospital_level)}
      </Pill>
      {depts.map((d) => (
        <Pill key={d} tone="accent" size="xs">{departmentLabel[d]}</Pill>
      ))}
      {moreDept > 0 ? (
        <Pill tone="muted" size="xs">+{moreDept}</Pill>
      ) : null}
      {res.map((r) => (
        <Pill key={r} tone="accent" size="xs">{resourceLabel[r]}</Pill>
      ))}
      {moreRes > 0 ? (
        <Pill tone="muted" size="xs">+{moreRes}</Pill>
      ) : null}
    </div>
  );
}

function ScoreChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "danger" | "warn" | "accent";
}) {
  const cls = {
    danger: "border-tier-infeasible/40 text-tier-infeasible bg-tier-infeasible-soft",
    warn: "border-tier-medium/40 text-tier-medium bg-tier-medium-soft",
    accent: "border-accent/40 text-accent-ink bg-accent-soft",
  }[tone];
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-1.5 py-0 text-[10px] font-medium leading-4 ${cls}`}
      title={`${label} ${value} / 5`}
    >
      <span className="uppercase tracking-[0.08em] opacity-70">{label}</span>
      <span className="num">{value}/5</span>
    </span>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden
      className={`h-3 w-3 shrink-0 text-ink-muted transition-transform ${open ? "rotate-90" : ""}`}
      fill="currentColor"
    >
      <path d="M4 2.5l4 3.5-4 3.5z" />
    </svg>
  );
}

function Spinner() {
  return (
    <span
      className="inline-block h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-accent/30 border-t-accent"
      aria-hidden
    />
  );
}

function shortLevelLabel(level: OrParameters["minimum_hospital_level"]) {
  switch (level) {
    case "regional_center":
      return "권역";
    case "local_center_or_above":
      return "지역 이상";
    case "emergency_institution_ok":
      return "응급기관";
  }
}

function SkippedNote({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-line bg-surface px-3 py-2 text-[11px] text-ink-muted">
      {text}
    </div>
  );
}

function ValidationBanner({
  validation,
}: {
  validation: NonNullable<RecommendationResponse["pipeline"]["validation"]>;
}) {
  const warnings = [
    ...(validation.stage1?.warnings ?? []).map((w) => `stage1 · ${w}`),
    ...(validation.stage2?.warnings ?? []).map((w) => `stage2 · ${w}`),
  ];
  const failures = [
    ...(validation.stage1?.failures ?? []).map((w) => `stage1 · ${w}`),
    ...(validation.stage2?.failures ?? []).map((w) => `stage2 · ${w}`),
  ];
  if (failures.length === 0 && warnings.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {failures.length > 0 ? (
        <InfoNote tone="danger">
          <strong className="font-semibold">Validation failures:</strong>{" "}
          {failures.join(" / ")}
        </InfoNote>
      ) : null}
      {warnings.length > 0 ? (
        <InfoNote tone="warn">
          <strong className="font-semibold">Validation warnings:</strong>{" "}
          {warnings.join(" / ")}
        </InfoNote>
      ) : null}
    </div>
  );
}

function Stage1Block({ stage1 }: { stage1: Stage1Observations }) {
  const obs = stage1.medical_observations;
  return (
    <section className="flex flex-col gap-3">
      <SectionHead label="Stage 1 · medical observations" right={<Pill tone="muted" size="xs">LLM 추출</Pill>} />

      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <Field label="Incident type">{obs.incident_context.incident_type_text || "—"}</Field>
        <Field label="Location context">{obs.incident_context.location_context || "—"}</Field>
        <Field label="Injury mechanism">{obs.incident_context.injury_mechanism || "—"}</Field>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <Field label="Age group">
          <Pill tone={obs.patient_context.age_group === "older_adult" ? "warn" : "neutral"} size="xs">
            {ageGroupLabel[obs.patient_context.age_group] ?? obs.patient_context.age_group}
          </Pill>
        </Field>
        <Field label="Vulnerability mentions">
          <TagList items={obs.patient_context.vulnerability_mentions} tone="warn" empty="없음" />
        </Field>
        <Field label="Medication / history">
          <TagList items={obs.patient_context.medication_or_history_mentions} tone="neutral" empty="없음" />
        </Field>
      </div>

      <div className="flex flex-col gap-1.5">
        <SectionSubHead label="Clinical facts" hint={`${obs.clinical_facts.length}건`} />
        <ul className="scrollbar-thin max-h-[200px] overflow-y-auto rounded-md border border-line bg-surface">
          {obs.clinical_facts.map((f, i) => (
            <li
              key={i}
              className="flex items-start gap-2 border-b border-line px-2.5 py-1.5 last:border-b-0"
            >
              <Pill tone="muted" size="xs">{factCategoryLabel[f.category] ?? f.category}</Pill>
              <span className="flex-1 text-[11.5px] leading-snug text-ink">{f.finding}</span>
              <Pill
                tone={
                  f.status === "present" ? "ok" : f.status === "absent" ? "muted" : "warn"
                }
                size="xs"
              >
                {factStatusLabel[f.status] ?? f.status}
              </Pill>
            </li>
          ))}
        </ul>
      </div>

      {obs.missing_critical_info.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <SectionSubHead label="Missing critical info" hint="LLM이 부족하다고 판단한 항목" />
          <div className="flex flex-wrap gap-1.5">
            {obs.missing_critical_info.map((m, i) => (
              <Pill key={i} tone="warn" size="xs">{m}</Pill>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Stage2Block({ params, ranLLM }: { params: OrParameters; ranLLM: boolean }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionHead
        label="Stage 2 · OR parameters"
        right={
          <Pill tone="accent" size="xs">
            {ranLLM ? "ranking input" : "supplied directly"}
          </Pill>
        }
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-md border border-line bg-surface px-3 py-2">
          <MetricMeter label="Severity" value={params.severity_level} tone="danger" />
        </div>
        <div className="rounded-md border border-line bg-surface px-3 py-2">
          <MetricMeter label="Deterioration" value={params.deterioration_risk} tone="warn" />
        </div>
        <div className="rounded-md border border-line bg-surface px-3 py-2">
          <MetricMeter label="Vulnerability" value={params.vulnerability_level} tone="accent" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <InlineField label="Incident">{incidentTypeLabel[params.incident_type]}</InlineField>
        <InlineField label="Max transport">
          <span className="mono">{params.max_transport_time_min} min</span>
        </InlineField>
        <InlineField label="Min hospital level">
          {hospitalLevelLabel[params.minimum_hospital_level]}
        </InlineField>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <SectionSubHead label="Required departments" />
          <div className="flex flex-wrap gap-1.5">
            {params.required_departments.map((d) => (
              <Pill key={d} tone="accent" size="sm">{departmentLabel[d]}</Pill>
            ))}
            {params.required_departments.length === 0 ? (
              <span className="text-[11px] text-ink-faint">없음</span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <SectionSubHead label="Required resources" />
          <div className="flex flex-wrap gap-1.5">
            {params.required_resources.map((r) => (
              <Pill key={r} tone="accent" size="sm">{resourceLabel[r]}</Pill>
            ))}
            {params.required_resources.length === 0 ? (
              <span className="text-[11px] text-ink-faint">없음</span>
            ) : null}
          </div>
        </div>
      </div>

      {params.or_notes ? (
        <div className="flex flex-col gap-1.5">
          <SectionSubHead label="OR notes" />
          <p className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-[11.5px] leading-snug text-ink-soft">
            {params.or_notes}
          </p>
        </div>
      ) : null}
    </section>
  );
}

function SectionHead({ label, right }: { label: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-[12px] font-semibold text-ink">{label}</h3>
      {right ?? null}
    </div>
  );
}

function SectionSubHead({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
        {label}
      </span>
      {hint ? <span className="text-[10px] text-ink-faint">{hint}</span> : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-md border border-line bg-surface px-2.5 py-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
        {label}
      </span>
      <span className="break-words text-[12px] leading-snug text-ink">{children}</span>
    </div>
  );
}

function InlineField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-baseline gap-2 rounded-md border border-line bg-surface px-2.5 py-1.5">
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
        {label}
      </span>
      <span className="min-w-0 truncate text-[12px] text-ink">{children}</span>
    </div>
  );
}

function TagList({
  items,
  tone,
  empty,
}: {
  items: string[];
  tone: "warn" | "neutral";
  empty: string;
}) {
  if (items.length === 0) {
    return <span className="text-[11px] text-ink-faint">{empty}</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((it, i) => (
        <Pill key={i} tone={tone} size="xs">{it}</Pill>
      ))}
    </div>
  );
}
