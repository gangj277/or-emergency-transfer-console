import { callStructured } from "./openrouter";
import { buildStage1UserPrompt, buildStage2UserPrompt, stage1SystemPrompt, stage2SystemPrompt } from "./prompts";
import { observationSchema, orParameterSchema } from "./schemas";
import type { OrParameters, TranscriptCase } from "./types";
import { checkIncidentConsistency, parseOrParameters, validateObservationOutput, validateOrParameterOutput } from "./validate";

export async function runTwoStagePipeline(testCase: TranscriptCase): Promise<{
  stage1: unknown;
  stage2: { case_id: string; or_parameters: OrParameters };
  validation: {
    stage1: ReturnType<typeof validateObservationOutput>;
    stage2: ReturnType<typeof validateOrParameterOutput>;
  };
}> {
  const stage1 = await callStructured({
    name: "medical_observations",
    schema: observationSchema,
    system: stage1SystemPrompt,
    user: buildStage1UserPrompt(testCase),
  });
  const stage1Validation = validateObservationOutput(stage1, testCase.case_id);
  if (!stage1Validation.valid) {
    throw new Error(`Stage 1 validation failed: ${stage1Validation.failures.join("; ")}`);
  }

  const stage2 = await callStructured({
    name: "or_parameters",
    schema: orParameterSchema,
    system: stage2SystemPrompt,
    user: buildStage2UserPrompt(stage1),
  });
  const stage2Validation = validateOrParameterOutput(stage2, testCase.case_id);
  if (!stage2Validation.valid) {
    throw new Error(`Stage 2 validation failed: ${stage2Validation.failures.join("; ")}`);
  }

  const parsed = parseOrParameters((stage2 as { or_parameters?: unknown }).or_parameters);
  if (!parsed.valid) {
    throw new Error(`Stage 2 parameter parse failed: ${parsed.failures.join("; ")}`);
  }

  // Deterministically inject any clinical minimums the LLM omitted for this
  // incident type, so ranking scores a clinically coherent param set.
  const { params: correctedParams } = checkIncidentConsistency(parsed.params);

  return {
    stage1,
    stage2: {
      case_id: testCase.case_id,
      or_parameters: correctedParams,
    },
    validation: {
      stage1: stage1Validation,
      stage2: stage2Validation,
    },
  };
}
