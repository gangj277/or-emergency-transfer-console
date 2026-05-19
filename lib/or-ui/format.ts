export function fmtInt(value: number | null | undefined, fallback = "—"): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.round(value).toLocaleString("en-US");
}

export function fmtFloat(value: number | null | undefined, digits = 1, fallback = "—"): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtMin(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "— min";
  return `${Math.round(value)} min`;
}

export function fmtKm(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "— km";
  return `${value.toFixed(1)} km`;
}

export function fmtSignedMin(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const rounded = Math.round(value);
  if (rounded === 0) return "0 min";
  return `${rounded > 0 ? "+" : ""}${rounded} min`;
}

export function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const diff = Date.now() - t;
  if (diff < 0) return new Date(t).toLocaleString("ko-KR");
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "방금 전";
  if (mins < 60) return `${mins}분 전`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}시간 전`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}일 전`;
  return new Date(t).toLocaleDateString("ko-KR");
}

export function nullableBoolLabel(value: boolean | null | undefined): string {
  if (value === true) return "Y";
  if (value === false) return "N";
  return "—";
}

// Korean hospital registry names are often the full legal entity name
// ("학교법인고려중앙학원고려대학교의과대학부속병원(안암병원)"), which destroys
// card layouts. The common short name almost always sits in the trailing
// parenthetical, so prefer that when present and reasonable-length.
export function displayHospitalName(name: string): { label: string; full: string } {
  const trimmed = name.trim();
  const match = trimmed.match(/\(([^()]{2,18})\)\s*$/);
  if (match) {
    return { label: match[1].trim(), full: trimmed };
  }
  return { label: trimmed, full: trimmed };
}
