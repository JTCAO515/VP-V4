import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const suite = process.argv[2];
const knownSuites = new Set(["unit", "contract", "integration", "security", "e2e", "evals"]);

if (!knownSuites.has(suite)) {
  throw new Error(`Unknown CI suite: ${suite ?? "(missing)"}`);
}

const testDirectory = suite === "evals" ? "evals" : `tests/${suite}`;
const testFiles = collectTestFiles(testDirectory);
const filesToRun = testFiles.length > 0 ? testFiles : ["scripts/ci-suites/scaffold.test.mjs"];

const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", ...filesToRun], {
  env: { ...process.env, VP_CI_SUITE: suite },
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);

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
