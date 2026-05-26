"use client";

import type { RankedHospital, RecommendationResponse } from "@/lib/or-ui/types";
import {
  constraintViolationLabel,
  departmentLabel,
  hospitalLevelLabel,
  resourceLabel,
} from "@/lib/or-ui/labels";
import {
  displayHospitalName,
  fmtFloat,
  fmtInt,
  fmtKm,
  fmtMin,
  fmtSignedMin,
} from "@/lib/or-ui/format";
import { Divider, EmptyHint, InfoNote, KPI, Panel, Pill, TierBadge } from "./atoms";

const SUBTITLE = "normalized_utility_v3 · 51개 live-capacity 후보에서 top-3 선정";

// v3 desirability U = Σ weightₖ·utilityₖ. The breakdown shows each weighted
// contribution; higher = better. Colors: time (accent), capacity (bed/medium),
// capability (definitive-care depth, stable-green).
const contributionPalette = {
  time: { fg: "text-accent-ink", bg: "bg-accent", label: "time" },
  capacity: { fg: "text-tier-medium", bg: "bg-tier-medium", label: "capacity" },
  capability: { fg: "text-tier-stable", bg: "bg-tier-stable", label: "capability" },
} as const;

type UtilKey = keyof typeof contributionPalette;
const utilOrder: UtilKey[] = ["time", "capacity", "capability"];

export function RecommendationPanel({
  response,
  running,
}: {
  response: RecommendationResponse | null;
  running: boolean;
}) {
  if (!response && !running) {
    return (
      <Panel
        title="Recommendation"
        subtitle={SUBTITLE}
        meta={<span className="mono text-ink-faint">대기 중</span>}
      >
        <EmptyHint>
          좌측에서 sample case를 선택하고 <span className="mono">Run Recommendation</span>을 실행하면
          top-3 병원 후보와 utility decomposition이 표시됩니다.
        </EmptyHint>
      </Panel>
    );
  }

  if (!response && running) {
    return (
      <Panel
        title="Recommendation"
        subtitle={SUBTITLE}
        meta={<span className="mono text-ink-faint">ranking 계산 중…</span>}
      >
        <div className="flex flex-col gap-3">
          <RankSkeleton large />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <RankSkeleton />
            <RankSkeleton />
          </div>
        </div>
      </Panel>
    );
  }

  const data = response!;
  const rankings = data.recommendations.rankings;
  const rank1 = rankings[0];
  const others = rankings.slice(1);

  const feasibleCount = rankings.filter((r) => r.feasible).length;

  return (
    <Panel
      title="Recommendation"
      subtitle={SUBTITLE}
      meta={
        <div className="flex items-center gap-2">
          <Pill tone={feasibleCount > 0 ? "ok" : "danger"} size="xs">
            {feasibleCount} / {rankings.length} feasible
          </Pill>
        </div>
      }
      bodyClassName="flex flex-col gap-4 p-4"
    >
      <FormulationHeader response={data} />

      {rankings.length === 0 ? (
        <InfoNote tone="warn">
          조건을 만족하는 후보가 없습니다. live capacity가 있는 51개 후보를 다시 확인하세요.
        </InfoNote>
      ) : null}

      {feasibleCount === 0 && rankings.length > 0 ? (
        <InfoNote tone="warn">
          조건을 모두 만족하는 병원이 없습니다. 제약 위반 후보를 낮은 우선순위로 표시합니다.
        </InfoNote>
      ) : null}

      {rank1 ? <RankOneCard item={rank1} /> : null}

      {others.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {others.map((item) => (
            <RankCompactCard key={item.hospital.hospital.hospital_id} item={item} reference={rank1} />
          ))}
        </div>
      ) : null}
    </Panel>
  );
}

function RankSkeleton({ large = false }: { large?: boolean }) {
  return (
    <div
      className={`relative overflow-hidden rounded-md border border-line bg-surface-muted ${
        large ? "py-8" : "py-5"
      } px-4`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="num h-7 w-7 rounded-md bg-surface-sunken" />
          <div className={`h-3 ${large ? "w-48" : "w-32"} rounded bg-surface-sunken`} />
        </div>
        <div className="h-3 w-16 rounded bg-surface-sunken" />
      </div>
      <span className="or-stage-bar absolute inset-0" />
    </div>
  );
}

function FormulationHeader({ response }: { response: RecommendationResponse }) {
  const f = response.recommendations.formulation;
  return (
    <div className="flex flex-col gap-2 rounded-md border border-line bg-surface-muted px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone="accent" size="xs">{f.version}</Pill>
        <span className="text-[11px] text-ink-soft">
          candidate set: <span className="mono text-ink">{f.candidateSetPolicy}</span>
        </span>
      </div>
      <p className="mono text-[10.5px] leading-snug text-ink-muted">objective · {f.objective}</p>
      <div className="flex flex-wrap gap-1">
        {f.hardConstraints.map((c) => (
          <Pill key={c} tone="muted" size="xs">{c}</Pill>
        ))}
      </div>
    </div>
  );
}

function RankOneCard({ item }: { item: RankedHospital }) {
  const h = item.hospital.hospital;
  const cap = item.hospital.capacity;
  const { label: shortName, full: fullName } = displayHospitalName(h.hospital_name);
  const violations = item.constraintViolations;

  return (
    <article
      className={`relative flex flex-col gap-4 rounded-lg border-2 p-5 ${
        item.feasible
          ? "border-accent/40 bg-accent-soft/30"
          : "border-tier-infeasible/40 bg-tier-infeasible-soft/30"
      }`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="num flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-ink text-[18px] font-semibold text-white">
            1
          </div>
          <div className="flex min-w-0 flex-col">
            <h3
              className="truncate text-[20px] font-semibold leading-tight text-ink"
              title={fullName}
            >
              {shortName}
            </h3>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-ink-muted">
              <span>{h.district}</span>
              <span className="text-ink-faint">·</span>
              <span>{hospitalLevelLabel[h.emergency_level_model]}</span>
              <span className="text-ink-faint">·</span>
              <span className="mono">{h.hospital_id}</span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Pill tone={item.feasible ? "ok" : "danger"} size="sm">
            {item.feasible ? "feasible" : "infeasible"}
          </Pill>
          <div className="text-right">
            <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-muted">
              desirability ↑
            </span>
            <div className="num text-[30px] font-semibold leading-none text-ink">
              {fmtFloat(item.desirability, 3)}
            </div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KPI label="Est. travel" value={fmtMin(item.estimatedTravelTimeMin)} hint="haversine estimate" />
        <KPI label="Distance" value={fmtKm(item.distanceKm)} hint="straight line" />
        <KPI
          label="Time slack"
          value={fmtSignedMin(item.timeSlackMin)}
          tone={item.timeSlackMin >= 10 ? "ok" : item.timeSlackMin >= 5 ? "warn" : "danger"}
          hint="max − ETA"
        />
        <KPI
          label="Available ER beds"
          value={item.availableErBeds === null ? "—" : fmtInt(item.availableErBeds)}
          tone={
            item.availableErBeds === null
              ? "muted"
              : item.availableErBeds <= 2
                ? "danger"
                : item.availableErBeds <= 5
                  ? "warn"
                  : "ok"
          }
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <TierBadge tier={item.bedBufferTier} beds={item.availableErBeds} />
        {cap?.ct_available_live ? <Pill tone="ok" size="xs">CT live</Pill> : null}
        {cap?.ventilator_available_live ? <Pill tone="ok" size="xs">vent live</Pill> : null}
        {cap?.mri_available_live ? <Pill tone="ok" size="xs">MRI live</Pill> : null}
        {cap?.available_operating_rooms !== undefined && cap?.available_operating_rooms !== null ? (
          <Pill tone="muted" size="xs">OR rooms · {cap.available_operating_rooms}</Pill>
        ) : null}
      </div>

      <Divider />

      <UtilityDecomposition item={item} expanded />

      <DepartmentResourceCoverage item={item} />

      {violations.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <h4 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-tier-infeasible">
            Constraint violations
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {violations.map((v) => (
              <Pill key={v} tone="danger" size="sm">
                {constraintViolationLabel[v] ?? v}
              </Pill>
            ))}
          </div>
        </div>
      ) : null}
    </article>
  );
}

function RankCompactCard({
  item,
  reference,
}: {
  item: RankedHospital;
  reference?: RankedHospital;
}) {
  const h = item.hospital.hospital;
  const { label: shortName, full: fullName } = displayHospitalName(h.hospital_name);
  const deltaDesir = reference ? item.desirability - reference.desirability : 0;
  const deltaTime = reference ? item.estimatedTravelTimeMin - reference.estimatedTravelTimeMin : 0;

  return (
    <article
      className={`flex min-w-0 flex-col gap-3 rounded-lg border p-3 ${
        item.feasible ? "border-line bg-surface" : "border-tier-infeasible/30 bg-tier-infeasible-soft/30"
      }`}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <div className="num flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-ink-soft text-[13px] font-semibold text-white">
            {item.rank}
          </div>
          <div className="flex min-w-0 flex-col">
            <h4
              className="truncate text-[14px] font-semibold leading-tight text-ink"
              title={fullName}
            >
              {shortName}
            </h4>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[10.5px] text-ink-muted">
              <span>{h.district}</span>
              <span className="text-ink-faint">·</span>
              <span>{hospitalLevelLabel[h.emergency_level_model]}</span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <div className="num text-[16px] font-semibold leading-none text-ink">
            {fmtFloat(item.desirability, 3)}
          </div>
          {reference && deltaDesir !== 0 ? (
            <span className={`num text-[10px] ${deltaDesir < 0 ? "text-ink-muted" : "text-tier-stable"}`}>
              {deltaDesir > 0 ? "+" : ""}
              {fmtFloat(deltaDesir, 3)} vs #1
            </span>
          ) : null}
        </div>
      </header>

      <div className="grid grid-cols-3 gap-2">
        <CompactStat
          label="ETA"
          value={fmtMin(item.estimatedTravelTimeMin)}
          delta={
            reference && deltaTime !== 0
              ? `${deltaTime > 0 ? "+" : ""}${deltaTime} min`
              : undefined
          }
        />
        <CompactStat label="Slack" value={fmtSignedMin(item.timeSlackMin)} />
        <CompactStat
          label="ER beds"
          value={item.availableErBeds === null ? "—" : String(item.availableErBeds)}
        />
      </div>

      <TierBadge tier={item.bedBufferTier} beds={item.availableErBeds} size="sm" />

      <UtilityDecomposition item={item} />

      {item.constraintViolations.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {item.constraintViolations.map((v) => (
            <Pill key={v} tone="danger" size="xs">
              {constraintViolationLabel[v] ?? v}
            </Pill>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function CompactStat({ label, value, delta }: { label: string; value: string; delta?: string }) {
  return (
    <div className="flex min-w-0 flex-col rounded-md border border-line bg-surface-muted px-2 py-1.5">
      <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
        {label}
      </span>
      <span className="num mt-0.5 whitespace-nowrap text-[13px] font-semibold leading-tight text-ink">
        {value}
      </span>
      {delta ? (
        <span className="num mt-0.5 whitespace-nowrap text-[10px] text-ink-muted">{delta}</span>
      ) : null}
    </div>
  );
}

// Utility contribution bar: each weighted contribution (weightₖ·utilityₖ) fills
// part of a [0,1] track; the full track is the ideal hospital (desirability = 1).
// The dashed trailing gap is "headroom to ideal" — visually, longer fill = better.
function UtilityDecomposition({
  item,
  expanded = false,
}: {
  item: RankedHospital;
  expanded?: boolean;
}) {
  const contrib = item.scoreBreakdown;
  const gapToIdeal = Math.max(0, 1 - item.desirability);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
          Utility contribution
        </span>
        <span className="num shrink-0 text-[10px] text-ink-faint">
          U {fmtFloat(item.desirability, 3)} / 1.000
        </span>
      </div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-sm bg-surface-sunken">
        {utilOrder.map((key) => {
          const value = Math.max(0, contrib[key]);
          if (value === 0) return null;
          return (
            <span
              key={key}
              className={`${contributionPalette[key].bg} h-full`}
              style={{ width: `${value * 100}%` }}
              title={`${contributionPalette[key].label}: ${fmtFloat(value, 3)}`}
            />
          );
        })}
        {gapToIdeal > 0 ? (
          <span
            className="h-full border-l border-dashed border-line"
            style={{ width: `${gapToIdeal * 100}%` }}
            title="headroom to ideal (U=1)"
          />
        ) : null}
      </div>
      {expanded ? (
        <table className="mono w-full text-left text-[10.5px]">
          <thead>
            <tr className="text-[9px] uppercase tracking-[0.08em] text-ink-faint">
              <td className="py-0.5" />
              <td className="py-0.5 text-right">utility</td>
              <td className="py-0.5 text-right">weight</td>
              <td className="py-0.5 text-right">contrib</td>
            </tr>
          </thead>
          <tbody>
            {utilOrder.map((key) => {
              const palette = contributionPalette[key];
              return (
                <tr key={key} className="border-t border-line/70">
                  <td className="py-1 pr-2 align-middle">
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`h-1.5 w-3 rounded-sm ${palette.bg}`} />
                      <span className={`uppercase tracking-[0.06em] ${palette.fg}`}>{palette.label}</span>
                    </span>
                  </td>
                  <td className="num py-1 text-right text-ink">{fmtFloat(item.utilities[key], 3)}</td>
                  <td className="num py-1 text-right text-ink-muted">{fmtFloat(item.weights[key], 2)}</td>
                  <td className="num py-1 text-right text-ink">{fmtFloat(item.scoreBreakdown[key], 3)}</td>
                </tr>
              );
            })}
            <tr className="border-t border-line">
              <td className="py-1 pr-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
                desirability
              </td>
              <td />
              <td />
              <td className="num py-1 text-right text-[11.5px] font-semibold text-ink">
                {fmtFloat(item.desirability, 3)}
              </td>
            </tr>
          </tbody>
        </table>
      ) : (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
          {utilOrder.map((key) => {
            const palette = contributionPalette[key];
            return (
              <span key={key} className="inline-flex items-center gap-1">
                <span className={`h-1.5 w-2.5 rounded-sm ${palette.bg}`} />
                <span className="text-ink-muted">{palette.label}</span>
                <span className="num text-ink">{fmtFloat(item.utilities[key], 2)}</span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DepartmentResourceCoverage({ item }: { item: RankedHospital }) {
  const depts = Object.entries(item.checks.departmentMatches) as [string, boolean][];
  const res = Object.entries(item.checks.resourceMatches) as [string, boolean][];
  if (depts.length === 0 && res.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
      <CoverageList
        title="Required departments"
        items={depts.map(([k, ok]) => ({
          key: k,
          label: departmentLabel[k as keyof typeof departmentLabel] ?? k,
          ok,
        }))}
      />
      <CoverageList
        title="Required resources"
        items={res.map(([k, ok]) => ({
          key: k,
          label: resourceLabel[k as keyof typeof resourceLabel] ?? k,
          ok,
        }))}
      />
    </div>
  );
}

function CoverageList({
  title,
  items,
}: {
  title: string;
  items: { key: string; label: string; ok: boolean }[];
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-line bg-surface-muted px-2.5 py-1.5 text-[10.5px] text-ink-faint">
        {title} · 요구 없음
      </div>
    );
  }
  return (
    <div className="rounded-md border border-line bg-surface px-2.5 py-1.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
        {title}
      </div>
      <ul className="mt-1 grid grid-cols-1 gap-0.5">
        {items.map((it) => (
          <li key={it.key} className="flex items-center justify-between gap-2 text-[11px]">
            <span className="text-ink">{it.label}</span>
            <span
              className={`mono text-[10px] font-semibold uppercase ${
                it.ok ? "text-tier-stable" : "text-tier-infeasible"
              }`}
            >
              {it.ok ? "match" : "missing"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
