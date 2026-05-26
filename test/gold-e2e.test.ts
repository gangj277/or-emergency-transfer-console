import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  assignSyntheticLocations,
  buildGoldE2eSummary,
  clampGoldE2eWorkerCount,
  runWithConcurrency,
  SEOUL_DISTRICT_ANCHORS,
} from "../lib/or/gold-e2e";

test("assignSyntheticLocations assigns deterministic Seoul locations to all 100 gold cases", () => {
  const cases = JSON.parse(fs.readFileSync("gold_dataset/gold_cases.json", "utf8"));
  const assigned = assignSyntheticLocations(cases);
  const assignedAgain = assignSyntheticLocations(cases);

  assert.equal(assigned.length, 100);
  assert.deepEqual(assigned, assignedAgain);
  assert.equal(SEOUL_DISTRICT_ANCHORS.length, 25);
  assert.equal(assigned[0].case_id, cases[0].case_id);
  assert.ok(cases[0].synthetic_location === undefined);

  const districtCounts = new Map<string, number>();
  for (const item of assigned) {
    const location = item.synthetic_location;
    assert.equal(location.location_set_version, "seoul_balanced_v1");
    assert.ok(location.lat >= 37.41 && location.lat <= 37.72);
    assert.ok(location.lon >= 126.74 && location.lon <= 127.2);
    assert.ok(location.assignment_reason.includes(item.selection.category));
    districtCounts.set(location.district, (districtCounts.get(location.district) ?? 0) + 1);
  }

  assert.equal(districtCounts.size, 25);
  assert.deepEqual([...districtCounts.values()].sort((a, b) => a - b), Array(25).fill(4));
});

test("buildGoldE2eSummary keeps LLM failures, validation failures, and no-feasible rankings separate", () => {
  const summary = buildGoldE2eSummary([
    {
      case_id: "A",
      category: "respiratory_failure_airway",
      synthetic_location: { district: "강남구", zone: "south" },
      pipeline_status: "succeeded",
      pipeline_latency_ms: 1200,
      stage1_fact_count: 6,
      stage1_missing_info_count: 1,
      stage2_parameters: {
        incident_type: "other_trauma",
        severity_level: 4,
        deterioration_risk: 5,
        vulnerability_level: 2,
        required_departments: ["emergency_medicine"],
        required_resources: ["trauma_resuscitation"],
        max_transport_time_min: 20,
        minimum_hospital_level: "local_center_or_above",
        or_notes: "test",
      },
      validation_failure_count: 0,
      validation_warning_count: 1,
      ranking_status: "succeeded",
      strict_feasible_count: 0,
      top1: null,
      nearest_feasible_top1: null,
    },
    {
      case_id: "B",
      category: "stroke_neuro_consciousness",
      synthetic_location: { district: "종로구", zone: "central" },
      pipeline_status: "failed",
      pipeline_latency_ms: 0,
      stage1_fact_count: 0,
      stage1_missing_info_count: 0,
      stage2_parameters: null,
      validation_failure_count: 1,
      validation_warning_count: 0,
      ranking_status: "skipped",
      strict_feasible_count: null,
      top1: null,
      nearest_feasible_top1: null,
    },
  ]);

  assert.equal(summary.caseCount, 2);
  assert.equal(summary.pipeline.succeeded, 1);
  assert.equal(summary.pipeline.failed, 1);
  assert.equal(summary.pipeline.validationFailureCases, 1);
  assert.equal(summary.ranking.noFeasibleCount, 1);
  assert.equal(summary.stage2.maxTransportTimeCounts["20"], 1);
  assert.equal(summary.distributions.categoryCounts.stroke_neuro_consciousness, 1);
});

test("clampGoldE2eWorkerCount keeps gold E2E parallelism bounded at 20 workers", () => {
  assert.equal(clampGoldE2eWorkerCount(undefined), 1);
  assert.equal(clampGoldE2eWorkerCount(0), 1);
  assert.equal(clampGoldE2eWorkerCount(8), 8);
  assert.equal(clampGoldE2eWorkerCount(999), 20);
});

test("runWithConcurrency respects the worker limit and preserves result order", async () => {
  let active = 0;
  let maxActive = 0;
  const completed: number[] = [];

  const results = await runWithConcurrency([1, 2, 3, 4, 5], 2, async (item) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5 * (6 - item)));
    active -= 1;
    completed.push(item);
    return item * 10;
  });

  assert.equal(maxActive, 2);
  assert.deepEqual(results, [10, 20, 30, 40, 50]);
  assert.notDeepEqual(completed, [1, 2, 3, 4, 5]);
});
