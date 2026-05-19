"use client";

import { useEffect, useState } from "react";
import { fetchHealth } from "@/lib/or-ui/fetcher";
import type { HealthResponse } from "@/lib/or-ui/types";
import { StatusDot } from "./atoms";

type LoadState =
  | { kind: "loading" }
  | { kind: "ok"; data: HealthResponse }
  | { kind: "error"; message: string };

export function OperationalStatusBar() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetchHealth()
      .then((data) => {
        if (!cancelled) setState({ kind: "ok", data });
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ kind: "error", message: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === "loading") {
    return (
      <div className="flex items-center gap-3 border-b border-line bg-surface px-4 py-2 text-[11px] text-ink-muted">
        <StatusDot state="info" pulse />
        <span>backend readiness 확인 중…</span>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="flex items-center gap-3 border-b border-line bg-tier-infeasible-soft/60 px-4 py-2 text-[11px] text-tier-infeasible">
        <StatusDot state="warn" />
        <span>backend health 확인 실패: {state.message}</span>
      </div>
    );
  }

  const { env, data } = state.data;

  return (
    <div className="flex flex-col gap-2 border-b border-line bg-surface px-4 py-2 text-[11px] text-ink-soft md:flex-row md:items-center md:gap-5">
      <div className="flex items-center gap-2">
        <StatusDot state="ok" />
        <span className="font-semibold text-ink">runtime</span>
        <span className="mono text-ink-muted">nextjs · node route handler</span>
      </div>
      <Divider />
      <div className="flex items-center gap-2">
        <StatusDot state={env.openrouterConfigured ? "ok" : "off"} />
        <span className="font-semibold text-ink">OpenRouter</span>
        <span className="mono text-ink-muted">{env.openrouterConfigured ? "configured" : "not configured"}</span>
        <span className="hidden text-ink-faint md:inline">·</span>
        <span className="mono text-ink-muted">{env.openrouterModel}</span>
      </div>
      <Divider />
      <div className="flex items-center gap-2">
        <StatusDot state={env.nemcConfigured ? "ok" : "off"} />
        <span className="font-semibold text-ink">NEMC</span>
        <span className="mono text-ink-muted">{env.nemcConfigured ? "configured" : "not configured"}</span>
      </div>
      <Divider />
      <div className="flex items-center gap-3 md:ml-auto">
        <span className="font-semibold text-ink">data</span>
        <span className="mono text-ink-muted">
          <span className="font-semibold text-ink">{data.liveCapacityHospitalCount}</span> live
        </span>
        <span className="text-ink-faint">/</span>
        <span className="mono text-ink-muted">
          <span className="font-semibold text-ink">{data.activeHospitalCount}</span> active
        </span>
        <span className="text-ink-faint">/</span>
        <span className="mono text-ink-muted">
          <span className="font-semibold text-ink">{data.activeWithoutLiveCapacityCount}</span> missing live
        </span>
      </div>
    </div>
  );
}

function Divider() {
  return <span className="hidden h-3 w-px bg-line md:inline-block" />;
}
