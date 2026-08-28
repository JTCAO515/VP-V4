import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { validateRehearsalPlan } from "../../../scripts/db/restore/rehearsal-plan.mjs";

const basePlan = {
  environment: "isolated-staging",
  rpoRto: { status: "pending-plan-region", rpo: null, rto: null },
  exercises: ["database_restore", "roll_forward_pitr", "compensation"],
  storage: {
    mode: "no-backup-ttl",
    policy: "ephemeral-media-task-lifecycle",
    deletionVerification: "required",
  },
};

test("accepts a parameter-free isolated rehearsal plan and preserves undecided RPO/RTO", () => {
  assert.deepEqual(validateRehearsalPlan(basePlan), basePlan);
});

test("rejects production, real connection details, incomplete exercises, and permanent ephemeral-media backup", () => {
  assert.throws(() => validateRehearsalPlan({ ...basePlan, environment: "production" }), /isolated-staging/);
  assert.throws(() => validateRehearsalPlan({ ...basePlan, databaseUrl: "postgres://example" }), /connection detail/);
  assert.throws(() => validateRehearsalPlan({ ...basePlan, exercises: ["database_restore"] }), /three separate exercises/);
  assert.throws(() => validateRehearsalPlan({ ...basePlan, storage: { mode: "s3-compatible-backup", policy: "ephemeral-media-task-lifecycle", deletionVerification: "required" } }), /ephemeral/);
});

test("rejects invented RPO/RTO before plan and region are accepted", () => {
  assert.throws(() => validateRehearsalPlan({ ...basePlan, rpoRto: { status: "pending-plan-region", rpo: "24h", rto: null } }), /RPO\/RTO/);
});

test("rejects undeclared nested configuration instead of silently accepting an execution option", () => {
  assert.throws(() => validateRehearsalPlan({ ...basePlan, storage: { ...basePlan.storage, unexpectedExecutionOption: "enabled" } }), /unexpected field/);
});

test("rejects connection details hidden in an S3 backup policy field", () => {
  assert.throws(() => validateRehearsalPlan({
    ...basePlan,
    storage: {
      mode: "s3-compatible-backup",
      policy: "postgres://user:secret@production.example/db",
      retention: "policy-bound",
      deletionVerification: "required",
    },
  }), /policy authority/);
});

test("rejects every S3 backup choice until an authoritative storage-policy registry exists", () => {
  assert.throws(() => validateRehearsalPlan({
    ...basePlan,
    storage: {
      mode: "s3-compatible-backup",
      policy: "policy:durable-backup",
      retention: "policy-bound",
      deletionVerification: "required",
    },
  }), /policy authority/);
});

test("CLI validates the committed parameter-free plan", () => {
  const result = spawnSync(process.execPath, ["scripts/db/restore/rehearsal-plan.mjs", "--plan", "tests/integration/restore/fixtures/parameter-free-rehearsal-plan.json"], { encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /validated-parameter-free-rehearsal-plan/);
});
