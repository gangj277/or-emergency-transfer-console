"use client";

import type {
  OrParameters,
  PipelineValidation,
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
import { Divider, EmptyHint, InfoNote, MetricMeter, Panel, Pill, SubSection } from "./atoms";

export function PipelineOutputPanel({
  response,
  running,
  inputMode,
}: {
  response: RecommendationResponse | null;
  running: boolean;
  inputMode: "transcript" | "manual";
}) {
  if (!response && !running) {
    return (
      <Panel
        title="Pipeline"
        subtitle="LLM 추출 결과와 OR 변수 변환을 단계별로 확인합니다"
        meta={<span className="mono text-ink-faint">stage 1 → stage 2</span>}
      >
        <EmptyHint>
          좌측에서 sample case를 선택하고 <span className="mono">Run Recommendation</span>을 실행하세요.
          <br />
          Manual OR 모드에서는 LLM 단계가 생략되고 OR 변수가 그대로 사용됩니다.
        </EmptyHint>
      </Panel>
    );
  }

  if (!response && running) {
    return (
      <Panel
        title="Pipeline"
        subtitle="LLM 추출 결과와 OR 변수 변환을 단계별로 확인합니다"
        meta={<span className="mono text-ink-faint">stage 1 → stage 2</span>}
      >
        <PipelineSkeleton skipLLM={inputMode === "manual"} />
      </Panel>
    );
  }

  const data = response!;
  const ranLLM = data.pipeline.source === "llm_two_stage_pipeline";
  const stage1 = data.pipeline.stage1 ?? null;
  const orParams = data.pipeline.orParameters;
  const validation = data.pipeline.validation;

  return (
    <Panel
      title="Pipeline"
      subtitle={
        ranLLM
          ? "transcript → LLM medical observations → OR parameters"
          : "사용자가 OR 변수를 직접 공급 (LLM 단계 생략)"
      }
      meta={
        <span className="mono text-ink-faint">
          source · {ranLLM ? "llm_two_stage_pipeline" : "supplied_or_parameters"}
        </span>
      }
      bodyClassName="flex flex-col gap-5 p-4"
    >
      {validation ? <ValidationBanner validation={validation} /> : null}

      {ranLLM && stage1 ? (
        <Stage1Block stage1={stage1} />
      ) : (
        <SkippedStageNote text="Stage 1 medical observations — manual 모드라 생략" />
      )}

      <Divider />

      <Stage2Block params={orParams} skipped={false} />
    </Panel>
  );
}

function PipelineSkeleton({ skipLLM }: { skipLLM: boolean }) {
  const stages = skipLLM
    ? [{ key: "ranking", label: "Ranking hospitals" }]
    : [
        { key: "extracting", label: "Extracting medical observations" },
        { key: "converting", label: "Converting to OR parameters" },
        { key: "ranking", label: "Ranking hospitals" },
      ];
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] text-ink-muted">백엔드 응답을 기다리는 중입니다.</p>
      {stages.map((s, i) => (
        <div
          key={s.key}
          className="relative overflow-hidden rounded-md border border-line bg-surface-muted px-3 py-2"
        >
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="mono text-ink-soft">stage {i + 1}</span>
            <span className="text-ink-muted">{s.label}…</span>
          </div>
          <span className="or-stage-bar absolute inset-0" />
        </div>
      ))}
    </div>
  );
}

function ValidationBanner({ validation }: { validation: PipelineValidation }) {
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

function SkippedStageNote({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-line bg-surface-muted px-3 py-2 text-[11px] text-ink-muted">
      {text}
    </div>
  );
}

function Stage1Block({ stage1 }: { stage1: Stage1Observations }) {
  const obs = stage1.medical_observations;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[12px] font-semibold text-ink">
          Stage 1 · medical_observations
        </h3>
        <Pill tone="muted" size="xs">LLM 추출</Pill>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <FieldCell label="Incident type">{obs.incident_context.incident_type_text || "—"}</FieldCell>
        <FieldCell label="Location context">{obs.incident_context.location_context || "—"}</FieldCell>
        <FieldCell label="Injury mechanism">{obs.incident_context.injury_mechanism || "—"}</FieldCell>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <FieldCell label="Age group">
          <Pill tone={obs.patient_context.age_group === "older_adult" ? "warn" : "neutral"} size="xs">
            {ageGroupLabel[obs.patient_context.age_group] ?? obs.patient_context.age_group}
          </Pill>
        </FieldCell>
        <FieldCell label="Vulnerability mentions">
          <TagList items={obs.patient_context.vulnerability_mentions} tone="warn" empty="없음" />
        </FieldCell>
        <FieldCell label="Medication / history">
          <TagList items={obs.patient_context.medication_or_history_mentions} tone="neutral" empty="없음" />
        </FieldCell>
      </div>

      <SubSection label="Clinical facts" hint={`${obs.clinical_facts.length}건`}>
        <ul className="scrollbar-thin max-h-[180px] overflow-y-auto rounded-md border border-line bg-surface-muted">
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
      </SubSection>

      {obs.missing_critical_info.length > 0 ? (
        <SubSection label="Missing critical info" hint="LLM이 부족하다고 판단한 항목">
          <div className="flex flex-wrap gap-1.5">
            {obs.missing_critical_info.map((m, i) => (
              <Pill key={i} tone="warn" size="xs">{m}</Pill>
            ))}
          </div>
        </SubSection>
      ) : null}
    </div>
  );
}

function Stage2Block({ params, skipped }: { params: OrParameters; skipped: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[12px] font-semibold text-ink">
          Stage 2 · or_parameters
        </h3>
        <Pill tone={skipped ? "muted" : "accent"} size="xs">
          {skipped ? "skipped" : "ranking input"}
        </Pill>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        <FieldCell label="Incident type" mono>
          {incidentTypeLabel[params.incident_type]}
        </FieldCell>
        <FieldCell label="Max transport" mono>
          {params.max_transport_time_min} min
        </FieldCell>
        <FieldCell label="Min hospital level" mono>
          {hospitalLevelLabel[params.minimum_hospital_level]}
        </FieldCell>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-line bg-surface px-3 py-2">
          <MetricMeter label="Severity" value={params.severity_level} tone="danger" />
        </div>
        <div className="rounded-md border border-line bg-surface px-3 py-2">
          <MetricMeter label="Deter." value={params.deterioration_risk} tone="warn" />
        </div>
        <div className="rounded-md border border-line bg-surface px-3 py-2">
          <MetricMeter label="Vuln." value={params.vulnerability_level} tone="accent" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <SubSection label="Required departments">
          <div className="flex flex-wrap gap-1.5">
            {params.required_departments.map((d) => (
              <Pill key={d} tone="accent" size="sm">{departmentLabel[d]}</Pill>
            ))}
            {params.required_departments.length === 0 ? (
              <span className="text-[11px] text-ink-faint">없음</span>
            ) : null}
          </div>
        </SubSection>
        <SubSection label="Required resources">
          <div className="flex flex-wrap gap-1.5">
            {params.required_resources.map((r) => (
              <Pill key={r} tone="accent" size="sm">{resourceLabel[r]}</Pill>
            ))}
            {params.required_resources.length === 0 ? (
              <span className="text-[11px] text-ink-faint">없음</span>
            ) : null}
          </div>
        </SubSection>
      </div>

      {params.or_notes ? (
        <SubSection label="OR notes">
          <p className="rounded-md border border-line bg-surface-muted px-2.5 py-1.5 text-[11.5px] leading-snug text-ink-soft">
            {params.or_notes}
          </p>
        </SubSection>
      ) : null}
    </div>
  );
}

function FieldCell({
  label,
  children,
  mono = false,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-line bg-surface px-2.5 py-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
        {label}
      </span>
      <span className={`text-[12px] leading-snug text-ink ${mono ? "mono" : ""}`}>
        {children}
      </span>
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
