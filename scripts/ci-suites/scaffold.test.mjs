import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

const suite = process.env.VP_CI_SUITE;
const suiteReadmes = {
  unit: "tests/unit/README.md",
  contract: "tests/contract/README.md",
  integration: "tests/integration/README.md",
  security: "tests/security/README.md",
  e2e: "tests/e2e/README.md",
};

test(`AI-07a ${suite} suite scaffold is runnable`, () => {
  if (suite === "evals") {
    for (const readme of ["evals/fixtures/README.md", "evals/qrels/README.md", "evals/runners/README.md"]) {
      assert.equal(existsSync(readme), true, `${readme} must exist`);
    }
    return;
  }

  const readme = suiteReadmes[suite];
  assert.ok(readme, `unsupported suite: ${suite ?? "(missing)"}`);
  assert.equal(existsSync(readme), true, `${readme} must exist`);
});
