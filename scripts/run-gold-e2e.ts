import fs from "node:fs";
import path from "node:path";

import { loadHospitalData } from "../lib/or/data";
import {
  assignSyntheticLocations,
  buildGoldE2eSummary,
  clampGoldE2eWorkerCount,
  chooseNearestFeasible,
  runWithConcurrency,
  summarizeRankedHospital,
  type GoldCase,
  type GoldCaseWithSyntheticLocation,
  type GoldE2eCaseMetric,
  type HospitalSummary,
} from "../lib/or/gold-e2e";
import { runTwoStagePipeline } from "../lib/or/pipeline";
import { rankHospitals, TIME_SOFT_FLAG } from "../lib/or/recommendation";
import { buildTravelTimes } from "../lib/or/travel-matrix";
import type { HospitalCandidate, OrParameters, TranscriptCase } from "../lib/or/types";

type CaseRunResult = GoldE2eCaseMetric & {
  title: string;
  labels?: GoldCase["labels"];
  selection: GoldCase["selection"];
  attempt_count: number;
  error?: string;
  stage1: unknown | null;
  validation: unknown | null;
  top3: HospitalSummary[];
  recommendations: {
    strictFeasibleCount: number;
    relaxedFallbackUsed: boolean;
    constraintDiagnostics: unknown;
  } | null;
};

type RawResults = {
  metadata: {
    runId: string;
    generatedAt: string;
    source: string;
    capacityMode: "static_snapshot";
    model: string;
    limit: number | null;
    workerCount: number;
  };
  cases: CaseRunResult[];
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runId = args.runId ?? createRunId();
  const runDir = path.resolve("outputs/gold-e2e", runId);
  const inputPath = args.input ? path.resolve(args.input) : await ensureInput(runDir);
  const resultsDir = path.join(runDir, "results");
  const analysisDir = path.join(runDir, "analysis");
  fs.mkdirSync(resultsDir, { recursive: true });
  fs.mkdirSync(analysisDir, { recursive: true });

  const cases = (JSON.parse(fs.readFileSync(inputPath, "utf8")) as GoldCaseWithSyntheticLocation[]).slice(
    0,
    args.limit ?? undefined,
  );
  const workerCount = clampGoldE2eWorkerCount(args.workerCount);
  const hospitalData = loadHospitalData();
  const candidates = hospitalData.primaryCandidates;
  const rawPath = path.join(resultsDir, "raw-results.json");
  const previous = args.resume ? readPrevious(rawPath) : null;
  const previousById = new Map(previous?.cases.map((item) => [item.case_id, item]));
  const output: RawResults = previous ?? {
    metadata: {
      runId,
      generatedAt: new Date().toISOString(),
      source: inputPath,
      capacityMode: "static_snapshot",
      model: process.env.OPENROUTER_MODEL || "openai/gpt-5.4-mini",
      limit: args.limit ?? null,
      workerCount,
    },
    cases: [],
  };
  output.metadata = {
    ...output.metadata,
    runId,
    source: inputPath,
    capacityMode: "static_snapshot",
    model: process.env.OPENROUTER_MODEL || String(output.metadata.model ?? "openai/gpt-5.4-mini"),
    limit: args.limit ?? null,
    workerCount,
  };
  writeRunArtifacts({ output, cases, rawPath, summaryPath: path.join(analysisDir, "quant-summary.json") });

  const pendingCases = cases.filter((goldCase) => {
    const previousCase = previousById.get(goldCase.case_id);
    return !(args.resume && previousCase?.pipeline_status === "succeeded");
  });

  await runWithConcurrency(
    pendingCases,
    workerCount,
    (goldCase) => runCase(goldCase, candidates),
    (result) => {
      upsertCase(output, result);
      writeRunArtifacts({ output, cases, rawPath, summaryPath: path.join(analysisDir, "quant-summary.json") });
      console.log(
        `${output.cases.length}/${cases.length} ${result.case_id}: ${result.pipeline_status}/${result.ranking_status}`,
      );
    },
  );

  updateLatest(runDir);
  console.log(JSON.stringify({ runId, rawPath, caseCount: output.cases.length, workerCount }, null, 2));
}

async function runCase(goldCase: GoldCaseWithSyntheticLocation, candidates: HospitalCandidate[]): Promise<CaseRunResult> {
  const title = buildTitle(goldCase);
  const started = Date.now();
  const testCase: TranscriptCase = {
    case_id: goldCase.case_id,
    title,
    transcript: goldCase.transcript,
  };

  try {
    const { value: pipeline, attemptCount } = await runWithRetry(() => runTwoStagePipeline(testCase), 1);
    const latency = Date.now() - started;
    const params = pipeline.stage2.or_parameters;
    const ranking = rankHospitals({
      candidates,
      incidentLocation: goldCase.synthetic_location,
      orParameters: params,
      limit: candidates.length,
      travelTimes: buildTravelTimes(goldCase.synthetic_location, candidates),
    });
    const top1 = ranking.rankings.find((item) => item.feasible) ?? null;
    const nearest = chooseNearestFeasible(ranking.rankings);
    const metric = baseMetric(goldCase, "succeeded", latency, params);
    const withinTimeFeasibleCount = ranking.rankings.filter((item) => item.feasible && item.checks.withinMaxTransportTime).length;
    const softTimeExceededCandidateCount = ranking.rankings.filter(
      (item) => item.feasible && item.softFlags.includes(TIME_SOFT_FLAG),
    ).length;

    return {
      ...metric,
      title,
      labels: goldCase.labels,
      selection: goldCase.selection,
      attempt_count: attemptCount,
      stage1: pipeline.stage1,
      validation: pipeline.validation,
      stage1_fact_count: getStage1FactCount(pipeline.stage1),
      stage1_missing_info_count: getStage1MissingInfoCount(pipeline.stage1),
      validation_failure_count: countValidationItems(pipeline.validation, "failures"),
      validation_warning_count: countValidationItems(pipeline.validation, "warnings"),
      ranking_status: "succeeded",
      strict_feasible_count: ranking.strictFeasibleCount,
      within_time_feasible_count: withinTimeFeasibleCount,
      soft_time_exceeded_candidate_count: softTimeExceededCandidateCount,
      top1: summarizeRankedHospital(top1),
      nearest_feasible_top1: summarizeRankedHospital(nearest),
      top3: ranking.rankings.slice(0, 3).map((item) => summarizeRankedHospital(item)!),
      recommendations: {
        strictFeasibleCount: ranking.strictFeasibleCount,
        relaxedFallbackUsed: ranking.relaxedFallbackUsed,
        constraintDiagnostics: ranking.constraintDiagnostics,
      },
    };
  } catch (error) {
    return {
      ...baseMetric(goldCase, "failed", Date.now() - started, null),
      title,
      labels: goldCase.labels,
      selection: goldCase.selection,
      attempt_count: 2,
      error: error instanceof Error ? error.message : String(error),
      stage1: null,
      validation: null,
      top3: [],
      recommendations: null,
    };
  }
}

function baseMetric(
  goldCase: GoldCaseWithSyntheticLocation,
  pipelineStatus: "succeeded" | "failed",
  latency: number,
  params: OrParameters | null,
): GoldE2eCaseMetric {
  return {
    case_id: goldCase.case_id,
    category: goldCase.selection.category,
    synthetic_location: goldCase.synthetic_location,
    pipeline_status: pipelineStatus,
    pipeline_latency_ms: latency,
    stage1_fact_count: 0,
    stage1_missing_info_count: 0,
    stage2_parameters: params,
    validation_failure_count: pipelineStatus === "failed" ? 1 : 0,
    validation_warning_count: 0,
    ranking_status: pipelineStatus === "succeeded" ? "failed" : "skipped",
    strict_feasible_count: null,
    within_time_feasible_count: null,
    soft_time_exceeded_candidate_count: null,
    top1: null,
    nearest_feasible_top1: null,
  };
}

async function runWithRetry<T>(fn: () => Promise<T>, retries: number) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return { value: await fn(), attemptCount: attempt + 1 };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function ensureInput(runDir: string) {
  const inputDir = path.join(runDir, "inputs");
  fs.mkdirSync(inputDir, { recursive: true });
  const inputPath = path.join(inputDir, "gold_cases_with_synthetic_locations.json");
  if (!fs.existsSync(inputPath)) {
    const source = JSON.parse(fs.readFileSync("gold_dataset/gold_cases.json", "utf8")) as GoldCase[];
    fs.writeFileSync(inputPath, `${JSON.stringify(assignSyntheticLocations(source), null, 2)}\n`);
  }
  return inputPath;
}

function getStage1FactCount(stage1: unknown) {
  const facts = (stage1 as { medical_observations?: { clinical_facts?: unknown[] } })?.medical_observations?.clinical_facts;
  return Array.isArray(facts) ? facts.length : 0;
}

function getStage1MissingInfoCount(stage1: unknown) {
  const missing = (stage1 as { medical_observations?: { missing_critical_info?: unknown[] } })?.medical_observations?.missing_critical_info;
  return Array.isArray(missing) ? missing.length : 0;
}

function countValidationItems(validation: unknown, key: "failures" | "warnings") {
  const v = validation as { stage1?: Record<string, unknown[]>; stage2?: Record<string, unknown[]> };
  return (v.stage1?.[key]?.length ?? 0) + (v.stage2?.[key]?.length ?? 0);
}

function buildTitle(goldCase: GoldCase) {
  const symptom = typeof goldCase.labels?.symptom === "string" && goldCase.labels.symptom ? goldCase.labels.symptom : goldCase.selection.category;
  return `${goldCase.case_id} ${symptom}`;
}

function parseArgs(argv: string[]) {
  const args: { runId?: string; input?: string; limit?: number; resume: boolean; workerCount?: number } = { resume: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--run-id") args.runId = argv[++i];
    else if (argv[i] === "--input") args.input = argv[++i];
    else if (argv[i] === "--limit") args.limit = Number(argv[++i]);
    else if (argv[i] === "--workers" || argv[i] === "--max-workers") args.workerCount = Number(argv[++i]);
    else if (argv[i] === "--resume") args.resume = true;
  }
  return args;
}

function upsertCase(output: RawResults, result: CaseRunResult) {
  const index = output.cases.findIndex((item) => item.case_id === result.case_id);
  if (index >= 0) output.cases[index] = result;
  else output.cases.push(result);
}

function writeRunArtifacts({
  output,
  cases,
  rawPath,
  summaryPath,
}: {
  output: RawResults;
  cases: GoldCaseWithSyntheticLocation[];
  rawPath: string;
  summaryPath: string;
}) {
  const caseOrder = new Map(cases.map((goldCase, index) => [goldCase.case_id, index]));
  output.cases.sort((a, b) => (caseOrder.get(a.case_id) ?? Number.MAX_SAFE_INTEGER) - (caseOrder.get(b.case_id) ?? Number.MAX_SAFE_INTEGER));
  writeJsonAtomic(rawPath, output);
  writeJsonAtomic(summaryPath, buildGoldE2eSummary(output.cases));
}

function writeJsonAtomic(filePath: string, value: unknown) {
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmpPath, filePath);
}

function readPrevious(rawPath: string): RawResults | null {
  if (!fs.existsSync(rawPath)) return null;
  return JSON.parse(fs.readFileSync(rawPath, "utf8")) as RawResults;
}

function createRunId() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function updateLatest(outDir: string) {
  const latest = path.resolve("outputs/gold-e2e/latest");
  fs.rmSync(latest, { recursive: true, force: true });
  try {
    fs.symlinkSync(outDir, latest, "dir");
  } catch {
    fs.cpSync(outDir, latest, { recursive: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
