/**
 * Unified database integration runner (one convention for every gated integration test).
 *
 *   node scripts/ci-suites/db-integration.mjs --list      (classification of every integration test file)
 *   node scripts/ci-suites/db-integration.mjs --images    (pinned images the tests start with --pull=never)
 *   node scripts/ci-suites/db-integration.mjs --lane postgres [--lane supabase-rls ...]
 *   node scripts/ci-suites/db-integration.mjs --lane all
 *
 * Every file under tests/integration is classified exactly once in LANES / EXCLUDED below: it either
 * runs unconditionally in `pnpm test:integration`, belongs to a lane here, or is on the explicit
 * EXCLUDED allowlist with a reason. An unclassified test file fails the run, so a new gated test
 * cannot silently stay out of CI.
 *
 * A lane passes only when every node:test run inside it exits 0 with tests > 0 and
 * skipped = todo = cancelled = fail = 0. The per-test opt-in switches (VP_*_DB_TEST, ...) remain
 * the tests' own safety gate; this runner is the single place that sets them, only against
 * disposable local Docker targets it starts (or that the existing disposable runners start).
 */
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import net from "node:net";
import { pathToFileURL } from "node:url";

const repo = resolve(import.meta.dirname, "../..");
const supabaseCLI = process.env.VP_SUPABASE_CLI || "supabase";
const SUPABASE_EXCLUDED_SERVICES = "realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor";
/** Every pinned image any integration test or helper starts with `--pull=never` (scanned, never guessed). */
export function pinnedImages() {
  const images = new Set();
  for (const entry of readdirSync(join(repo, "tests/integration"), { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !/\.m?[jt]s$/.test(entry.name)) continue;
    for (const match of readFileSync(join(entry.parentPath, entry.name), "utf8").matchAll(/public\.ecr\.aws\/supabase\/[a-z-]+:[A-Za-z0-9._-]+/g)) images.add(match[0]);
  }
  return [...images].sort();
}

const node = (...args) => [process.execPath, "--experimental-strip-types", ...args];

/** Lane → ordered steps. Each step is one node:test invocation (direct, or via an existing disposable runner). */
export const LANES = {
  // Self-contained: each test starts its own network-disabled pinned PostgreSQL container.
  postgres: {
    needs: ["docker", "images"],
    steps: [
      {
        name: "isolated-postgres",
        env: {
          VP_BUDGET_DB_TEST: "1",
          VP_TURN_DB_TEST: "1",
          VP_OPS_DB_TEST: "1",
          VP_COMMUNITY_DB_TEST: "1",
          VP_COMMUNITY_TS_WIRE_ROOT: repo,
          VP_COMMUNITY_SAFETY_DB_TEST: "1",
          VP_COMMUNITY_SAFETY_TS_WIRE_ROOT: repo,
          VP_COMMUNITY_PUBLICATION_DB_TEST: "1",
          VP_COMMUNITY_PUBLICATION_TS_WIRE_ROOT: repo,
          VP_PRIVACY_DB_TEST: "1",
          VP_COVERAGE_DB_TEST: "1",
          VP_MATERIAL_DB_TEST: "1",
          VP_NOTIFICATION_EXIT_DB_TEST: "1",
          VP_COVERAGE_PROGRESS_DB_TEST: "1",
          VP_ARCHIVE_DATA_DB_TEST: "1",
          VP_CONVERSATION_SOURCE_AUDIT: "1",
          VP_PROFILE_DATA_SQL: "1",
          VP_PROFILE_EXPORT_SQL: "1",
          VP_MATERIAL_TS_WIRE_ROOT: repo,
          VP_TRANSLATION_HISTORY_DB_TEST: "1",
          VP_ARCHIVE_DB_TEST: "1",
          VP_REMINDER_DB_TEST: "1",
          VP_NOTICE_DB_TEST: "1",
          VP_NOTICE_TS_ROOT: repo,
          VP_KNOWLEDGE_QUESTION_DB_TEST: "1",
          VP_GROUNDED_TURN_DB_TEST: "1",
          VP_INTAKE_POSTGRES: "1",
          VP_PLACE_QUOTA_DB_TEST: "1",
          VP_TRAFFIC_DB_TEST: "1",
          VP_MEMORY_DB_TEST: "1",
          VP_PLACE_ACTION_DB_TEST: "1",
          VP_SERVICE_OPERATIONS_DB_TEST: "1",
          VP_TRAVELER_BRIEF_DB_TEST: "1",
        },
        files: [
          "tests/integration/community/review.test.mjs",
          "tests/integration/community/submission-j1-postgres.test.mjs",
          "tests/integration/community/safety-j2-postgres.test.mjs",
          "tests/integration/community/frontier-lock-postgres.test.mjs",
          "tests/integration/community/publication-j3j4-postgres.test.mjs",
          "tests/integration/cost/durable-budget.test.mjs",
          "tests/integration/intake/intake.test.mjs",
          "tests/integration/knowledge/grounded-turn.test.mjs",
          "tests/integration/guide/place-guide-postgres.test.mjs",
          "tests/integration/knowledge/question.test.mjs",
          "tests/integration/maps/place-quota.test.mjs",
          "tests/integration/maps/foreground-traffic-postgres.test.mjs",
          "tests/integration/explore/place-actions-postgres.test.mjs",
          "tests/integration/scoped-edit/scoped-edit-postgres.test.mjs",
          "tests/integration/memory/travel-pace.test.mjs",
          "tests/integration/notifications/storage.test.mjs",
          "tests/integration/notifications/delivery-postgres.test.mjs",
          "tests/integration/observability/ops-ledger.test.mjs",
          "tests/integration/privacy/assistant-data-rights.test.mjs",
          "tests/integration/privacy/result-data-rights.test.mjs",
          "tests/integration/takedown/source-impact-outbox.test.mjs",
          "tests/integration/privacy/trip-deletion.test.mjs",
          "tests/integration/privacy/linked-trip-delete-d3.test.mjs",
          "tests/integration/privacy/core-export-d2.test.mjs",
          "tests/integration/privacy/core-export-consumer.test.mjs",
          "tests/integration/privacy/memory-delete-d4.test.mjs",
          "tests/integration/privacy/memory-export-d4.test.mjs",
          "tests/integration/privacy/memory-export-consumer-d4.test.mjs",
          "tests/integration/privacy/entitlement-export-d5.test.mjs",
          "tests/integration/privacy/owner-module-export-postgres.test.mjs",
          "tests/integration/privacy/material-reference-data-postgres.test.mjs",
          "tests/integration/privacy/notification-data-postgres.test.mjs",
          "tests/integration/privacy/coverage-progress-sql/postgres.test.mjs",
          "tests/integration/privacy/archive-data-sql/postgres.test.mjs",
          "tests/integration/privacy/conversation-data-sql/source-audit.test.mjs",
          "tests/integration/privacy/conversation-data-sql/guide-invalidation-compat.test.mjs",
          "tests/integration/privacy/result-data-sql/postgres.test.mjs",
          "tests/integration/privacy/profile-data-sql/profile.test.mjs",
          "tests/integration/privacy/profile-data-sql/result-compatibility.test.mjs",
          "tests/integration/privacy/profile-export/canonical-postgres.test.mjs",
          "tests/integration/privacy/profile-export-sql/postgres.test.mjs",
          "tests/integration/translate/history.test.mjs",
          "tests/integration/trip/archive.test.mjs",
          "tests/integration/trip/lifecycle-postgres.test.mjs",
          "tests/integration/trip/trip-item-support.test.mjs",
          "tests/integration/trip/native-support-http-read.test.mjs",
          "tests/integration/trip/local-recovery-guard.test.mjs",
          "tests/integration/trip/local-recovery-transport.test.mjs",
          "tests/integration/trip/recovery-http-joint.test.mjs",
          "tests/integration/readiness/declarations-postgres.test.mjs",
          "tests/integration/readiness/native-readiness-actions-joint.test.mjs",
          "tests/integration/lodging/native-classification-context-joint.test.mjs",
          "tests/integration/lodging/reviewed-classification-postgres.test.mjs",
          "tests/integration/reservations/ledger-postgres.test.mjs",
          "tests/integration/reservations/native-return-joint.test.mjs",
          "tests/integration/service-cases/operations-postgres.test.mjs",
          "tests/integration/service-cases/brief-postgres.test.mjs",
          "tests/integration/pdf-intake/pdf-intake-postgres.test.mjs",
          "tests/integration/trip/offline-text-provenance.test.mjs",
          "tests/integration/trip/offline-source-consumer.test.mjs",
          "tests/integration/turn/durable-work.test.mjs",
          "tests/integration/turn/five-result-lifecycle.test.mjs",
          "tests/integration/turn/selected-source-result-v2-compat.test.mjs",
          "tests/integration/turn/hosted-worker.test.mjs",
          "tests/integration/turn/hosted-planning-worker.test.mjs",
          "tests/integration/turn/planning-action-receipts.test.mjs",
          "tests/integration/turn/planning-comparison.test.mjs",
          "tests/integration/turn/planning-intake-admission.test.mjs",
          "tests/integration/turn/planning-v2-durable-checkpoints.test.mjs",
          "tests/integration/turn/planning-v2-complete-worker-sql.test.mjs",
          "tests/integration/turn/planning-v2-model-attempt-binding.test.mjs",
          "tests/integration/turn/planning-v2-canonical-sql-consumer.test.mjs",
          "tests/integration/turn/planning-v2-model-local-journal.test.mjs",
          "tests/integration/turn/selected-message-sources.test.mjs",
          "tests/integration/turn/native-memory-command.test.mjs",
          "tests/integration/turn/planning-v2-local-model-flow.test.mjs",
          "tests/integration/turn/planning-v2-real-journal-consumer.test.mjs",
          "tests/integration/turn/planning-v2-worker-protocol.test.mjs",
          "tests/integration/turn/qualified-intake-comparison.test.mjs",
          "tests/integration/turn/text-work.test.mjs",
        ],
      },
      { name: "journeys-pages", env: { VP_TURN_DB_TEST: "1" }, files: ["tests/integration/turn/journeys-pages.test.mjs"] },
      { name: "journeys-goal-index", env: { VP_TURN_DB_TEST: "1" }, files: ["tests/integration/turn/journeys-goal-index.test.mjs"] },
    ],
  },
  // Native (non-Docker) PostgreSQL binaries + the `pg` client module, supplied by the caller.
  "postgres-native": {
    needs: ["VP_WIKI_PG_BIN", "VP_WIKI_PG_MODULE"],
    steps: [{ name: "wiki-native-postgres", env: {}, files: ["tests/integration/knowledge/wiki-draft.test.mjs"] }],
  },
  // One disposable Supabase stack (GoTrue + PostgREST + all migrations); identity/RLS/Trip confirmation chain.
  // Migration 28 (VPJ-05) makes the database reject legacy confirmation digests, so against the full
  // migration set only the v2 Trip protocol is a meaningful target (docs/contracts/vpj-05.md).
  "supabase-rls": {
    needs: ["docker", "supabase"],
    stack: { portBase: 57400 },
    steps: [
      {
        name: "identity-rls-trip-protocol-v2",
        concurrency: 1,
        env: { VISEPANDA_TRIP_PROTOCOL_V2: "true" },
        files: [
          "tests/integration/identity/function-acl.test.mjs",
          "tests/integration/identity/pending-proposal-read.test.mjs",
          "tests/integration/identity/profile-privacy-rpc.test.mjs",
          "tests/integration/memory/create-undo.test.mjs",
          "tests/integration/privacy/trip-deletion-live.test.mjs",
          "tests/integration/entitlements/storekit-ledger.test.mjs",
          "tests/integration/trip/confirm-apply.test.mjs",
          "tests/integration/trip/proposal-reject.test.mjs",
          "tests/integration/trip/proposal-revision.test.mjs",
          "tests/integration/trip/v4-10-rollback.test.mjs",
          "tests/integration/trip/v4-11-place-reference.test.mjs",
          "tests/integration/trip/v4-12-trip-actions.test.mjs",
          "tests/integration/turn/durable-thread.test.mjs",
        ],
      },
    ],
  },
  // Real Auth → Next.js HTTP routes → PostgreSQL. Each existing runner owns a separate disposable stack.
  "supabase-http-native": {
    needs: ["docker", "supabase"],
    steps: [
      { name: "change-proposal-reference", runner: node("tests/integration/artifacts/run-change-proposal-reference.mjs", "--port-base", "63420"), files: ["tests/integration/artifacts/change-proposal-reference.test.mjs"] },
      { name: "trip-proposal-reference-discovery", runner: node("tests/integration/artifacts/run-change-proposal-reference.mjs", "--discovery", "--port-base", "63420"), files: ["tests/integration/artifacts/trip-proposal-reference-discovery.test.mjs"] },
      { name: "native-local-session", runner: node("tests/integration/identity/run-native-io.mjs"), files: ["tests/integration/identity/native-local-session.test.mjs"] },
      { name: "trip-lifecycle-http", runner: node("tests/integration/trip/run-lifecycle-http.mjs", "--port-base", "64600"), files: ["tests/integration/trip/lifecycle-http.test.mjs"] },
      { name: "native-same-trip", runner: node("tests/integration/identity/run-native-io.mjs", "--same-trip"), files: ["tests/integration/trip/native-same-trip.test.mjs"] },
      { name: "native-text-http", runner: node("tests/integration/turn/run-native-http.mjs", "--port-base", "64420"), files: ["tests/integration/turn/native-text-http.test.mjs"] },
      { name: "translation-history-http", runner: node("tests/integration/turn/run-native-http.mjs", "--translation-history", "--port-base", "64420"), files: ["tests/integration/translate/history-http.test.mjs"] },
      { name: "translation-trip-source-http", runner: node("tests/integration/translate/run-trip-source-http.mjs", "--port-base", "64460"), files: ["tests/integration/translate/trip-source-http.test.mjs"] },
      { name: "service-operations-http", runner: node("tests/integration/service-cases/run-operations-http.mjs", "--port-base", "64800"), files: ["tests/integration/service-cases/operations-http.test.mjs"] },
      { name: "traveler-brief-http", runner: node("tests/integration/service-cases/run-brief-http.mjs", "--port-base", "64900"), files: ["tests/integration/service-cases/brief-http.test.mjs"] },
      { name: "data-coverage-http", runner: node("tests/integration/privacy/coverage/run-http.mjs", "--port-base", "63400"), files: ["tests/integration/privacy/coverage/auth-http.test.mjs"] },
      { name: "material-reference-http", runner: node("tests/integration/privacy/material-references/run-http.mjs", "--port-base", "63360"), files: ["tests/integration/privacy/material-references/auth-http.test.mjs"] },
      { name: "notification-data-http", runner: node("tests/integration/privacy/notification-data/run-http.mjs", "--port-base", "63320"), files: ["tests/integration/privacy/notification-data/auth-http.test.mjs"] },
      { name: "archive-data-http", runner: node("tests/integration/privacy/archive-data/run-http.mjs", "--port-base", "63240"), files: ["tests/integration/privacy/archive-data/auth-http.test.mjs"] },
      { name: "conversation-data-http", runner: node("tests/integration/privacy/conversation-data/run-http.mjs", "--port-base", "63120"), files: ["tests/integration/privacy/conversation-data/auth-http.test.mjs"] },
      { name: "coverage-progress-http", runner: node("tests/integration/privacy/coverage-progress/run-http.mjs", "--port-base", "63280"), files: ["tests/integration/privacy/coverage-progress/auth-http.test.mjs"] },
      { name: "pdf-intake-http", runner: node("tests/integration/intake/run-pdf-intake-http.mjs", "--port-base", "65000"), files: ["tests/integration/intake/pdf-intake-http.test.mjs"] },
      { name: "community-j1-jwt", runner: node("tests/integration/community/run-submission-j1-jwt.mjs"), files: ["tests/integration/community/submission-j1-jwt.test.mjs"] },
      { name: "community-j1-http", runner: node("tests/integration/community/run-j1-http.mjs", "--port-base", "64200"), files: ["tests/integration/community/j1-http.test.mjs"] },
      { name: "community-safety-http", runner: node("tests/integration/community/safety/run-http.mjs", "--port-base", "64100"), files: ["tests/integration/community/safety/http.test.mjs"] },
      { name: "community-publication-http", runner: node("tests/integration/community/publication/run-http.mjs", "--port-base", "64000"), files: ["tests/integration/community/publication/http.test.mjs"] },
      { name: "place-guide-http", runner: node("tests/integration/guide/run-guide-http.mjs", "--port-base", "64500"), files: ["tests/integration/guide/guide-http.test.mjs"] },
      { name: "native-assistant-rollback", runner: node("tests/integration/turn/run-native-http.mjs", "--assistant-rollback", "--port-base", "64420"), files: ["tests/integration/turn/assistant-rollback.test.mjs", "tests/integration/turn/assistant-task-activity.test.mjs"] },
      { name: "native-planning-http", runner: node("tests/integration/turn/run-native-http.mjs", "--planning", "--port-base", "64420"), files: ["tests/integration/turn/native-planning-http.test.mjs"] },
      { name: "native-grounded-http", runner: node("tests/integration/turn/run-native-http.mjs", "--grounded", "--port-base", "64420"), files: ["tests/integration/turn/native-grounded-http.test.mjs"] },
      { name: "journeys-goal-index-http", runner: node("tests/integration/turn/run-journeys-goal-index-http.mjs"), files: ["tests/integration/turn/journeys-goal-index-http.test.mjs"] },
      { name: "web-trip-continuity", runner: node("tests/integration/web-trip-continuity/run.mjs"), files: ["tests/integration/web-trip-continuity/continuity.test.mjs"] },
      { name: "explicit-travel-intake", runner: node("tests/integration/turn/run-explicit-travel-intake.mjs"), files: ["tests/integration/turn/explicit-travel-intake.test.mjs"] },
      { name: "native-memory-http", runner: node("tests/integration/turn/run-native-memory-http.mjs"), files: ["tests/integration/turn/native-memory-http.test.mjs"] },
      { name: "selected-source-auth-http", runner: node("tests/integration/turn/run-selected-source-auth-http.mjs"), files: ["tests/integration/turn/selected-source-auth-http.test.mjs"] },
      { name: "planning-intake-http", runner: node("tests/integration/turn/run-planning-intake-http.mjs"), files: ["tests/integration/turn/planning-intake-http.test.mjs"] },
      { name: "result-data-http", runner: node("tests/integration/privacy/result-data/run-http.mjs", "--port-base", "63080"), files: ["tests/integration/privacy/result-data/auth-http.test.mjs"] },
      { name: "profile-data-http", runner: node("tests/integration/privacy/profile-data/run-http.mjs", "--port-base", "63040"), files: ["tests/integration/privacy/profile-data/auth-http.test.mjs"] },
      { name: "profile-export-http", runner: node("tests/integration/privacy/profile-export/run-http.mjs", "--port-base", "63000"), files: ["tests/integration/privacy/profile-export/auth-http.test.mjs"] },
      { name: "turn-data-http", runner: node("tests/integration/privacy/turn-data/run-http.mjs", "--port-base", "62960"), files: ["tests/integration/privacy/turn-data/auth-http.test.mjs"] },
    ],
  },
  "supabase-http-ops": {
    needs: ["docker", "supabase"],
    steps: [
      { name: "ops-local-review", runner: node("tests/integration/ops/run-local.mjs"), env: { VP_OPS_TEST_FILE: "tests/integration/ops/local-review.test.mjs" }, files: ["tests/integration/ops/local-review.test.mjs"] },
      { name: "knowledge-publication", runner: node("tests/integration/ops/run-local.mjs"), env: { VP_OPS_TEST_FILE: "tests/integration/knowledge/publication.test.mjs" }, files: ["tests/integration/knowledge/publication.test.mjs"] },
      {
        name: "knowledge-private-source-34-to-35",
        runner: node("tests/integration/ops/run-local.mjs"),
        env: { VP_OPS_TEST_FILE: "tests/integration/knowledge/private-source.test.mjs", VP_OPS_BEFORE_MIGRATION: "20260910213151_vpj_15_private_source_assertion.sql" },
        files: ["tests/integration/knowledge/private-source.test.mjs"],
      },
      { name: "service-case-access", runner: node("tests/integration/service-cases/run-local.mjs"), files: ["tests/integration/service-cases/access.test.mjs"] },
    ],
  },
};

/** CI execution partitions only; logical classification and manual lanes stay intact. */
export function executionMatrix(lanes) {
  if (!Array.isArray(lanes) || lanes.length === 0 || new Set(lanes).size !== lanes.length
    || lanes.some(lane => lane !== "none" && !Object.hasOwn(LANES, lane))
    || lanes.includes("none") && lanes.length !== 1) throw Error("Invalid selected DB lanes");
  return { include: lanes.flatMap(lane => {
    const count = lane === "supabase-http-native" ? 2 : 1;
    return Array.from({ length: count }, (_, i) => ({ lane, shard: `${i + 1}/${count}`,
      name: count === 1 ? `lane (${lane})` : `lane (${lane} / ${i + 1} of ${count})` }));
  }) };
}
export function executionSteps(lane, shard = null) {
  if (!Object.hasOwn(LANES, lane)) throw Error("Unknown DB lane");
  const steps = LANES[lane].steps;
  if (shard === null) return steps;
  const count = lane === "supabase-http-native" ? 2 : 1;
  const match = /^([12])\/([12])$/.exec(shard);
  if (!match || Number(match[2]) !== count || Number(match[1]) > count)
    throw Error("Invalid DB lane shard");
  const selected = steps.filter((_, i) => i % count === Number(match[1]) - 1);
  if (!selected.length) throw Error("Empty DB lane shard");
  return selected;
}

/** Explicit allowlist: gated files that CI does not run, with the reason. Keep this list short. */
export const EXCLUDED = {
  "tests/integration/cost/full-supabase-budget.test.mjs":
    "Historical one-off 25→26 upgrade rehearsal: needs an operator-prepared Supabase workdir frozen at migration 25 (VP_BUDGET_SUPABASE_WORKDIR) and hard-codes that container; the budget schema itself is covered by cost/durable-budget in the postgres lane.",
};

const INTEGRATION_ROOT = "tests/integration";

export function listIntegrationTestFiles() {
  const files = [];
  for (const entry of readdirSync(join(repo, INTEGRATION_ROOT), { recursive: true, withFileTypes: true })) {
    if (entry.isFile() && /\.test\.(?:mjs|js|ts)$/.test(entry.name)) files.push(relative(repo, join(entry.parentPath, entry.name)));
  }
  return files.sort();
}

/** A file is "gated" when it can skip itself for lack of an explicit environment switch or target. */
export function isGated(file) {
  const source = readFileSync(join(repo, file), "utf8");
  return /\bskip\s*:|\bt\.skip\(/.test(source);
}

export function classify() {
  const laneOf = new Map();
  const problems = [];
  for (const [lane, { steps }] of Object.entries(LANES)) {
    for (const step of steps) {
      for (const file of step.files) {
        if (laneOf.has(file) && laneOf.get(file) !== lane) problems.push(`${file} is in lanes ${laneOf.get(file)} and ${lane}`);
        laneOf.set(file, lane);
      }
    }
  }
  const all = listIntegrationTestFiles();
  const rows = all.map((file) => {
    const gated = isGated(file);
    if (EXCLUDED[file]) {
      if (laneOf.has(file)) problems.push(`${file} is both excluded and in lane ${laneOf.get(file)}`);
      return { file, gated, lane: "excluded", reason: EXCLUDED[file] };
    }
    if (laneOf.has(file)) return { file, gated, lane: laneOf.get(file) };
    if (gated) problems.push(`${file} can skip itself but is neither in a db-integration lane nor in EXCLUDED`);
    return { file, gated, lane: "test:integration" };
  });
  for (const file of [...laneOf.keys(), ...Object.keys(EXCLUDED)]) if (!all.includes(file)) problems.push(`${file} is registered but does not exist`);
  return { rows, problems };
}

export function parseNodeTestSummary(output) {
  // node:test prints one summary per invocation: TAP (`# pass 3`) or spec (`ℹ pass 3`).
  const totals = { tests: 0, pass: 0, fail: 0, cancelled: 0, skipped: 0, todo: 0, runs: 0 };
  for (const match of output.matchAll(/^(?:#|ℹ) (tests|pass|fail|cancelled|skipped|todo) (\d+)\s*$/gm)) {
    totals[match[1]] += Number(match[2]);
    if (match[1] === "tests") totals.runs += 1;
  }
  return totals;
}

/** The lane policy: a clean exit is not enough — any skip/todo/cancel or a missing summary fails. */
export function stepProblems(code, totals) {
  const problems = [];
  if (code !== 0) problems.push(`exit ${code}`);
  if (totals.runs === 0 || totals.tests === 0) problems.push("no node:test summary / zero tests");
  for (const key of ["fail", "cancelled", "skipped", "todo"]) if (totals[key] > 0) problems.push(`${key}=${totals[key]}`);
  return problems;
}

function tee(command, args, env) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: repo, env, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => { process.stdout.write(chunk); output += chunk; });
    child.stderr.on("data", (chunk) => { process.stderr.write(chunk); output += chunk; });
    child.once("error", reject);
    child.once("exit", (code, signal) => resolvePromise({ code: code ?? (signal ? 1 : 0), output }));
  });
}

function quiet(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: repo, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => { output = (output + chunk).slice(-16384); });
    child.once("error", reject);
    child.once("exit", (code) => resolvePromise({ code: code ?? 1, output }));
  });
}

function preflight(lane, needs) {
  for (const need of needs) {
    if (need === "docker" && spawnSync("docker", ["info"], { stdio: "ignore" }).status !== 0) throw new Error(`[${lane}] Docker daemon is required`);
    if (need === "supabase" && spawnSync(supabaseCLI, ["--version"], { stdio: "ignore" }).status !== 0) throw new Error(`[${lane}] Supabase CLI is required (VP_SUPABASE_CLI or PATH)`);
    if (need.startsWith("VP_") && !process.env[need]) throw new Error(`[${lane}] ${need} must be set (see tests/integration/README.md)`);
  }
  if (needs.includes("images")) {
    for (const image of pinnedImages()) {
      if (spawnSync("docker", ["image", "inspect", image], { stdio: "ignore" }).status !== 0) {
        throw new Error(`[${lane}] pinned image ${image} is not present locally; tests use --pull=never. Run: docker pull ${image}`);
      }
    }
  }
}

async function assertPortsFree(base) {
  for (const offset of [20, 21, 22, 23, 24, 27, 29]) {
    await new Promise((ok, fail) => {
      const socket = net.createServer();
      socket.once("error", () => fail(new Error(`Disposable test port ${base + offset} unavailable`)));
      socket.listen(base + offset, "127.0.0.1", () => socket.close(ok));
    });
  }
}

/** Starts one uniquely named disposable Supabase stack with every migration applied; never touches another project. */
export async function startDisposableStack(base) {
  await assertPortsFree(base);
  const target = mkdtempSync(join(tmpdir(), "vp-db-integration-"));
  const project = "vp-db-ci-" + randomUUID().slice(0, 8);
  mkdirSync(join(target, "supabase"));
  let config = readFileSync(join(repo, "supabase/config.toml"), "utf8").replace(/^project_id\s*=.*$/m, `project_id = "${project}"`);
  for (const offset of [20, 21, 22, 23, 24, 27, 29]) config = config.replaceAll(String(54300 + offset), String(base + offset));
  config = config.replace(/(\[db.seed\][\s\S]*?enabled = )true/, "$1false");
  writeFileSync(join(target, "supabase/config.toml"), config);
  cpSync(join(repo, "supabase/migrations"), join(target, "supabase/migrations"), { recursive: true });
  const stop = async () => {
    const stopped = await quiet(supabaseCLI, ["stop", "--workdir", target, "--no-backup"]);
    rmSync(target, { recursive: true, force: true });
    if (stopped.code !== 0) throw new Error(`Disposable stack cleanup failed for ${project}`);
  };
  const started = await quiet(supabaseCLI, ["start", "--workdir", target, "-x", SUPABASE_EXCLUDED_SERVICES]);
  if (started.code !== 0) {
    // Migration errors are safe to show; credential-bearing status lines are not printed on failure.
    const safe = started.output.split(/\r?\n/).filter((line) => /error|failed|ERROR|migration/i.test(line) && !/key|secret|jwt/i.test(line)).slice(-12).join("\n");
    await stop().catch(() => {});
    throw new Error(`Disposable Supabase stack failed to start (all migrations are applied at start):\n${safe}`);
  }
  const applied = await quiet("docker", ["exec", `supabase_db_${project}`, "psql", "-U", "postgres", "-Atc", "select count(*) from supabase_migrations.schema_migrations"]);
  const expected = readdirSync(join(repo, "supabase/migrations")).filter((file) => file.endsWith(".sql")).length;
  if (applied.code !== 0 || Number(applied.output.trim()) !== expected) {
    await stop().catch(() => {});
    throw new Error(`Expected all ${expected} migrations applied, observed ${applied.output.trim()}`);
  }
  console.log(`VP_DB_INTEGRATION_STACK ${JSON.stringify({ project, migrations: expected })}`);
  return {
    env: { VP_IDENTITY_SUPABASE_WORKDIR: target, VP_IDENTITY_SUPABASE_API_URL: `http://127.0.0.1:${base + 21}` },
    stop,
  };
}

async function runLane(lane, shard = null) {
  const definition = LANES[lane];
  const steps = executionSteps(lane, shard);
  preflight(lane, definition.needs);
  const results = [];
  const stack = definition.stack ? await startDisposableStack(definition.stack.portBase) : null;
  try {
    for (const step of steps) {
      const env = { ...process.env, ...(stack?.env ?? {}), ...(step.env ?? {}), VP_CI_SUITE: "db-integration" };
      const [command, ...args] = step.runner ?? node("--test", "--test-reporter=tap", `--test-concurrency=${step.concurrency ?? 4}`, ...step.files);
      console.log(`\n::group::${lane} / ${step.name}`);
      const started = Date.now();
      const { code, output } = await tee(command, args, env);
      console.log("::endgroup::");
      const totals = parseNodeTestSummary(output);
      const problems = stepProblems(code, totals);
      results.push({ lane, step: step.name, files: step.files.length, ...totals, seconds: Math.round((Date.now() - started) / 1000), outcome: problems.length ? "failed" : "passed", problems });
    }
  } finally {
    if (stack) await stack.stop();
  }
  return results;
}

async function main() {
  const argv = process.argv.slice(2);
  const { rows, problems } = classify();
  if (argv.length === 1 && argv[0] === "--ci-matrix") {
    if (problems.length) throw Error(problems.join("\n"));
    console.log(JSON.stringify(executionMatrix(JSON.parse(process.env.VP_DB_LANES_JSON ?? "null"))));
    return;
  }
  if (argv.includes("--images")) {
    console.log(pinnedImages().join("\n"));
    return;
  }
  if (argv.includes("--list")) {
    for (const row of rows) console.log(`${row.lane.padEnd(22)} ${row.gated ? "gated  " : "always "} ${row.file}${row.reason ? `  — ${row.reason}` : ""}`);
    if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
    return;
  }
  if (problems.length) throw new Error(`Integration test classification is incomplete:\n${problems.join("\n")}`);
  const lanes = []; let shard = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--shard" && argv[i + 1] && shard === null) { shard = argv[++i]; continue; }
    if (argv[i] !== "--lane" || !argv[i + 1]) throw new Error(`Usage: --list | --lane <${Object.keys(LANES).join("|")}|all> ...`);
    lanes.push(...(argv[i + 1] === "all" ? Object.keys(LANES) : [argv[i + 1]]));
    i++;
  }
  if (!lanes.length) throw new Error(`Usage: --list | --lane <${Object.keys(LANES).join("|")}|all> ...`);
  if (shard !== null && lanes.length !== 1) throw Error("A shard requires exactly one lane");
  for (const lane of lanes) if (!LANES[lane]) throw new Error(`Unknown lane ${lane}`);

  const results = [];
  let crashed = null;
  for (const lane of lanes) {
    try { results.push(...(await runLane(lane, shard))); }
    catch (error) { crashed = error; results.push({ lane, step: "(setup)", outcome: "failed", problems: [String(error.message ?? error)] }); break; }
  }
  const header = "| Lane | Step | Outcome | Tests | Pass | Skipped | Fail | Seconds |\n| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |\n";
  const table = results.map((r) => `| ${r.lane} | ${r.step} | ${r.outcome}${r.problems?.length ? ` (${r.problems.join(", ").replace(/\|/g, "/").replace(/\n/g, " ")})` : ""} | ${r.tests ?? "-"} | ${r.pass ?? "-"} | ${r.skipped ?? "-"} | ${r.fail ?? "-"} | ${r.seconds ?? "-"} |`).join("\n");
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n### DB integration\n\n${header}${table}\n`);
  for (const r of results) console.log(`VP_DB_INTEGRATION_RESULT ${JSON.stringify(r)}`);
  if (crashed) console.error(crashed.stack ?? crashed);
  process.exit(results.every((r) => r.outcome === "passed") && !crashed ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
