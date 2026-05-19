import { apiError, ok } from "@/lib/or/api";
import { loadHospitalData } from "@/lib/or/data";
import { runTwoStagePipeline } from "@/lib/or/pipeline";
import { rankHospitals } from "@/lib/or/recommendation";
import type { OrParameters, TranscriptCase } from "@/lib/or/types";
import { assertLocation, parseOrParameters } from "@/lib/or/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("JSON object body is required.");
    }
    const input = body as Record<string, unknown>;
    const incidentLocation = assertLocation(input.incident_location);
    const limit = typeof input.limit === "number" && input.limit > 0 ? Math.min(Math.floor(input.limit), 20) : 10;
    const pipeline = await resolveOrParameters(input);
    const data = loadHospitalData();
    const recommendations = rankHospitals({
      candidates: data.primaryCandidates,
      incidentLocation,
      orParameters: pipeline.orParameters,
      limit,
    });

    return ok({
      candidatePolicy: data.summary.candidatePolicy,
      dataSummary: data.summary,
      pipeline,
      recommendations,
    });
  } catch (error) {
    return apiError(error);
  }
}

async function resolveOrParameters(input: Record<string, unknown>): Promise<{
  source: "supplied_or_parameters" | "llm_two_stage_pipeline";
  orParameters: OrParameters;
  stage1?: unknown;
  validation?: unknown;
}> {
  if (input.or_parameters) {
    const parsed = parseOrParameters(input.or_parameters);
    if (!parsed.valid) throw new Error(`Invalid or_parameters: ${parsed.failures.join("; ")}`);
    return {
      source: "supplied_or_parameters",
      orParameters: parsed.params,
    };
  }

  if (typeof input.transcript !== "string" || !input.transcript.trim()) {
    throw new Error("Either or_parameters or transcript is required.");
  }

  const testCase: TranscriptCase = {
    case_id: typeof input.case_id === "string" && input.case_id.trim() ? input.case_id : `CASE-${Date.now()}`,
    title: typeof input.title === "string" && input.title.trim() ? input.title : "Untitled emergency transcript",
    transcript: input.transcript,
  };
  const result = await runTwoStagePipeline(testCase);
  return {
    source: "llm_two_stage_pipeline",
    orParameters: result.stage2.or_parameters,
    stage1: result.stage1,
    validation: result.validation,
  };
}
