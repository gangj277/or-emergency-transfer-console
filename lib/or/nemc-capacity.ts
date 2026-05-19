import { XMLParser } from "fast-xml-parser";
import type { HospitalCapacity } from "./types";

export const NEMC_CAPACITY_ENDPOINT =
  "https://apis.data.go.kr/B552657/ErmctInfoInqireService/getEmrrmRltmUsefulSckbdInfoInqire";

const parser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: true,
});

type RawCapacityItem = Record<string, unknown>;

function asArray(value: unknown): RawCapacityItem[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? (value as RawCapacityItem[]) : [value as RawCapacityItem];
}

function text(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function pick(item: RawCapacityItem, ...keys: string[]) {
  for (const key of keys) {
    if (item[key] !== undefined && item[key] !== null && text(item[key]) !== "") {
      return item[key];
    }
  }
  return undefined;
}

function numberOrNull(value: unknown): number | null {
  const valueText = text(value);
  if (!valueText) return null;
  const n = Number(valueText);
  return Number.isFinite(n) ? n : null;
}

function yesNoOrNull(value: unknown): boolean | null {
  const valueText = text(value).toUpperCase();
  if (valueText === "Y") return true;
  if (valueText === "N") return false;
  return null;
}

function encodedServiceKey(serviceKey: string) {
  const trimmed = text(serviceKey);
  if (/%[0-9A-Fa-f]{2}/.test(trimmed)) return trimmed;
  return encodeURIComponent(trimmed);
}

export function buildCapacityUrl({
  serviceKey,
  stage1 = "서울특별시",
  stage2,
  pageNo = 1,
  numOfRows = 100,
}: {
  serviceKey: string;
  stage1?: string;
  stage2: string;
  pageNo?: number;
  numOfRows?: number;
}) {
  if (!text(serviceKey)) throw new Error("NEMC service key is required.");
  if (!text(stage2)) throw new Error("stage2 district is required.");

  const url = new URL(NEMC_CAPACITY_ENDPOINT);
  url.search = `serviceKey=${encodedServiceKey(serviceKey)}`;
  url.searchParams.set("STAGE1", stage1);
  url.searchParams.set("STAGE2", stage2);
  url.searchParams.set("pageNo", String(pageNo));
  url.searchParams.set("numOfRows", String(numOfRows));
  return url;
}

export function parseCapacityXml(xmlText: string) {
  const parsed = parser.parse(xmlText);
  const serviceError = parsed.OpenAPI_ServiceResponse?.cmmMsgHeader;
  if (serviceError) {
    return {
      resultCode: text(serviceError.returnReasonCode || serviceError.errMsg),
      resultMsg: text(serviceError.returnAuthMsg || serviceError.errMsg),
      pageNo: null,
      numOfRows: null,
      totalCount: 0,
      items: [] as RawCapacityItem[],
    };
  }

  const response = parsed.response;
  if (!response) throw new Error("Unexpected NEMC XML response shape.");

  const header = response.header || {};
  const body = response.body || {};
  const items = asArray(body.items?.item);

  return {
    resultCode: text(header.resultCode),
    resultMsg: text(header.resultMsg || header.resultMag),
    pageNo: numberOrNull(body.pageNo),
    numOfRows: numberOrNull(body.numOfRows),
    totalCount: numberOrNull(body.totalCount) ?? items.length,
    items,
  };
}

export function computeCongestionScore(availableErBeds: number | null) {
  if (!Number.isFinite(availableErBeds)) {
    return { score: null, level: "unknown" as const, penalty: null };
  }
  if ((availableErBeds as number) <= 0) return { score: 1, level: "full" as const, penalty: 100 };
  if ((availableErBeds as number) <= 2) return { score: 0.7, level: "high" as const, penalty: 70 };
  if ((availableErBeds as number) <= 5) return { score: 0.4, level: "medium" as const, penalty: 40 };
  return { score: 0.1, level: "low" as const, penalty: 10 };
}

export function normalizeCapacityItem(
  item: RawCapacityItem,
  { requestedDistrict, fetchedAt }: { requestedDistrict: string; fetchedAt: string },
): HospitalCapacity {
  const availableErBeds = numberOrNull(item.hvec);
  const congestion = computeCongestionScore(availableErBeds);

  return {
    hospital_id: text(item.hpid),
    hpid: text(item.hpid),
    previous_hpid: text(item.phpid),
    duty_name_live: text(pick(item, "dutyname", "dutyName")),
    er_phone_live: text(pick(item, "dutytel3", "dutyTel3")),
    requested_stage1: "서울특별시",
    requested_district: requestedDistrict,
    fetched_at: fetchedAt,
    hvidate_raw: text(item.hvidate),
    available_er_beds: availableErBeds,
    available_operating_rooms: numberOrNull(item.hvoc),
    available_neuro_icu_beds: numberOrNull(item.hvcc),
    available_neonatal_icu_beds: numberOrNull(item.hvncc),
    available_thoracic_icu_beds: numberOrNull(item.hvccc),
    available_general_icu_beds: numberOrNull(item.hvicc),
    available_inpatient_beds: numberOrNull(item.hvgc),
    available_internal_medicine_icu_beds: numberOrNull(item.hv2),
    available_surgical_icu_beds: numberOrNull(item.hv3),
    available_orthopedic_inpatient_beds: numberOrNull(item.hv4),
    available_neurology_inpatient_beds: numberOrNull(item.hv5),
    available_neurosurgery_icu_beds: numberOrNull(item.hv6),
    available_drug_intoxication_icu_beds: numberOrNull(item.hv7),
    available_burn_icu_beds: numberOrNull(item.hv8),
    available_trauma_icu_beds: numberOrNull(item.hv9),
    ct_available_live: yesNoOrNull(item.hvctayn),
    mri_available_live: yesNoOrNull(item.hvmriayn),
    angiography_available_live: yesNoOrNull(item.hvangioayn),
    ventilator_available_live: yesNoOrNull(item.hvventiayn),
    ambulance_available_live: yesNoOrNull(item.hvamyn),
    pediatric_ventilator_available_live: yesNoOrNull(item.hv10),
    incubator_available_live: yesNoOrNull(item.hv11),
    live_congestion_score: congestion.score,
    live_congestion_level: congestion.level,
    live_congestion_penalty: congestion.penalty,
    capacity_source: "nemc_live_getEmrrmRltmUsefulSckbdInfoInqire",
    active_in_hospital_master: false,
  };
}

export function buildCapacityRows(
  items: RawCapacityItem[],
  {
    requestedDistrict,
    fetchedAt,
    activeHospitalIds = new Set<string>(),
  }: {
    requestedDistrict: string;
    fetchedAt: string;
    activeHospitalIds?: Set<string>;
  },
) {
  return items.map((item) => {
    const row = normalizeCapacityItem(item, { requestedDistrict, fetchedAt });
    return {
      ...row,
      active_in_hospital_master: activeHospitalIds.has(row.hospital_id),
    };
  });
}

export async function fetchCapacityDistrict({
  serviceKey,
  district,
  pageNo = 1,
  numOfRows = 100,
  fetchImpl = fetch,
}: {
  serviceKey: string;
  district: string;
  pageNo?: number;
  numOfRows?: number;
  fetchImpl?: typeof fetch;
}) {
  const url = buildCapacityUrl({ serviceKey, stage2: district, pageNo, numOfRows });
  const response = await fetchImpl(url);
  const xmlText = await response.text();
  if (!response.ok) {
    throw new Error(`NEMC capacity request failed for ${district}: ${response.status} ${xmlText.slice(0, 300)}`);
  }
  return { parsed: parseCapacityXml(xmlText) };
}

export async function refreshSeoulCapacity({
  serviceKey,
  districts,
  activeHospitalIds,
}: {
  serviceKey: string;
  districts: string[];
  activeHospitalIds: Set<string>;
}) {
  const fetchedAt = new Date().toISOString();
  const rows: HospitalCapacity[] = [];
  const fetchLog = [];

  for (const district of districts) {
    const { parsed } = await fetchCapacityDistrict({ serviceKey, district });
    fetchLog.push({
      requested_stage1: "서울특별시",
      requested_district: district,
      fetched_at: fetchedAt,
      result_code: parsed.resultCode,
      result_msg: parsed.resultMsg,
      total_count: parsed.totalCount,
      returned_items: parsed.items.length,
    });
    if (parsed.resultCode !== "00") {
      throw new Error(`NEMC returned ${parsed.resultCode} for ${district}: ${parsed.resultMsg}`);
    }
    rows.push(...buildCapacityRows(parsed.items, { requestedDistrict: district, fetchedAt, activeHospitalIds }));
  }

  const uniqueRows = [...new Map(rows.map((row) => [row.hospital_id, row])).values()].sort((a, b) =>
    a.duty_name_live.localeCompare(b.duty_name_live, "ko"),
  );

  return { fetchedAt, rows: uniqueRows, fetchLog };
}
