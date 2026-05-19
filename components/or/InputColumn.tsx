"use client";

import type { Department, HospitalLevel, IncidentType, OrParameters, Resource } from "@/lib/or-ui/types";
import {
  departmentLabel,
  hospitalLevelLabel,
  incidentTypeLabel,
  resourceLabel,
} from "@/lib/or-ui/labels";
import { SAMPLE_CASES, seoulPresets } from "@/lib/or-ui/samples";
import { Panel, Pill, SubSection, MetricMeter } from "./atoms";

const incidentTypeOptions: IncidentType[] = [
  "fall_head_injury",
  "fall_orthopedic",
  "traffic_trauma",
  "blunt_abdominal_trauma",
  "minor_head_injury_anticoagulant",
  "other_trauma",
];

const departmentOptions: Department[] = [
  "emergency_medicine",
  "neurosurgery",
  "orthopedics",
  "general_surgery",
  "trauma_surgery",
];

const resourceOptions: Resource[] = [
  "ct",
  "xray",
  "orthopedic_trauma",
  "surgery_capability",
  "bleeding_control",
  "trauma_resuscitation",
];

const hospitalLevelOptions: HospitalLevel[] = [
  "emergency_institution_ok",
  "local_center_or_above",
  "regional_center",
];

const maxTransportOptions: OrParameters["max_transport_time_min"][] = [10, 15, 20, 30, 45, 60];

export type FormState = {
  mode: "transcript" | "manual";
  selectedCaseId: string | null;
  caseTitle: string;
  transcript: string;
  orParameters: OrParameters;
  location: { lat: string; lon: string };
};

export type RunStatus =
  | { kind: "idle" }
  | { kind: "validating" }
  | { kind: "running"; stage: "extracting" | "converting" | "ranking" }
  | { kind: "success" }
  | { kind: "error"; message: string };

export function InputColumn({
  form,
  status,
  onChange,
  onRun,
  ranLLMLast,
}: {
  form: FormState;
  status: RunStatus;
  onChange: (next: FormState) => void;
  onRun: () => void;
  ranLLMLast: boolean;
}) {
  const running = status.kind === "running" || status.kind === "validating";

  function setMode(mode: "transcript" | "manual") {
    onChange({ ...form, mode });
  }

  function pickSample(caseId: string) {
    const sample = SAMPLE_CASES.find((c) => c.case_id === caseId);
    if (!sample) return;
    onChange({
      ...form,
      selectedCaseId: caseId,
      caseTitle: sample.title,
      transcript: sample.transcript,
    });
  }

  function updateOr<K extends keyof OrParameters>(key: K, value: OrParameters[K]) {
    onChange({ ...form, orParameters: { ...form.orParameters, [key]: value } });
  }

  function toggleArrayMember<T extends string>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  return (
    <Panel
      title="입력"
      subtitle="응급 통화 transcript 또는 OR 변수를 직접 입력하세요"
      meta={
        <ModeToggle value={form.mode} onChange={setMode} disabled={running} />
      }
      bodyClassName="flex flex-col gap-5 p-4"
    >
      {form.mode === "transcript" ? (
        <TranscriptFields
          form={form}
          disabled={running}
          onPickSample={pickSample}
          onTitleChange={(v) => onChange({ ...form, caseTitle: v, selectedCaseId: null })}
          onTranscriptChange={(v) => onChange({ ...form, transcript: v, selectedCaseId: null })}
        />
      ) : (
        <ManualFields
          params={form.orParameters}
          disabled={running}
          onUpdate={updateOr}
          onToggleDept={(dept) =>
            updateOr("required_departments", toggleArrayMember(form.orParameters.required_departments, dept))
          }
          onToggleResource={(res) =>
            updateOr("required_resources", toggleArrayMember(form.orParameters.required_resources, res))
          }
        />
      )}

      <LocationFields
        location={form.location}
        disabled={running}
        onChange={(loc) => onChange({ ...form, location: loc })}
      />

      <RunButton status={status} disabled={running} onRun={onRun} ranLLMLast={ranLLMLast} />
    </Panel>
  );
}

function ModeToggle({
  value,
  onChange,
  disabled,
}: {
  value: "transcript" | "manual";
  onChange: (v: "transcript" | "manual") => void;
  disabled: boolean;
}) {
  return (
    <div
      role="tablist"
      aria-label="입력 모드"
      className="inline-flex rounded-md border border-line bg-surface-muted p-0.5 text-[11px]"
    >
      {(["transcript", "manual"] as const).map((m) => {
        const active = value === m;
        return (
          <button
            key={m}
            role="tab"
            aria-selected={active}
            disabled={disabled}
            onClick={() => onChange(m)}
            className={`rounded-[5px] px-2.5 py-1 font-medium transition-colors ${
              active
                ? "bg-surface text-ink shadow-[0_1px_0_rgba(15,23,42,0.04)]"
                : "text-ink-muted hover:text-ink"
            } disabled:cursor-not-allowed`}
          >
            {m === "transcript" ? "Transcript" : "Manual OR"}
          </button>
        );
      })}
    </div>
  );
}

function TranscriptFields({
  form,
  disabled,
  onPickSample,
  onTitleChange,
  onTranscriptChange,
}: {
  form: FormState;
  disabled: boolean;
  onPickSample: (id: string) => void;
  onTitleChange: (v: string) => void;
  onTranscriptChange: (v: string) => void;
}) {
  return (
    <>
      <SubSection label="Sample cases" hint="5개 시연 케이스">
        <div className="grid grid-cols-1 gap-1.5">
          {SAMPLE_CASES.map((c) => {
            const active = form.selectedCaseId === c.case_id;
            return (
              <button
                key={c.case_id}
                type="button"
                disabled={disabled}
                onClick={() => onPickSample(c.case_id)}
                className={`group flex flex-col items-start gap-0.5 rounded-md border px-2.5 py-2 text-left text-[12px] transition-colors disabled:cursor-not-allowed ${
                  active
                    ? "border-accent/40 bg-accent-soft/60 text-accent-ink"
                    : "border-line bg-surface hover:border-line-strong hover:bg-surface-muted"
                }`}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="mono text-[10px] font-semibold tracking-[0.04em] text-ink-muted">
                    {c.shortLabel}
                  </span>
                  <span className="text-[10px] text-ink-faint">{c.hint}</span>
                </div>
                <span className="text-[12px] leading-snug text-ink">{c.title}</span>
              </button>
            );
          })}
        </div>
      </SubSection>

      <SubSection label="Case title">
        <input
          type="text"
          value={form.caseTitle}
          disabled={disabled}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="case title (선택)"
          className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-[12px] text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:bg-surface-muted"
        />
      </SubSection>

      <SubSection label="Transcript" hint={`${form.transcript.length.toLocaleString()} chars`}>
        <textarea
          value={form.transcript}
          disabled={disabled}
          onChange={(e) => onTranscriptChange(e.target.value)}
          placeholder="119상황실: ..."
          rows={10}
          className="scrollbar-thin mono w-full resize-y rounded-md border border-line bg-surface px-2.5 py-2 text-[11.5px] leading-5 text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:bg-surface-muted"
        />
      </SubSection>
    </>
  );
}

function ManualFields({
  params,
  disabled,
  onUpdate,
  onToggleDept,
  onToggleResource,
}: {
  params: OrParameters;
  disabled: boolean;
  onUpdate: <K extends keyof OrParameters>(key: K, value: OrParameters[K]) => void;
  onToggleDept: (d: Department) => void;
  onToggleResource: (r: Resource) => void;
}) {
  return (
    <>
      <SubSection label="Incident type">
        <select
          value={params.incident_type}
          disabled={disabled}
          onChange={(e) => onUpdate("incident_type", e.target.value as IncidentType)}
          className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-[12px] text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:bg-surface-muted"
        >
          {incidentTypeOptions.map((opt) => (
            <option key={opt} value={opt}>
              {incidentTypeLabel[opt]}
            </option>
          ))}
        </select>
      </SubSection>

      <div className="grid grid-cols-1 gap-3">
        <MeterField
          label="Severity (중증도)"
          value={params.severity_level}
          disabled={disabled}
          onChange={(v) => onUpdate("severity_level", v)}
          tone="danger"
        />
        <MeterField
          label="Deterioration risk (악화)"
          value={params.deterioration_risk}
          disabled={disabled}
          onChange={(v) => onUpdate("deterioration_risk", v)}
          tone="warn"
        />
        <MeterField
          label="Vulnerability (취약성)"
          value={params.vulnerability_level}
          disabled={disabled}
          onChange={(v) => onUpdate("vulnerability_level", v)}
          tone="accent"
        />
      </div>

      <SubSection label="Required departments" hint="복수 선택">
        <ChipGroup
          options={departmentOptions}
          selected={params.required_departments}
          disabled={disabled}
          getLabel={(d) => departmentLabel[d]}
          onToggle={onToggleDept}
        />
      </SubSection>

      <SubSection label="Required resources" hint="복수 선택">
        <ChipGroup
          options={resourceOptions}
          selected={params.required_resources}
          disabled={disabled}
          getLabel={(r) => resourceLabel[r]}
          onToggle={onToggleResource}
        />
      </SubSection>

      <div className="grid grid-cols-2 gap-3">
        <SubSection label="Max transport time">
          <select
            value={params.max_transport_time_min}
            disabled={disabled}
            onChange={(e) =>
              onUpdate(
                "max_transport_time_min",
                Number(e.target.value) as OrParameters["max_transport_time_min"],
              )
            }
            className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-[12px] text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:bg-surface-muted"
          >
            {maxTransportOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt} min
              </option>
            ))}
          </select>
        </SubSection>
        <SubSection label="Minimum hospital level">
          <select
            value={params.minimum_hospital_level}
            disabled={disabled}
            onChange={(e) => onUpdate("minimum_hospital_level", e.target.value as HospitalLevel)}
            className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-[12px] text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:bg-surface-muted"
          >
            {hospitalLevelOptions.map((opt) => (
              <option key={opt} value={opt}>
                {hospitalLevelLabel[opt]}
              </option>
            ))}
          </select>
        </SubSection>
      </div>

      <SubSection label="OR notes (선택)">
        <input
          type="text"
          value={params.or_notes}
          disabled={disabled}
          onChange={(e) => onUpdate("or_notes", e.target.value)}
          placeholder="발표용 메모"
          className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-[12px] text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:bg-surface-muted"
        />
      </SubSection>
    </>
  );
}

function MeterField({
  label,
  value,
  disabled,
  onChange,
  tone,
}: {
  label: string;
  value: number;
  disabled: boolean;
  onChange: (v: number) => void;
  tone: "danger" | "warn" | "accent";
}) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-line bg-surface px-3 py-2">
      <MetricMeter value={value} max={5} label={label} tone={tone} />
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((lvl) => (
          <button
            key={lvl}
            type="button"
            disabled={disabled}
            onClick={() => onChange(lvl)}
            className={`num flex-1 rounded-sm border py-1 text-[11px] font-medium transition-colors ${
              value === lvl
                ? "border-accent bg-accent text-white"
                : "border-line bg-surface text-ink-soft hover:bg-surface-muted"
            } disabled:cursor-not-allowed`}
          >
            {lvl}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChipGroup<T extends string>({
  options,
  selected,
  disabled,
  getLabel,
  onToggle,
}: {
  options: T[];
  selected: T[];
  disabled: boolean;
  getLabel: (v: T) => string;
  onToggle: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const active = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            disabled={disabled}
            onClick={() => onToggle(opt)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:cursor-not-allowed ${
              active
                ? "border-accent bg-accent text-white"
                : "border-line bg-surface text-ink-soft hover:border-line-strong hover:bg-surface-muted"
            }`}
          >
            {getLabel(opt)}
          </button>
        );
      })}
    </div>
  );
}

function LocationFields({
  location,
  disabled,
  onChange,
}: {
  location: FormState["location"];
  disabled: boolean;
  onChange: (loc: FormState["location"]) => void;
}) {
  return (
    <SubSection
      label="Incident location"
      hint="신고 위치 (위경도 가정)"
    >
      <div className="flex flex-wrap gap-1.5">
        {seoulPresets.map((p) => {
          const matched =
            Number(location.lat).toFixed(4) === p.lat.toFixed(4) &&
            Number(location.lon).toFixed(4) === p.lon.toFixed(4);
          return (
            <button
              key={p.label}
              type="button"
              disabled={disabled}
              onClick={() =>
                onChange({ lat: String(p.lat), lon: String(p.lon) })
              }
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:cursor-not-allowed ${
                matched
                  ? "border-accent/40 bg-accent-soft text-accent-ink"
                  : "border-line bg-surface text-ink-soft hover:bg-surface-muted"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <LatLonInput
          label="lat"
          value={location.lat}
          disabled={disabled}
          onChange={(lat) => onChange({ ...location, lat })}
        />
        <LatLonInput
          label="lon"
          value={location.lon}
          disabled={disabled}
          onChange={(lon) => onChange({ ...location, lon })}
        />
      </div>
      <p className="mt-1 text-[10px] leading-snug text-ink-faint">
        현재 위치는 transcript에서 추출하지 않고, 신고 위치를 알고 있다고 가정합니다.
        이송시간은 직선거리 기반 추정치이며 실시간 교통 API가 아닙니다.
      </p>
    </SubSection>
  );
}

function LatLonInput({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[11px] focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
      <span className="mono text-[10px] uppercase tracking-[0.1em] text-ink-faint">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="num w-full bg-transparent text-[12px] text-ink outline-none placeholder:text-ink-faint disabled:cursor-not-allowed"
      />
    </label>
  );
}

function RunButton({
  status,
  disabled,
  onRun,
  ranLLMLast,
}: {
  status: RunStatus;
  disabled: boolean;
  onRun: () => void;
  ranLLMLast: boolean;
}) {
  const label =
    status.kind === "running"
      ? status.stage === "extracting"
        ? "Extracting medical observations…"
        : status.stage === "converting"
          ? "Converting to OR parameters…"
          : "Ranking hospitals…"
      : status.kind === "validating"
        ? "Validating input…"
        : "Run Recommendation";

  return (
    <div className="flex flex-col gap-2 pt-1">
      <button
        type="button"
        disabled={disabled}
        onClick={onRun}
        className="relative w-full overflow-hidden rounded-md border border-accent bg-accent px-3 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-accent-ink disabled:cursor-progress disabled:bg-accent/70"
      >
        <span className="relative z-10 flex items-center justify-center gap-2">
          {status.kind === "running" || status.kind === "validating" ? (
            <Spinner />
          ) : (
            <RunIcon />
          )}
          <span>{label}</span>
        </span>
        {status.kind === "running" ? <span className="or-stage-bar absolute inset-0" /> : null}
      </button>
      {status.kind === "error" ? (
        <Pill tone="danger">⚠ {status.message}</Pill>
      ) : status.kind === "success" ? (
        <div className="flex items-center justify-between gap-2 text-[10px] text-ink-muted">
          <span>마지막 실행: {ranLLMLast ? "transcript → LLM 2-stage → ranking" : "manual OR → ranking"}</span>
          <span className="mono text-ink-faint">limit 3</span>
        </div>
      ) : null}
    </div>
  );
}

function Spinner() {
  return (
    <span
      className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white"
      aria-hidden
    />
  );
}

function RunIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
      <path d="M4 2.5v11l9-5.5z" />
    </svg>
  );
}
