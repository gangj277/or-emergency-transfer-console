"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchHospitals,
  refreshCapacity,
  type CapacityRefreshResponse,
} from "@/lib/or-ui/fetcher";
import type {
  BedBufferTier,
  HospitalCandidate,
  HospitalsResponse,
  MissingActiveCapacity,
} from "@/lib/or-ui/types";
import { getBedBufferTier } from "@/lib/or/recommendation";
import { bedBufferLabel, hospitalLevelLabel } from "@/lib/or-ui/labels";
import { bedBufferTierStyle, tierOrder } from "@/lib/or-ui/tiers";
import { fmtRelative, nullableBoolLabel } from "@/lib/or-ui/format";
import { Pill } from "./atoms";

type RefreshState =
  | { kind: "idle" }
  | { kind: "refreshing"; scope: "all" | string; startedAt: number }
  | { kind: "error"; message: string };

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; data: HospitalsResponse }
  | { kind: "error"; message: string };

export function HospitalDrawer({
  open,
  onClose,
  feasibleHospitalIds,
}: {
  open: boolean;
  onClose: () => void;
  feasibleHospitalIds: Set<string> | null;
}) {
  const [mode, setMode] = useState<"live" | "active">("live");
  const [state, setState] = useState<LoadState>({ kind: "idle" });
  const [filterDistrict, setFilterDistrict] = useState<string>("all");
  const [filterTiers, setFilterTiers] = useState<Set<BedBufferTier>>(new Set());
  const [filterCt, setFilterCt] = useState<boolean>(false);
  const [filterFeasible, setFilterFeasible] = useState<boolean>(false);
  const [query, setQuery] = useState<string>("");
  const [refreshState, setRefreshState] = useState<RefreshState>({ kind: "idle" });
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);

  const refreshScope: "all" | string =
    filterDistrict !== "all" ? filterDistrict : "all";

  const handleRefresh = useCallback(async () => {
    if (state.kind !== "ok") return;
    const scope = refreshScope;
    setRefreshState({ kind: "refreshing", scope, startedAt: Date.now() });
    try {
      const response = await refreshCapacity(scope === "all" ? undefined : scope);
      const refreshedDistricts =
        scope === "all"
          ? new Set(state.data.candidates.map((c) => c.hospital.district))
          : new Set([scope]);
      const next = mergeRefreshIntoState(state.data, response, refreshedDistricts);
      setState({ kind: "ok", data: next });
      setLastRefreshedAt(response.generated_at);
      setRefreshState({ kind: "idle" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      setRefreshState({ kind: "error", message });
    }
  }, [refreshScope, state]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetchHospitals(mode)
      .then((data) => {
        if (!cancelled) setState({ kind: "ok", data });
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ kind: "error", message: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [open, mode]);

  // Loading is derived from state — when the current response's mode doesn't
  // match the requested mode (or no response yet), the table renders a spinner.
  // This avoids a synchronous setState inside the effect, which React 19 / Next
  // 16 flags as a cascading-render anti-pattern.
  const effectiveState: LoadState =
    open && state.kind === "ok" && state.data.mode !== mode
      ? { kind: "loading" }
      : open && state.kind === "idle"
        ? { kind: "loading" }
        : state;

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex flex-col">
      <button
        type="button"
        aria-label="close hospital data drawer"
        className="flex-1 bg-ink/30 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <div className="flex h-[80vh] flex-col border-t border-line bg-canvas shadow-[0_-12px_30px_rgba(15,23,42,0.12)]">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3">
          <div className="flex items-center gap-3">
            <h2 className="text-[14px] font-semibold tracking-tight text-ink">Hospital data explorer</h2>
            <Pill tone="muted" size="xs">
              {effectiveState.kind === "ok"
                ? `${effectiveState.data.candidates.length} ${mode}`
                : effectiveState.kind === "loading"
                  ? "loading…"
                  : "—"}
            </Pill>
            {effectiveState.kind === "ok" ? (
              <span className="text-[11px] text-ink-muted">
                missing live: {effectiveState.data.missingActiveCapacity.length}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <RefreshControl
              scope={refreshScope}
              state={refreshState}
              lastRefreshedAt={lastRefreshedAt}
              disabled={state.kind !== "ok"}
              onRefresh={handleRefresh}
            />
            <ModeSwitch value={mode} onChange={setMode} />
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-ink-soft hover:bg-surface-muted"
            >
              Close
            </button>
          </div>
        </header>

        <Filters
          state={effectiveState}
          query={query}
          setQuery={setQuery}
          filterDistrict={filterDistrict}
          setFilterDistrict={setFilterDistrict}
          filterTiers={filterTiers}
          setFilterTiers={setFilterTiers}
          filterCt={filterCt}
          setFilterCt={setFilterCt}
          filterFeasible={filterFeasible}
          setFilterFeasible={setFilterFeasible}
          feasibleHospitalIds={feasibleHospitalIds}
        />

        <div className="scrollbar-thin flex-1 overflow-auto">
          {effectiveState.kind === "loading" ? (
            <Centered>로드 중…</Centered>
          ) : effectiveState.kind === "error" ? (
            <Centered danger>병원 데이터 로드 실패: {effectiveState.message}</Centered>
          ) : effectiveState.kind === "ok" ? (
            <HospitalTable
              data={effectiveState.data}
              query={query}
              filterDistrict={filterDistrict}
              filterTiers={filterTiers}
              filterCt={filterCt}
              filterFeasible={filterFeasible}
              feasibleHospitalIds={feasibleHospitalIds}
            />
          ) : null}
        </div>

        {effectiveState.kind === "ok" && effectiveState.data.missingActiveCapacity.length > 0 ? (
          <MissingFooter rows={effectiveState.data.missingActiveCapacity} />
        ) : null}
      </div>
    </div>
  );
}

function ModeSwitch({
  value,
  onChange,
}: {
  value: "live" | "active";
  onChange: (v: "live" | "active") => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-line bg-surface-muted p-0.5 text-[11px]">
      {(["live", "active"] as const).map((m) => {
        const active = value === m;
        return (
          <button
            key={m}
            onClick={() => onChange(m)}
            className={`rounded-[5px] px-2.5 py-1 font-medium ${
              active ? "bg-surface text-ink" : "text-ink-muted hover:text-ink"
            }`}
          >
            {m === "live" ? "live 51" : "active 74"}
          </button>
        );
      })}
    </div>
  );
}

function Filters({
  state,
  query,
  setQuery,
  filterDistrict,
  setFilterDistrict,
  filterTiers,
  setFilterTiers,
  filterCt,
  setFilterCt,
  filterFeasible,
  setFilterFeasible,
  feasibleHospitalIds,
}: {
  state: LoadState;
  query: string;
  setQuery: (v: string) => void;
  filterDistrict: string;
  setFilterDistrict: (v: string) => void;
  filterTiers: Set<BedBufferTier>;
  setFilterTiers: (v: Set<BedBufferTier>) => void;
  filterCt: boolean;
  setFilterCt: (v: boolean) => void;
  filterFeasible: boolean;
  setFilterFeasible: (v: boolean) => void;
  feasibleHospitalIds: Set<string> | null;
}) {
  const districts = useMemo(() => {
    if (state.kind !== "ok") return [];
    return Array.from(new Set(state.data.candidates.map((c) => c.hospital.district)))
      .filter(Boolean)
      .sort();
  }, [state]);

  function toggleTier(tier: BedBufferTier) {
    const next = new Set(filterTiers);
    if (next.has(tier)) next.delete(tier);
    else next.add(tier);
    setFilterTiers(next);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-muted px-4 py-2 text-[11px]">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="병원명 / id 검색"
        className="w-44 rounded-md border border-line bg-surface px-2 py-1 text-[11.5px] text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
      />
      <select
        value={filterDistrict}
        onChange={(e) => setFilterDistrict(e.target.value)}
        className="rounded-md border border-line bg-surface px-2 py-1 text-[11.5px] text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
      >
        <option value="all">전체 자치구</option>
        {districts.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
      <div className="flex flex-wrap items-center gap-1">
        {tierOrder.map((tier) => {
          const active = filterTiers.has(tier);
          const style = bedBufferTierStyle[tier];
          return (
            <button
              key={tier}
              type="button"
              onClick={() => toggleTier(tier)}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-medium ${
                active ? `${style.border} ${style.bg} ${style.fg}` : "border-line text-ink-muted hover:bg-surface"
              }`}
              title={bedBufferLabel[tier]}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${style.swatch}`} />
              {bedBufferLabel[tier].split(" ")[0]}
            </button>
          );
        })}
      </div>
      <label className="inline-flex items-center gap-1 text-[11px] text-ink-soft">
        <input
          type="checkbox"
          checked={filterCt}
          onChange={(e) => setFilterCt(e.target.checked)}
          className="h-3 w-3 accent-accent"
        />
        CT live
      </label>
      <label
        className={`inline-flex items-center gap-1 text-[11px] ${
          feasibleHospitalIds ? "text-ink-soft" : "text-ink-faint"
        }`}
      >
        <input
          type="checkbox"
          checked={filterFeasible && !!feasibleHospitalIds}
          disabled={!feasibleHospitalIds}
          onChange={(e) => setFilterFeasible(e.target.checked)}
          className="h-3 w-3 accent-accent"
        />
        현재 케이스 feasible만
      </label>
    </div>
  );
}

function HospitalTable({
  data,
  query,
  filterDistrict,
  filterTiers,
  filterCt,
  filterFeasible,
  feasibleHospitalIds,
}: {
  data: HospitalsResponse;
  query: string;
  filterDistrict: string;
  filterTiers: Set<BedBufferTier>;
  filterCt: boolean;
  filterFeasible: boolean;
  feasibleHospitalIds: Set<string> | null;
}) {
  const rows = useMemo(() => {
    const lowerQ = query.trim().toLowerCase();
    return data.candidates.filter((c) => {
      if (filterDistrict !== "all" && c.hospital.district !== filterDistrict) return false;
      if (filterCt && c.capacity?.ct_available_live !== true) return false;
      if (filterFeasible && feasibleHospitalIds && !feasibleHospitalIds.has(c.hospital.hospital_id)) {
        return false;
      }
      if (filterTiers.size > 0) {
        const tier = getBedBufferTier(c.capacity?.available_er_beds ?? null);
        if (!filterTiers.has(tier)) return false;
      }
      if (lowerQ) {
        const hay = `${c.hospital.hospital_name} ${c.hospital.hospital_id} ${c.hospital.district}`.toLowerCase();
        if (!hay.includes(lowerQ)) return false;
      }
      return true;
    });
  }, [data, query, filterDistrict, filterTiers, filterCt, filterFeasible, feasibleHospitalIds]);

  if (rows.length === 0) {
    return <Centered>필터에 맞는 병원이 없습니다.</Centered>;
  }

  return (
    <table className="w-full border-collapse text-left text-[11.5px]">
      <thead className="sticky top-0 z-10 bg-surface text-[10px] uppercase tracking-[0.08em] text-ink-faint">
        <tr className="border-b border-line">
          <th className="px-3 py-2 font-semibold">병원</th>
          <th className="px-2 py-2 font-semibold">자치구</th>
          <th className="px-2 py-2 font-semibold">level</th>
          <th className="px-2 py-2 text-right font-semibold">ER beds</th>
          <th className="px-2 py-2 text-right font-semibold">OR rooms</th>
          <th className="px-2 py-2 text-right font-semibold">ICU∑</th>
          <th className="px-2 py-2 text-center font-semibold">CT</th>
          <th className="px-2 py-2 text-center font-semibold">MRI</th>
          <th className="px-2 py-2 text-center font-semibold">vent</th>
          <th className="px-3 py-2 font-semibold">fetched</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => (
          <HospitalRow key={c.hospital.hospital_id} candidate={c} />
        ))}
      </tbody>
    </table>
  );
}

function HospitalRow({ candidate }: { candidate: HospitalCandidate }) {
  const cap = candidate.capacity;
  const tier = getBedBufferTier(cap?.available_er_beds ?? null);
  const style = bedBufferTierStyle[tier];
  const icuSum = [
    cap?.available_general_icu_beds,
    cap?.available_surgical_icu_beds,
    cap?.available_neurosurgery_icu_beds,
    cap?.available_trauma_icu_beds,
  ]
    .filter((v): v is number => typeof v === "number")
    .reduce((s, v) => s + v, 0);
  const hasIcu = [
    cap?.available_general_icu_beds,
    cap?.available_surgical_icu_beds,
    cap?.available_neurosurgery_icu_beds,
    cap?.available_trauma_icu_beds,
  ].some((v) => typeof v === "number");

  return (
    <tr className="border-b border-line hover:bg-surface-muted/60">
      <td className="px-3 py-1.5">
        <div className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 rounded-full ${style.swatch}`} />
          <span className="font-medium text-ink">{candidate.hospital.hospital_name}</span>
        </div>
        <span className="mono ml-3.5 text-[10px] text-ink-faint">{candidate.hospital.hospital_id}</span>
      </td>
      <td className="px-2 py-1.5 text-ink-soft">{candidate.hospital.district}</td>
      <td className="px-2 py-1.5">
        <span className="text-[10.5px] text-ink-soft">
          {hospitalLevelLabel[candidate.hospital.emergency_level_model]}
        </span>
      </td>
      <td className="num px-2 py-1.5 text-right text-ink">
        {cap?.available_er_beds ?? "—"}
      </td>
      <td className="num px-2 py-1.5 text-right text-ink">
        {cap?.available_operating_rooms ?? "—"}
      </td>
      <td className="num px-2 py-1.5 text-right text-ink">
        {hasIcu ? icuSum : "—"}
      </td>
      <td className="num px-2 py-1.5 text-center">{nullableBoolLabel(cap?.ct_available_live)}</td>
      <td className="num px-2 py-1.5 text-center">{nullableBoolLabel(cap?.mri_available_live)}</td>
      <td className="num px-2 py-1.5 text-center">
        {nullableBoolLabel(cap?.ventilator_available_live)}
      </td>
      <td className="px-3 py-1.5 text-[10.5px] text-ink-muted">
        {fmtRelative(cap?.fetched_at)}
      </td>
    </tr>
  );
}

function MissingFooter({ rows }: { rows: MissingActiveCapacity[] }) {
  return (
    <details className="border-t border-line bg-surface-muted px-4 py-2">
      <summary className="cursor-pointer text-[11px] font-medium text-ink-soft">
        Missing live capacity ({rows.length}) — active이지만 NEMC live 응답이 비어있는 병원
      </summary>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {rows.map((r) => (
          <Pill key={r.hospital_id} tone="muted" size="xs" title={r.capacity_missing_reason}>
            {r.hospital_name} · {r.district}
          </Pill>
        ))}
      </div>
    </details>
  );
}

function Centered({ children, danger = false }: { children: React.ReactNode; danger?: boolean }) {
  return (
    <div
      className={`flex h-full min-h-[180px] items-center justify-center px-4 text-center text-[12px] ${
        danger ? "text-tier-infeasible" : "text-ink-muted"
      }`}
    >
      {children}
    </div>
  );
}

function RefreshControl({
  scope,
  state,
  lastRefreshedAt,
  disabled,
  onRefresh,
}: {
  scope: "all" | string;
  state: RefreshState;
  lastRefreshedAt: string | null;
  disabled: boolean;
  onRefresh: () => void;
}) {
  const refreshing = state.kind === "refreshing";
  const scopeLabel = scope === "all" ? "전체 25개 자치구" : scope;
  return (
    <div className="flex items-center gap-2">
      <div className="hidden flex-col items-end text-[10px] leading-tight md:flex">
        {state.kind === "error" ? (
          <span
            className="max-w-[180px] truncate text-tier-infeasible"
            title={state.message}
          >
            새로고침 실패
          </span>
        ) : refreshing ? (
          <span className="mono text-ink-muted">
            {scopeLabel} · NEMC 호출 중…
          </span>
        ) : (
          <>
            <span className="text-ink-muted">scope · {scopeLabel}</span>
            <span className="mono text-ink-faint">
              {lastRefreshedAt ? `갱신 ${fmtRelative(lastRefreshedAt)}` : "스냅샷 (수동 갱신 전)"}
            </span>
          </>
        )}
      </div>
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing || disabled}
        className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1 text-[11px] font-semibold text-ink hover:bg-surface-muted disabled:cursor-progress disabled:opacity-60"
        title={
          scope === "all"
            ? "서울 25개 자치구를 NEMC API로 재호출 (느림 · 10-30초)"
            : `${scope}만 NEMC API로 재호출`
        }
      >
        {refreshing ? <Spinner /> : <RefreshIcon />}
        <span>Refresh live</span>
      </button>
    </div>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M13.5 3v3.5H10" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.5 13V9.5H6" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M12.5 6.5A5 5 0 0 0 4 5M3.5 9.5A5 5 0 0 0 12 11"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Spinner() {
  return (
    <span
      className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-accent/30 border-t-accent"
      aria-hidden
    />
  );
}

// Merge NEMC refresh response into the current drawer state. Only candidates
// whose district was actually refreshed have their capacity overwritten;
// candidates outside the scope keep their previous capacity to avoid wiping
// data we didn't re-query.
function mergeRefreshIntoState(
  current: HospitalsResponse,
  response: CapacityRefreshResponse,
  refreshedDistricts: Set<string>,
): HospitalsResponse {
  const freshById = new Map(response.rows.map((row) => [row.hospital_id, row]));

  const nextCandidates: HospitalCandidate[] = current.candidates.map((cand) => {
    if (!refreshedDistricts.has(cand.hospital.district)) return cand;
    const fresh = freshById.get(cand.hospital.hospital_id);
    if (fresh) {
      return { ...cand, capacity: fresh };
    }
    // Hospital was in scope but missing from the refresh — it lost live status.
    if (current.mode === "live") {
      // In live mode, candidates without capacity shouldn't appear.
      return { ...cand, capacity: undefined as never };
    }
    return { ...cand, capacity: undefined };
  });

  const filteredCandidates =
    current.mode === "live"
      ? nextCandidates.filter((c) => c.capacity)
      : nextCandidates;

  const preservedMissing = current.missingActiveCapacity.filter(
    (m) => !refreshedDistricts.has(m.district),
  );
  const freshMissing = response.missingActiveCapacity.filter((m) =>
    refreshedDistricts.has(m.district),
  );

  return {
    ...current,
    candidates: filteredCandidates,
    missingActiveCapacity: [...preservedMissing, ...freshMissing],
  };
}
