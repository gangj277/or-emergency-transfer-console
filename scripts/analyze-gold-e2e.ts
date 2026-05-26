import fs from "node:fs";
import path from "node:path";

import { buildGoldE2eSummary, type GoldE2eCaseMetric, type HospitalSummary } from "../lib/or/gold-e2e";
import { TIME_SOFT_FLAG } from "../lib/or/recommendation";
import type { OrParameters } from "../lib/or/types";

type RawCase = GoldE2eCaseMetric & {
  title: string;
  labels?: Record<string, unknown>;
  selection: {
    category: string;
    or_relevance_reason?: string;
    key_medical_phrases?: string[];
  };
  error?: string;
  top3: HospitalSummary[];
};

type RawResults = {
  metadata: Record<string, unknown>;
  cases: RawCase[];
};

type CaseReview = {
  case_id: string;
  category: string;
  district: string;
  stage1_read: string;
  stage2_read: string;
  ranking_read: string;
  gap_tags: string[];
  reviewer_note: string;
};

type SourceCase = {
  case_id: string;
  transcript?: string;
  labels?: Record<string, unknown>;
  selection?: {
    key_medical_phrases?: string[];
  };
};

const NON_TRAUMA_CATEGORIES = new Set([
  "cardiac_arrest_rosc",
  "stroke_neuro_consciousness",
  "respiratory_failure_airway",
  "seizure_neurologic",
  "chest_pain_cardiac",
  "major_bleeding_gi",
  "critical_medical_unspecified",
]);

function main() {
  const args = parseArgs(process.argv.slice(2));
  const runDir = path.resolve(args.runDir ?? "outputs/gold-e2e/latest");
  const rawPath = path.join(runDir, "results/raw-results.json");
  const raw = JSON.parse(fs.readFileSync(rawPath, "utf8")) as RawResults;
  const analysisDir = path.join(runDir, "analysis");
  const resultsDir = path.join(runDir, "results");
  fs.mkdirSync(analysisDir, { recursive: true });
  fs.mkdirSync(resultsDir, { recursive: true });

  const sourceById = readSourceCases(raw.metadata.source);
  const summary = buildGoldE2eSummary(raw.cases);
  const reviews = raw.cases.map((row) => buildCaseReview(row, sourceById.get(row.case_id)));
  const selectedGaps = selectRootGaps(raw.cases, reviews, sourceById);
  const report = buildGapReport(raw, summary, reviews, selectedGaps);

  fs.writeFileSync(path.join(resultsDir, "case-review.json"), `${JSON.stringify(reviews, null, 2)}\n`);
  fs.writeFileSync(path.join(analysisDir, "quant-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  fs.writeFileSync(path.join(analysisDir, "gap-report.md"), report);

  console.log(
    JSON.stringify(
      {
        runDir,
        caseCount: raw.cases.length,
        selectedRootGapCount: selectedGaps.length,
        output: path.join(analysisDir, "gap-report.md"),
      },
      null,
      2,
    ),
  );
}

function buildCaseReview(row: RawCase, sourceCase?: SourceCase): CaseReview {
  const tags: string[] = [];
  const params = row.stage2_parameters;
  const stage1Read =
    row.pipeline_status === "failed"
      ? "LLM pipeline 실패로 Stage 1 검토 불가"
      : row.stage1_fact_count < 4
        ? "핵심 증상 보존 부족 의심"
        : "핵심 증상 보존 후보";

  if (row.pipeline_status === "failed") tags.push("llm_pipeline_failure");
  if (row.stage1_fact_count < 4 && row.pipeline_status === "succeeded") tags.push("stage1_low_fact_count");

  const schemaMismatch = isSchemaCoverageMismatch(row, sourceCase);
  const stage2Read =
    row.pipeline_status === "failed"
      ? "OR parameter 생성 실패"
      : schemaMismatch
        ? "비외상 고위험 케이스가 외상 중심 incident enum에 강제 매핑됨"
        : "OR parameter 자동 판정 후보";

  if (schemaMismatch) tags.push("incident_schema_coverage_gap");
  if (row.validation_failure_count > 0) tags.push("validation_failure");
  if (row.validation_warning_count > 0) tags.push("validation_warning");
  if (params?.max_transport_time_min && params.max_transport_time_min <= 15) tags.push("tight_transport_window");

  const top1SoftTimeExceeded = isTimeSoftExceeded(row.top1);
  let rankingRead = "추천 후보는 현재 정식화 기준 납득 가능";
  if (row.ranking_status !== "succeeded") {
    rankingRead = "ranking 미실행";
  } else if (row.strict_feasible_count === 0) {
    rankingRead = "제약 만족 후보 없음";
  } else if (top1SoftTimeExceeded) {
    rankingRead = "1순위 추천이 요청 이송시간을 초과해 소프트 페널티로 처리됨";
  } else if (row.within_time_feasible_count === 0) {
    rankingRead = "하드 제약은 만족하지만 요청 이송시간 내 후보가 없음";
  } else if (row.top1?.timeSlackMin !== undefined && row.top1.timeSlackMin >= 0 && row.top1.timeSlackMin < 5) {
    rankingRead = "1순위 추천의 이송시간 여유가 5분 미만";
  } else if (row.top1?.bedBufferTier === "high_risk_1_2") {
    rankingRead = "1순위 추천이 1-2개 병상 고위험 버퍼";
  }

  if (row.strict_feasible_count === 0) tags.push("no_strict_feasible_candidate");
  if (row.within_time_feasible_count === 0) tags.push("no_within_time_feasible_candidate");
  if (top1SoftTimeExceeded) tags.push("soft_transport_exceeded_top1");
  if (row.top1?.timeSlackMin !== undefined && row.top1.timeSlackMin >= 0 && row.top1.timeSlackMin < 5) tags.push("low_time_slack");
  if (row.top1?.bedBufferTier === "high_risk_1_2") tags.push("thin_bed_buffer_top1");
  if (row.top1 && row.nearest_feasible_top1 && row.top1.hospitalId !== row.nearest_feasible_top1.hospitalId) {
    tags.push("differs_from_nearest_feasible");
  }

  return {
    case_id: row.case_id,
    category: row.category,
    district: row.synthetic_location.district,
    stage1_read: stage1Read,
    stage2_read: stage2Read,
    ranking_read: rankingRead,
    gap_tags: tags.slice(0, 3),
    reviewer_note: buildReviewerNote(row, params),
  };
}

function selectRootGaps(rows: RawCase[], reviews: CaseReview[], sourceById: Map<string, SourceCase>) {
  const gaps = [];
  const nonTraumaRows = rows.filter((row) => NON_TRAUMA_CATEGORIES.has(row.category));
  const schemaMismatchCount = rows.filter((row) => isSchemaCoverageMismatch(row, sourceById.get(row.case_id))).length;
  if (schemaMismatchCount > 0) {
    const medicalIncidentCount = rows.filter((row) => row.stage2_parameters && !isTraumaIncident(row.stage2_parameters.incident_type)).length;
    gaps.push({
      title: "임상축 재정렬 후에도 dominant 6축 밖 medical edge case가 trauma fallback으로 남음",
      evidence: `${medicalIncidentCount}/${rows.length} cases now use medical incident enums, but ${schemaMismatchCount}/${nonTraumaRows.length} non-trauma high-acuity cases with no source trauma mechanism still mapped to trauma-centered incident enums.`,
      rootCause: "심정지/뇌졸중/호흡부전/발작/흉통/GI 출혈 축은 생겼지만, 중독·대사성 의식저하·산과성 출혈·원인미상 critical medical처럼 현장 텍스트에 실제로 나타나는 edge medical 축은 아직 명시되지 않았다.",
      fixDirection: "enum을 진단명처럼 크게 늘리지 말고 `toxicologic_metabolic`, `obstetric_bleeding`, `undifferentiated_critical_medical` 정도의 제한된 catch-all medical 축을 추가하거나, 최소한 `other_trauma` 대신 medical fallback으로 보내는 deterministic guard를 둔다.",
      notFixYet: "남은 케이스를 모두 개별 질환 enum으로 쪼개면 라벨 없는 상태에서 schema가 다시 과적합되고 Stage 2 선택 안정성이 떨어진다.",
    });
  }

  const failedCount = rows.filter((row) => row.pipeline_status === "failed").length;
  const validationIssueCount = reviews.filter((review) =>
    review.gap_tags.some((tag) => tag === "validation_failure" || tag === "validation_warning" || tag === "stage1_low_fact_count"),
  ).length;
  if (failedCount > 0 || validationIssueCount > 0) {
    gaps.push({
      title: "LLM 출력 품질은 ranking 품질과 분리해서 관리해야 함",
      evidence: `${failedCount} pipeline failures and ${validationIssueCount} validation/low-fact warning cases were observed.`,
      rootCause: "Stage 1 사실 보존, Stage 2 parameter mapping, OR ranking이 한 API 응답 안에 붙어 있어 실패 원인이 섞이기 쉽다.",
      fixDirection: "Stage별 retry/review queue를 만들고, Stage 2 후에는 category-aware consistency check를 통과한 case만 ranking claim에 포함한다.",
      notFixYet: "단순 프롬프트 강화만으로는 schema mismatch와 validation 문제를 동시에 해결하기 어렵다.",
    });
  }

  const rankedRows = rows.filter((row) => row.ranking_status === "succeeded");
  const noFeasibleCount = rankedRows.filter((row) => row.strict_feasible_count === 0).length;
  const noWithinTimeFeasibleCount = rankedRows.filter((row) => row.within_time_feasible_count === 0).length;
  const softTransportTop1Count = rankedRows.filter((row) => isTimeSoftExceeded(row.top1)).length;
  const lowSlackCount = rankedRows.filter(
    (row) => row.top1?.timeSlackMin !== undefined && row.top1.timeSlackMin >= 0 && row.top1.timeSlackMin < 5,
  ).length;
  if (noFeasibleCount > 0 || noWithinTimeFeasibleCount > 0 || softTransportTop1Count > Math.max(3, rows.length * 0.1) || lowSlackCount > Math.max(3, rows.length * 0.1)) {
    gaps.push({
      title: "이송시간은 하드 탈락보다 소프트 비용·경고 calibration 문제로 관리해야 함",
      evidence: `${noFeasibleCount} hard no-feasible cases, ${noWithinTimeFeasibleCount} no within-time feasible cases, ${softTransportTop1Count} top-1 soft transport exceedances, and ${lowSlackCount} top recommendations with 0-5 minutes slack.`,
      rootCause: "시간 소프트화로 zero-feasible 절벽은 줄었지만, 현재 ETA는 실제 경로/교통/오프로드 시간이 아니라 deterministic Seoul proxy라 초과 페널티와 경고 문구의 calibration이 production claim을 좌우한다.",
      fixDirection: "시간 초과를 feasible 실패와 분리해 표시하고, top-1이 시간을 넘는 케이스는 second-best/within-time 후보와 같이 노출하며, 추후 route-time API 또는 실측 이송시간으로만 계수를 보정한다.",
      notFixYet: "시간 소프트 페널티 계수를 라벨 없이 임의로 키우면 schema 개선 효과와 ETA proxy 오차가 다시 섞인다.",
    });
  }

  const topHospitalCounts = countTopHospitals(rows);
  const [topHospital, topHospitalCount] = Object.entries(topHospitalCounts).sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
  if (topHospitalCount > Math.max(12, rows.length * 0.2)) {
    gaps.push({
      title: "특정 병원 쏠림은 capacity snapshot 기반 ranking의 calibration gap을 시사",
      evidence: `${topHospital} appears as top-1 in ${topHospitalCount}/${rows.length} cases.`,
      rootCause: "고정 스냅샷 병상, 제한된 capability table, 단일 비용식이 결합되면 일부 병원이 넓은 권역에서 반복 선택될 수 있다.",
      fixDirection: "병원별 acceptance/crowding history와 specialty-specific capacity를 추가하고, 반복 추천 externality를 별도 항으로 평가한다.",
      notFixYet: "현재 100개 실험은 단일 시점 스냅샷이므로 병원 운영 부하까지 production-ready라고 주장하면 안 된다.",
    });
  }

  const thinBufferCount = reviews.filter((review) => review.gap_tags.includes("thin_bed_buffer_top1")).length;
  if (thinBufferCount > 0) {
    gaps.push({
      title: "병상 버퍼는 작동하지만 ETA 시점 가용성은 아직 모델링하지 못함",
      evidence: `${thinBufferCount} top-1 recommendations still had only 1-2 available ER beds.`,
      rootCause: "현재 모델은 현재 시점 병상 수를 쓰며 이송 중 병상 소진 확률을 직접 예측하지 않는다.",
      fixDirection: "NEMC polling history로 arrival-time-adjusted capacity를 추정하고, low-buffer top-1에는 fallback 후보를 함께 노출한다.",
      notFixYet: "단순히 1-2개 병상 병원을 전부 금지하면 가까운 적정 병원을 과도하게 배제할 수 있다.",
    });
  }

  return gaps.slice(0, 5);
}

function buildGapReport(raw: RawResults, summary: unknown, reviews: CaseReview[], gaps: ReturnType<typeof selectRootGaps>) {
  const failedReviews = reviews.filter((review) => review.gap_tags.length > 0).slice(0, 15);
  const lines = [
    "# Gold 100 E2E GAP 분석 리포트",
    "",
    `생성 시각: ${new Date().toISOString()}`,
    `Run: ${String(raw.metadata.runId ?? "unknown")}`,
    "",
    "## 핵심 정량 요약",
    "",
    "```json",
    JSON.stringify(summary, null, 2),
    "```",
    "",
    "## Selected Root Gaps",
    "",
    ...gaps.flatMap((gap, index) => [
      `### ${index + 1}. ${gap.title}`,
      `- evidence: ${gap.evidence}`,
      `- root cause: ${gap.rootCause}`,
      `- fix direction: ${gap.fixDirection}`,
      `- not fix yet: ${gap.notFixYet}`,
      "",
    ]),
    "## 케이스별 전수 리뷰 테이블",
    "",
    "| case | category | district | stage1 | stage2 | ranking | tags |",
    "|---|---|---|---|---|---|---|",
    ...reviews.map((review) =>
      [
        review.case_id,
        review.category,
        review.district,
        review.stage1_read,
        review.stage2_read,
        review.ranking_read,
        review.gap_tags.join(", "),
      ]
        .map(escapeTable)
        .join("|"),
    ).map((row) => `|${row}|`),
    "",
    "## 대표 포렌식 후보",
    "",
    ...failedReviews.flatMap((review) => [
      `### ${review.case_id} · ${review.category} · ${review.district}`,
      `- tags: ${review.gap_tags.join(", ") || "none"}`,
      `- stage1: ${review.stage1_read}`,
      `- stage2: ${review.stage2_read}`,
      `- ranking: ${review.ranking_read}`,
      `- note: ${review.reviewer_note}`,
      "",
    ]),
  ];
  return `${lines.join("\n")}\n`;
}

function buildReviewerNote(row: RawCase, params: OrParameters | null) {
  if (row.pipeline_status === "failed") return row.error ?? "pipeline failed without error text";
  const top = row.top1 ? `${row.top1.hospitalName}, ${row.top1.estimatedTravelTimeMin}분, ${row.top1.availableErBeds} beds` : "no top feasible";
  const maxTime = params ? `${params.max_transport_time_min}분` : "n/a";
  const overWindow = row.top1?.overWindow ?? false;
  return `top=${top}; max_transport=${maxTime}; hard_feasible=${row.strict_feasible_count ?? "n/a"}; within_time_feasible=${row.within_time_feasible_count ?? "n/a"}; top1_over_window=${overWindow}`;
}

function isTraumaIncident(incidentType: string) {
  return incidentType.includes("trauma") || incidentType.includes("fall") || incidentType.includes("head_injury");
}

function isSchemaCoverageMismatch(row: RawCase, sourceCase?: SourceCase) {
  const params = row.stage2_parameters;
  if (!params || !NON_TRAUMA_CATEGORIES.has(row.category) || !isTraumaIncident(params.incident_type)) return false;
  return !hasSourceTraumaMechanism(sourceCase);
}

function hasSourceTraumaMechanism(sourceCase?: SourceCase) {
  if (!sourceCase) return false;
  const text = [
    sourceCase.transcript,
    typeof sourceCase.labels?.symptom === "string" ? sourceCase.labels.symptom : "",
    sourceCase.selection?.key_medical_phrases?.join(" "),
  ]
    .filter(Boolean)
    .join(" ");

  return /낙상|추락|넘어|넘어져|떨어|계단|교통|차량|자동차|오토바이|자전거|보행자|충돌|부딪|사고|골절|열상|찰과상|타박상|두부외상|뇌진탕|머리.*(다침|부딪|충격|맞)|그라인더|분쇄|절단|깔림|끼임|압궤|상처/.test(
    text,
  );
}

function countTopHospitals(rows: RawCase[]) {
  return rows.reduce<Record<string, number>>((acc, row) => {
    if (row.top1?.hospitalName) acc[row.top1.hospitalName] = (acc[row.top1.hospitalName] ?? 0) + 1;
    return acc;
  }, {});
}

function escapeTable(value: string) {
  return value.replaceAll("|", "/").replace(/\n/g, " ");
}

function isTimeSoftExceeded(item: HospitalSummary | null) {
  return Boolean(item?.softFlags?.includes(TIME_SOFT_FLAG) || (typeof item?.timeSlackMin === "number" && item.timeSlackMin < 0));
}

function parseArgs(argv: string[]) {
  const args: { runDir?: string } = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--run-dir") args.runDir = argv[++i];
  }
  return args;
}

function readSourceCases(source: unknown) {
  if (typeof source !== "string" || !fs.existsSync(source)) return new Map<string, SourceCase>();
  const parsed = JSON.parse(fs.readFileSync(source, "utf8")) as SourceCase[];
  return new Map(parsed.map((item) => [item.case_id, item]));
}

main();
