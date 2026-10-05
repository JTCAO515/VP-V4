import { spawnSync } from "node:child_process";
import { appendFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const suite = process.argv[2];
const knownSuites = new Set(["unit", "contract", "integration", "security", "e2e", "evals"]);

if (!knownSuites.has(suite)) {
  throw new Error(`Unknown CI suite: ${suite ?? "(missing)"}`);
}

const testDirectory = suite === "evals" ? "evals" : `tests/${suite}`;
const testFiles = collectTestFiles(testDirectory);
const filesToRun = testFiles.length > 0 ? testFiles : ["scripts/ci-suites/scaffold.test.mjs"];

const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", "--test-reporter=tap", ...filesToRun], {
  env: { ...process.env, VP_CI_SUITE: suite },
  encoding: "utf8",
});

await writeOutput(process.stdout, result.stdout);
await writeOutput(process.stderr, result.stderr);
if (result.error) throw result.error;
if (result.signal) console.error(`VP_CI_SUITE_CHILD_SIGNAL ${result.signal}`);

const reporterOutput = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
const skipped = Number(/^# skipped (\d+)$/m.exec(reporterOutput)?.[1] ?? 0);
const outcome = result.status === 0 ? (skipped === 0 ? "passed" : "incomplete") : "failed";
const summary = { suite, outcome, skipped, testFiles: testFiles.length };

console.log(`VP_CI_SUITE_RESULT ${JSON.stringify(summary)}`);

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `| ${suite} | ${outcome} | ${skipped} | ${testFiles.length} |\n`);
}

// Let pending stdout/stderr writes drain; preserve the actual child outcome.
process.exitCode = result.status ?? 1;

function writeOutput(stream, value) {
  if (!value) return Promise.resolve();
  return new Promise((resolve, reject) => stream.write(value, error => error ? reject(error) : resolve()));
}

function collectTestFiles(directory) {
  const files = [];

  try {
    for (const entry of readdirSync(directory, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || !/\.test\.(?:mjs|js|ts)$/.test(entry.name)) continue;
      files.push(join(entry.parentPath, entry.name));
    }
  } catch (error) {
    if (error && error.code === "ENOENT") return files;
    throw error;
  }

  return files.sort();
}
