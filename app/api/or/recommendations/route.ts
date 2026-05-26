import { apiError, ok } from "@/lib/or/api";
import { loadHospitalData } from "@/lib/or/data";
import { refreshSeoulCapacity } from "@/lib/or/nemc-capacity";
import { runTwoStagePipeline } from "@/lib/or/pipeline";
import { rankHospitals } from "@/lib/or/recommendation";
import type { HospitalCapacity, OrParameters, TranscriptCase } from "@/lib/or/types";
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
    const refreshCapacity = input.refresh_capacity !== false;
    const pipeline = await resolveOrParameters(input);
    const { data, capacityRefresh } = refreshCapacity ? await loadRequestTimeCapacityData() : { data: loadHospitalData(), capacityRefresh: null };
    const recommendations = rankHospitals({
      candidates: data.primaryCandidates,
      incidentLocation,
      orParameters: pipeline.orParameters,
      limit,
    });

    return ok({
      candidatePolicy: data.summary.candidatePolicy,
      dataSummary: data.summary,
      capacityRefresh,
      pipeline,
      recommendations,
    });
  } catch (error) {
    return apiError(error);
  }
}

async function loadRequestTimeCapacityData() {
  const serviceKey = process.env.NEMC_SERVICE_KEY;
  if (!serviceKey) throw new Error("NEMC_SERVICE_KEY is required when refresh_capacity is not false.");

  const baseData = loadHospitalData();
  const activeHospitalIds = new Set(baseData.hospitals.map((hospital) => hospital.hospital_id));
  const districts = [...new Set(baseData.hospitals.map((hospital) => hospital.district).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "ko"),
  );
  const refreshed = await refreshSeoulCapacity({
    serviceKey,
    districts,
    activeHospitalIds,
  });
  const activeRows = refreshed.rows.filter((row): row is HospitalCapacity => row.active_in_hospital_master);

  return {
    data: loadHospitalData({
      capacitySnapshot: activeRows,
      candidatePolicy: "request_time_nemc_live_capacity",
    }),
    capacityRefresh: {
      enabled: true,
      fetchedAt: refreshed.fetchedAt,
      districtsRequested: districts.length,
      liveRows: refreshed.rows.length,
      activeRows: activeRows.length,
    },
  };
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
