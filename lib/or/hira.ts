import type { Department } from "./types";

/**
 * HIRA (건강보험심사평가원) open-API client + matching helpers.
 *
 * Two data.go.kr services, both authorized on the same NEMC_SERVICE_KEY:
 *  - 병원정보서비스 (15001698)            → getHospBasisList: 총 의사수(drTotCnt), 의과 전문의수(mdeptSdrCnt), 좌표, 암호화 요양기호(ykiho)
 *  - 의료기관별상세정보서비스 (15001699)   → getDgsbjtInfo2.7: 진료과목별 전문의수(dgsbjtCdNm, dgsbjtPrSdrCnt)
 *
 * ykiho is an encrypted 1:1 token (no decryption / no raw 요양기호), so it cannot be
 * key-joined to our hospital_id. We match HIRA records to our hospitals by physical
 * coordinates (primary signal — hospitals are fixed) with name similarity as a
 * confidence booster. Beds / ICU capacity are NOT exposed by these APIs.
 */

export const HIRA_HOSP_BASIS_ENDPOINT =
  "https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList";
export const HIRA_DGSBJT_ENDPOINT =
  "https://apis.data.go.kr/B551182/MadmDtlInfoService2.7/getDgsbjtInfo2.7";

export const SEOUL_SIDO_CD = "110000";

export type HiraBasisRecord = {
  yadmNm: string;
  addr: string;
  sggu: string;
  lat: number | null;
  lon: number | null;
  drTotCnt: number | null;
  mdeptSdrCnt: number | null;
  ykiho: string;
  clCdNm: string;
};

export type HiraDeptRecord = {
  dgsbjtCd: string;
  dgsbjtCdNm: string;
  specialistCount: number;
};

// ── primitives ───────────────────────────────────────────────────────────────

function text(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function numberOrNull(value: unknown): number | null {
  const t = text(value);
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function asArray<T = unknown>(value: unknown): T[] {
  if (value === undefined || value === null) return [];
  return (Array.isArray(value) ? value : [value]) as T[];
}

/** Mirror nemc-capacity.ts: pass an already-%-encoded key through, otherwise encode once. */
function encodedServiceKey(serviceKey: string) {
  const trimmed = text(serviceKey);
  if (/%[0-9A-Fa-f]{2}/.test(trimmed)) return trimmed;
  return encodeURIComponent(trimmed);
}

export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// ── department-name → enum mapping ────────────────────────────────────────────

/**
 * Map a HIRA 진료과목 name to our Department enum. Returns null for departments we
 * do not model. Order matters: 신경외과 / 정형외과 must be checked before bare 외과.
 * cardiology / pulmonology are 내과 subspecialties not split out in the standard
 * 진료과목 list, so they are intentionally not derived here (left to proxy logic).
 */
export function mapDepartment(dgsbjtCdNm: string): Department | null {
  const n = text(dgsbjtCdNm).replace(/\s/g, "");
  if (!n) return null;
  if (n.includes("응급의학")) return "emergency_medicine";
  if (n.includes("신경외과")) return "neurosurgery";
  if (n.includes("정형외과")) return "orthopedics";
  if (n.includes("외상")) return "trauma_surgery"; // 외상외과 / 권역외상
  if (n.includes("신경과")) return "neurology";
  if (n === "외과" || n.includes("일반외과")) return "general_surgery";
  if (n.includes("내과")) return "internal_medicine";
  return null;
}

// ── name normalization for fuzzy matching ─────────────────────────────────────

const NAME_NOISE = [
  "학교법인",
  "의료법인",
  "재단법인",
  "사회복지법인",
  "공단",
  "의료재단",
  "복지의료공단",
  "대학교의과대학부속",
  "대학교의과대학",
  "대학교병원",
  "대학병원",
  "부속",
];

export function normalizeName(name: string): string {
  let n = text(name).replace(/\(.*?\)/g, ""); // drop parenthetical aliases
  for (const noise of NAME_NOISE) n = n.split(noise).join("");
  return n.replace(/[\s·.,'-]/g, "");
}

/** Cheap bidirectional containment / token-overlap name similarity in [0,1]. */
export function nameSimilarity(a: string, b: string): number {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.9;
  // character-bigram overlap (Dice)
  const grams = (s: string) => {
    const g = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2));
    return g;
  };
  const gx = grams(x);
  const gy = grams(y);
  if (gx.size === 0 || gy.size === 0) return 0;
  let inter = 0;
  for (const g of gx) if (gy.has(g)) inter++;
  return (2 * inter) / (gx.size + gy.size);
}

export type MatchConfidence = "high" | "medium" | "none";

export type HospitalMatch = {
  record: HiraBasisRecord | null;
  distanceKm: number | null;
  nameSim: number;
  confidence: MatchConfidence;
};

/**
 * Match one of our hospitals to the nearest HIRA basis record.
 * Coordinates are the primary signal (hospitals are physically fixed); name
 * similarity adjudicates confidence and guards against coincidental proximity.
 */
export function matchHospital(
  target: { name: string; lat: number; lon: number },
  hiraRecords: HiraBasisRecord[],
): HospitalMatch {
  let best: HiraBasisRecord | null = null;
  let bestDist = Infinity;
  for (const rec of hiraRecords) {
    if (rec.lat == null || rec.lon == null) continue;
    const d = haversineKm({ lat: target.lat, lon: target.lon }, { lat: rec.lat, lon: rec.lon });
    if (d < bestDist) {
      bestDist = d;
      best = rec;
    }
  }
  if (!best) return { record: null, distanceKm: null, nameSim: 0, confidence: "none" };

  const sim = nameSimilarity(target.name, best.yadmNm);
  let confidence: MatchConfidence = "none";
  if (bestDist <= 0.25 && sim >= 0.6) confidence = "high";
  else if ((bestDist <= 0.25 && sim >= 0.3) || (bestDist <= 0.6 && sim >= 0.75)) confidence = "medium";
  else confidence = "none";

  return { record: best, distanceKm: bestDist, nameSim: sim, confidence };
}

// ── API clients ───────────────────────────────────────────────────────────────

function parseBasisItem(item: Record<string, unknown>): HiraBasisRecord {
  return {
    yadmNm: text(item.yadmNm),
    addr: text(item.addr),
    sggu: text(item.sgguCdNm),
    lat: numberOrNull(item.YPos),
    lon: numberOrNull(item.XPos),
    drTotCnt: numberOrNull(item.drTotCnt),
    mdeptSdrCnt: numberOrNull(item.mdeptSdrCnt),
    ykiho: text(item.ykiho),
    clCdNm: text(item.clCdNm),
  };
}

/** Fetch one page of getHospBasisList (JSON). */
export async function fetchHospBasisPage({
  serviceKey,
  sidoCd = SEOUL_SIDO_CD,
  pageNo = 1,
  numOfRows = 1000,
  fetchImpl = fetch,
}: {
  serviceKey: string;
  sidoCd?: string;
  pageNo?: number;
  numOfRows?: number;
  fetchImpl?: typeof fetch;
}): Promise<{ records: HiraBasisRecord[]; totalCount: number }> {
  if (!text(serviceKey)) throw new Error("HIRA service key is required.");
  const url = new URL(HIRA_HOSP_BASIS_ENDPOINT);
  url.search = `serviceKey=${encodedServiceKey(serviceKey)}`;
  url.searchParams.set("sidoCd", sidoCd);
  url.searchParams.set("pageNo", String(pageNo));
  url.searchParams.set("numOfRows", String(numOfRows));
  url.searchParams.set("_type", "json");

  const res = await fetchImpl(url);
  const body = await res.text();
  if (!res.ok) throw new Error(`HIRA getHospBasisList failed: ${res.status} ${body.slice(0, 200)}`);
  const json = JSON.parse(body);
  const resp = json?.response;
  if (text(resp?.header?.resultCode) !== "00") {
    throw new Error(`HIRA getHospBasisList result ${text(resp?.header?.resultCode)}: ${text(resp?.header?.resultMsg)}`);
  }
  const items = asArray<Record<string, unknown>>(resp?.body?.items?.item);
  return {
    records: items.map(parseBasisItem),
    totalCount: numberOrNull(resp?.body?.totalCount) ?? items.length,
  };
}

/** Fetch every Seoul hospital across pages. */
export async function fetchAllSeoulHospitals({
  serviceKey,
  numOfRows = 1000,
  fetchImpl = fetch,
}: {
  serviceKey: string;
  numOfRows?: number;
  fetchImpl?: typeof fetch;
}): Promise<HiraBasisRecord[]> {
  const first = await fetchHospBasisPage({ serviceKey, pageNo: 1, numOfRows, fetchImpl });
  const records = [...first.records];
  const pages = Math.ceil(first.totalCount / numOfRows);
  for (let page = 2; page <= pages; page++) {
    const next = await fetchHospBasisPage({ serviceKey, pageNo: page, numOfRows, fetchImpl });
    records.push(...next.records);
  }
  return records;
}

/** Fetch 진료과목별 전문의수 for one hospital (by encrypted ykiho). */
export async function fetchDepartments({
  serviceKey,
  ykiho,
  fetchImpl = fetch,
}: {
  serviceKey: string;
  ykiho: string;
  fetchImpl?: typeof fetch;
}): Promise<HiraDeptRecord[]> {
  if (!text(ykiho)) throw new Error("ykiho is required.");
  const url = new URL(HIRA_DGSBJT_ENDPOINT);
  url.search = `serviceKey=${encodedServiceKey(serviceKey)}`;
  url.searchParams.set("ykiho", ykiho);
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", "100");
  url.searchParams.set("_type", "json");

  const res = await fetchImpl(url);
  const body = await res.text();
  if (!res.ok) throw new Error(`HIRA getDgsbjtInfo failed: ${res.status} ${body.slice(0, 200)}`);
  const json = JSON.parse(body);
  const resp = json?.response;
  if (text(resp?.header?.resultCode) !== "00") {
    throw new Error(`HIRA getDgsbjtInfo result ${text(resp?.header?.resultCode)}: ${text(resp?.header?.resultMsg)}`);
  }
  const items = asArray<Record<string, unknown>>(resp?.body?.items?.item);
  return items.map((item) => ({
    dgsbjtCd: text(item.dgsbjtCd),
    dgsbjtCdNm: text(item.dgsbjtCdNm),
    specialistCount: numberOrNull(item.dgsbjtPrSdrCnt) ?? 0,
  }));
}

/** Aggregate HIRA department rows into our enum: presence flags + specialist counts. */
export function aggregateDepartments(rows: HiraDeptRecord[]): {
  present: Set<Department>;
  specialistCounts: Partial<Record<Department, number>>;
} {
  const present = new Set<Department>();
  const specialistCounts: Partial<Record<Department, number>> = {};
  for (const row of rows) {
    const dept = mapDepartment(row.dgsbjtCdNm);
    if (!dept) continue;
    present.add(dept);
    specialistCounts[dept] = (specialistCounts[dept] ?? 0) + Math.max(0, row.specialistCount);
  }
  return { present, specialistCounts };
}
