"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { runRecommendation } from "@/lib/or-ui/fetcher";
import { SAMPLE_CASES } from "@/lib/or-ui/samples";
import type { OrParameters, RecommendationResponse } from "@/lib/or-ui/types";
import { OperationalStatusBar } from "./OperationalStatusBar";
import { InputColumn, type FormState, type RunStatus } from "./InputColumn";
import { ReasoningTrace } from "./ReasoningTrace";
import { RecommendationPanel } from "./RecommendationPanel";
import { HospitalDrawer } from "./HospitalDrawer";
import { RawJsonPanel } from "./RawJsonPanel";
import { Pill } from "./atoms";

const defaultOrParameters: OrParameters = {
  incident_type: "fall_head_injury",
  severity_level: 4,
  deterioration_risk: 4,
  vulnerability_level: 4,
  required_departments: ["emergency_medicine", "neurosurgery"],
  required_resources: ["ct", "trauma_resuscitation"],
  max_transport_time_min: 30,
  minimum_hospital_level: "local_center_or_above",
  or_notes: "OR 팀플 데모",
};

const defaultForm: FormState = {
  mode: "transcript",
  selectedCaseId: SAMPLE_CASES[0]?.case_id ?? null,
  caseTitle: SAMPLE_CASES[0]?.title ?? "",
  transcript: SAMPLE_CASES[0]?.transcript ?? "",
  orParameters: defaultOrParameters,
  location: { lat: "37.5665", lon: "126.9780" },
};

export function Console() {
  const [form, setForm] = useState<FormState>(defaultForm);
  const [status, setStatus] = useState<RunStatus>({ kind: "idle" });
  const [response, setResponse] = useState<RecommendationResponse | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const stageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (stageTimer.current) clearTimeout(stageTimer.current);
    };
  }, []);

  const handleRun = useCallback(async () => {
    if (stageTimer.current) clearTimeout(stageTimer.current);

    const lat = Number(form.location.lat);
    const lon = Number(form.location.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      setStatus({ kind: "error", message: "신고 위치 lat/lon이 필요합니다." });
      return;
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      setStatus({ kind: "error", message: "lat은 −90~90, lon은 −180~180 범위여야 합니다." });
      return;
    }

    if (form.mode === "transcript") {
      if (!form.transcript.trim()) {
        setStatus({
          kind: "error",
          message: "응급 통화 transcript를 입력하거나 sample case를 선택하세요.",
        });
        return;
      }
    } else {
      const p = form.orParameters;
      if (p.required_departments.length === 0) {
        setStatus({ kind: "error", message: "최소 1개 이상의 진료과를 선택하세요." });
        return;
      }
      if (p.required_resources.length === 0) {
        setStatus({ kind: "error", message: "최소 1개 이상의 자원을 선택하세요." });
        return;
      }
    }

    setStatus({ kind: "validating" });

    const incidentLocation = { lat, lon };
    const payload =
      form.mode === "transcript"
        ? {
            case_id: form.selectedCaseId ?? `CASE-${Date.now()}`,
            title: form.caseTitle || "Untitled emergency transcript",
            transcript: form.transcript,
            incident_location: incidentLocation,
            limit: 3,
          }
        : {
            or_parameters: form.orParameters,
            incident_location: incidentLocation,
            limit: 3,
          };

    if (form.mode === "transcript") {
      setStatus({ kind: "running", stage: "extracting" });
      stageTimer.current = setTimeout(() => {
        setStatus((s) => (s.kind === "running" ? { ...s, stage: "converting" } : s));
        stageTimer.current = setTimeout(() => {
          setStatus((s) => (s.kind === "running" ? { ...s, stage: "ranking" } : s));
        }, 1800);
      }, 1200);
    } else {
      setStatus({ kind: "running", stage: "ranking" });
    }

    try {
      const data = await runRecommendation(payload);
      if (stageTimer.current) clearTimeout(stageTimer.current);
      setResponse(data);
      setStatus({ kind: "success" });
    } catch (err) {
      if (stageTimer.current) clearTimeout(stageTimer.current);
      const message = err instanceof Error ? err.message : "예상치 못한 오류";
      const friendly = friendlyError(message);
      setStatus({ kind: "error", message: friendly });
    }
  }, [form]);

  const ranLLMLast = response?.pipeline.source === "llm_two_stage_pipeline";

  const feasibleHospitalIds = useMemo(() => {
    if (!response) return null;
    const ids = response.recommendations.rankings
      .filter((r) => r.feasible)
      .map((r) => r.hospital.hospital.hospital_id);
    return new Set(ids);
  }, [response]);

  const running = status.kind === "running" || status.kind === "validating";

  return (
    <div className="flex min-h-screen flex-col">
      <OperationalStatusBar />

      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-end justify-between gap-3 px-5 py-3">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="mono text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
                OR Emergency Transfer Console
              </span>
              <Pill tone="muted" size="xs">demo · normalized_utility_v3</Pill>
            </div>
            <h1 className="mt-1 text-[16px] font-semibold tracking-tight text-ink">
              응급 통화 → OR 변수 → 서울 응급의료기관 top-3 추천
            </h1>
            <p className="mt-0.5 max-w-3xl text-[11.5px] leading-snug text-ink-muted">
              transcript와 신고 위치를 OR 변수로 변환하고, NEMC live capacity가 있는 51개 후보를
              normalized_utility_v3 desirability(↑)로 정렬합니다. 실제 의료 의사결정 시스템이 아닌 OR 팀플 시연용입니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/api/or/health"
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-[11px] font-medium text-ink-soft hover:bg-surface-muted"
            >
              /api/or/health
            </a>
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-[11px] font-semibold text-ink hover:bg-surface-muted"
            >
              Open hospital data
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] flex-1 px-5 py-4">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
          <InputColumn
            form={form}
            status={status}
            onChange={setForm}
            onRun={handleRun}
            ranLLMLast={ranLLMLast}
          />

          <section className="flex min-w-0 flex-col gap-4">
            <ReasoningTrace
              response={response}
              running={running}
              inputMode={form.mode}
            />
            <RecommendationPanel response={response} running={running} />
            <RawJsonPanel response={response} />
          </section>
        </div>

        <FooterNotes />
      </main>

      <HospitalDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        feasibleHospitalIds={feasibleHospitalIds}
      />
    </div>
  );
}

function FooterNotes() {
  return (
    <footer className="mt-5 flex flex-col gap-1 border-t border-line pt-3 text-[10.5px] leading-snug text-ink-faint">
      <p>
        modeling note · 이송시간은 직선거리 기반 추정치이며 실시간 교통 API가 아닙니다.
        bed buffer tier는 NEMC live `available_er_beds`를 기준으로 계산되며 1–2 beds는 high risk,
        3–5 beds는 medium risk로 분류됩니다.
      </p>
      <p>
        candidate set · primary_live_capacity_51. 23개의 active 병원은 NEMC live capacity 응답이
        비어있어 primary 후보에서 제외됩니다. drawer에서 active 74 모드로 전환해 missing live 목록을
        확인할 수 있습니다.
      </p>
      <p>
        이 콘솔은 “확정 진료 가능” 또는 “실시간 최단 경로”를 보장하지 않습니다.
        OR formulation `normalized_utility_v3`의 설명 가능성을 검증하기 위한 demo입니다.
      </p>
    </footer>
  );
}

function friendlyError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("openrouter")) {
    return "LLM extraction을 실행할 수 없습니다. OpenRouter 설정을 확인하세요.";
  }
  if (lower.includes("transcript")) {
    return "응급 통화 transcript를 입력하거나 sample case를 선택하세요.";
  }
  if (lower.includes("incident_location") || lower.includes("location")) {
    return "신고 위치 lat/lon이 필요합니다.";
  }
  if (lower.includes("capacity")) {
    return "일부 병원은 실시간 병상 정보가 없어 primary 추천에서 제외됩니다.";
  }
  return raw;
}
