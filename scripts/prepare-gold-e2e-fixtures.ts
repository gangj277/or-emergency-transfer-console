import fs from "node:fs";
import path from "node:path";

import {
  assertSyntheticLocationCoverage,
  assignSyntheticLocations,
  summarizeLocationCoverage,
  type GoldCase,
} from "../lib/or/gold-e2e";

function main() {
  const args = parseArgs(process.argv.slice(2));
  const runId = args.runId ?? createRunId();
  const outDir = path.resolve("outputs/gold-e2e", runId);
  const inputDir = path.join(outDir, "inputs");
  fs.mkdirSync(inputDir, { recursive: true });

  const sourcePath = path.resolve(args.source ?? "gold_dataset/gold_cases.json");
  const cases = JSON.parse(fs.readFileSync(sourcePath, "utf8")) as GoldCase[];
  const assigned = assignSyntheticLocations(cases);
  const coverageFailures = assertSyntheticLocationCoverage(assigned);
  if (coverageFailures.length > 0) {
    throw new Error(`Synthetic location coverage failed: ${coverageFailures.join("; ")}`);
  }

  const coverage = summarizeLocationCoverage(assigned);
  const outputPath = path.join(inputDir, "gold_cases_with_synthetic_locations.json");
  fs.writeFileSync(outputPath, `${JSON.stringify(assigned, null, 2)}\n`);
  fs.writeFileSync(path.join(inputDir, "location-coverage.json"), `${JSON.stringify(coverage, null, 2)}\n`);
  fs.writeFileSync(
    path.join(inputDir, "manifest.json"),
    `${JSON.stringify(
      {
        runId,
        generatedAt: new Date().toISOString(),
        sourcePath,
        outputPath,
        locationSetVersion: coverage.locationSetVersion,
        caseCount: assigned.length,
        note: "Synthetic Seoul coordinates for OR ranking experiments; source addresses are not used.",
      },
      null,
      2,
    )}\n`,
  );

  updateLatest(outDir);
  console.log(JSON.stringify({ runId, outputPath, coverage }, null, 2));
}

function parseArgs(argv: string[]) {
  const args: { runId?: string; source?: string } = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--run-id") args.runId = argv[++i];
    else if (argv[i] === "--source") args.source = argv[++i];
  }
  return args;
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

main();
