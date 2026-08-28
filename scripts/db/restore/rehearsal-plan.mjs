import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const requiredExercises = new Set(["database_restore", "roll_forward_pitr", "compensation"]);
const allowedTopLevelKeys = new Set(["environment", "rpoRto", "exercises", "storage"]);
const allowedRpoRtoKeys = new Set(["status", "rpo", "rto"]);
const allowedNoBackupStorageKeys = new Set(["mode", "policy", "deletionVerification"]);
const allowedS3StorageKeys = new Set(["mode", "policy", "deletionVerification", "retention"]);
const prohibitedField = /(?:url|uri|host|password|token|secret|(?:^|_)key$|credential|connection)/i;

export function validateRehearsalPlan(plan) {
  assertPlainObject(plan, "plan");
  rejectConnectionDetails(plan);
  rejectUnexpectedKeys(plan, allowedTopLevelKeys, "plan");

  if (plan.environment !== "isolated-staging") {
    throw new Error("restore rehearsal environment must be isolated-staging");
  }

  assertPlainObject(plan.rpoRto, "rpoRto");
  rejectUnexpectedKeys(plan.rpoRto, allowedRpoRtoKeys, "rpoRto");
  if (plan.rpoRto.status !== "pending-plan-region" || plan.rpoRto.rpo !== null || plan.rpoRto.rto !== null) {
    throw new Error("RPO/RTO must remain null until plan and region are accepted");
  }

  if (!Array.isArray(plan.exercises) || plan.exercises.length !== requiredExercises.size || new Set(plan.exercises).size !== requiredExercises.size || plan.exercises.some((exercise) => !requiredExercises.has(exercise))) {
    throw new Error("restore plan must declare all three separate exercises");
  }

  assertPlainObject(plan.storage, "storage");
  rejectUnexpectedKeys(plan.storage, plan.storage.mode === "s3-compatible-backup" ? allowedS3StorageKeys : allowedNoBackupStorageKeys, "storage");
  if (plan.storage.deletionVerification !== "required") {
    throw new Error("storage plan must require deletion verification");
  }

  if (plan.storage.mode === "no-backup-ttl") {
    if (plan.storage.policy !== "ephemeral-media-task-lifecycle") {
      throw new Error("no-backup storage plan must bind ephemeral media to the task-lifecycle policy");
    }
  } else if (plan.storage.mode === "s3-compatible-backup") {
    throw new Error("S3-compatible backup for ephemeral media is blocked until an authoritative storage-policy authority exists");
  } else {
    throw new Error("storage mode must be no-backup-ttl or s3-compatible-backup");
  }

  return structuredClone(plan);
}

async function main() {
  const planPath = readPlanPath(process.argv.slice(2));
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  const validated = validateRehearsalPlan(plan);
  console.log(JSON.stringify({ status: "validated-parameter-free-rehearsal-plan", environment: validated.environment, exercises: validated.exercises, storage: validated.storage.mode }));
}

function readPlanPath(args) {
  if (args.length !== 2 || args[0] !== "--plan") {
    throw new Error("Usage: node scripts/db/restore/rehearsal-plan.mjs --plan <parameter-free-plan.json>");
  }
  return args[1];
}

function assertPlainObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} must be an object`);
}

function rejectUnexpectedKeys(value, allowedKeys, name) {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) throw new Error(`${name} has an unexpected field: ${key}`);
  }
}

function rejectConnectionDetails(value) {
  for (const [key, nested] of Object.entries(value)) {
    if (prohibitedField.test(key)) throw new Error(`connection detail is forbidden in a committed rehearsal plan: ${key}`);
    if (nested && typeof nested === "object") rejectConnectionDetails(nested);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
