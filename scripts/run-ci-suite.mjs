import { spawnSync } from "node:child_process";

const suite = process.argv[2];
const knownSuites = new Set(["unit", "contract", "integration", "security", "e2e", "evals"]);

if (!knownSuites.has(suite)) {
  throw new Error(`Unknown CI suite: ${suite ?? "(missing)"}`);
}

const result = spawnSync(process.execPath, ["--test", "scripts/ci-suites/scaffold.test.mjs"], {
  env: { ...process.env, VP_CI_SUITE: suite },
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
