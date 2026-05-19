import { apiError, ok } from "@/lib/or/api";
import { runTwoStagePipeline } from "@/lib/or/pipeline";
import type { TranscriptCase } from "@/lib/or/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const testCase = parseTranscriptCase(await request.json());
    const result = await runTwoStagePipeline(testCase);
    return ok(result);
  } catch (error) {
    return apiError(error);
  }
}

function parseTranscriptCase(value: unknown): TranscriptCase {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("JSON body with case_id, title, transcript is required.");
  }
  const body = value as Record<string, unknown>;
  const case_id = typeof body.case_id === "string" && body.case_id.trim() ? body.case_id : `CASE-${Date.now()}`;
  const title = typeof body.title === "string" && body.title.trim() ? body.title : "Untitled emergency transcript";
  if (typeof body.transcript !== "string" || !body.transcript.trim()) {
    throw new Error("transcript must be a non-empty string.");
  }
  return {
    case_id,
    title,
    transcript: body.transcript,
  };
}
