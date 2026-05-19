"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchHospitals } from "@/lib/or-ui/fetcher";
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
