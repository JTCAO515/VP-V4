// One bounded, real Qwen worker poll for the owned Staging grounded turn.
// The server credential and provider key remain in child environment only.
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const project = "dzqdzetcctkhbrhlxxgn";
const dir = "/Users/jtsm5p/.codex/secure-backups/vpj-75-76-staging";
const identity = join(dir, "20260919T073953Z-87d3a1dc.agekey");
const actorJournal = join(dir, "ops-actors-20260919.age");
const policyId = "74f22a81-c9e0-44b7-a7a1-d6f6425d931d";
const turnId = "8db8c8e3-debd-42d1-a8e0-acfe1d4426f9";
const model = "qwen3.7-plus-2026-05-26";
const priceVersion = "qwen3.7-plus-2026-05-26-20260919-max-tier";
const reservedMicros = 6_400_000;
const maxOutputTokens = 1024;
const timeoutMs = 30000;

function run(program, args, options = {}) {
  const r = spawnSync(program, args, { encoding: "utf8", timeout: 30000, maxBuffer: 1024 * 1024, ...options });
  if (r.status !== 0) throw new Error("COMMAND_FAILED");
  return r.stdout;
}
function cli(args) { return JSON.parse(run("supabase", [...args, "--output-format", "json"])); }
function keyring() {
  const raw = cli(["projects", "api-keys", "--project-ref", project]);
  const list = Array.isArray(raw) ? raw : raw.keys ?? raw.api_keys;
  const service = list?.find(k => k.name === "service_role")?.api_key;
  if (!service?.startsWith("eyJ")) throw new Error("SERVICE_KEY_UNAVAILABLE");
  return service;
}
function qwenKey() {
  const text = readFileSync("lib/server/jobs/.local/.env", "utf8");
  const key = /^QWEN_API_KEY=(.+)$/m.exec(text)?.[1]?.trim().replace(/^"|"$/g, "");
  if (!key || key.length < 16) throw new Error("QWEN_KEY_UNAVAILABLE"); return key;
}
function query(sql) {
  const result = cli(["db", "query", "--linked", "--project-ref", project, sql]);
  if (!Array.isArray(result.rows) || result.rows.length !== 1) throw new Error("QUERY_FAILED");
  return result.rows[0];
}
function quote(s) { return `'${String(s).replaceAll("'", "''")}'`; }

if (process.argv.length !== 2) throw new Error("NO_ARGUMENTS_ALLOWED");
const actors = JSON.parse(run("age", ["-d", "-i", identity, actorJournal]));
if (actors.project !== project || !actors.opsEnabled || actors.users?.length !== 2) throw new Error("ACTOR_JOURNAL_INVALID");
const ownerId = actors.users[0].id;
const before = query(`begin read only; select
  (select count(*) from turn_private.text_content c join turn_private.work w on w.turn_id=c.turn_id
    where c.turn_id=${quote(turnId)}::uuid and c.owner_id=${quote(ownerId)}::uuid
      and c.policy_id=${quote(policyId)}::uuid and w.state='queued') as queued_turn,
  (select count(*) from turn_private.text_consents where owner_id=${quote(ownerId)}::uuid
    and policy_id=${quote(policyId)}::uuid and revoked_at is null) as consents,
  (select count(*) from public.model_budget_scopes where owner_id=${quote(ownerId)}::uuid) as existing_scopes,
  (select count(*) from public.trips) as trips,
  (select enabled from knowledge_review_private.publication_settings) as publication_enabled;
  rollback;`);
if (Number(before.queued_turn) !== 1 || Number(before.consents) !== 1
  || Number(before.existing_scopes) !== 0 || Number(before.trips) !== 3
  || before.publication_enabled !== false) throw new Error("WORKER_BASELINE_CHANGED");
const scopeId = randomUUID();
const config = {
  schemaVersion: "vpj07-staging-text-job/4", inputMode: "knowledge_intent_v1",
  ownerId, policyId,
  budget: { scopeId, priceVersion, reservedMicros, maxOutputTokens, timeoutMs },
  provider: { provider: "qwen", endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    configurationId: "458b64a2-ef6c-42e1-8f0b-3d12bd048369", configurationVersion: 1, timeoutMs },
  // Official 256K-1M tier is CNY 6/M input and 24/M output. A flat
  // highest-tier rate deliberately overestimates a short request; the
  // durable ledger is a budget estimate, not the account's invoice.
  pricing: { mode: "flat", inputMicrosPerMillion: 6_000_000,
    outputMicrosPerMillion: 24_000_000, cachedInputMicrosPerMillion: null },
};
const required = Math.ceil((1_048_576 * 6_000_000 + maxOutputTokens * 24_000_000) / 1_000_000);
if (reservedMicros < required || required > 6_400_000) throw new Error("RESERVE_INSUFFICIENT");
const configPath = join(dir, "grounded-worker-20260919.json");
const receiptPath = join(dir, "grounded-worker-20260919.jsonl");
writeFileSync(configPath, JSON.stringify(config), { mode: 0o600, flag: "wx" });
const created = query(`begin;
  do $guard$ begin
    if (select count(*) from public.model_budget_scopes where owner_id=${quote(ownerId)}::uuid) <> 0
      or (select count(*) from turn_private.text_content c join turn_private.work w on w.turn_id=c.turn_id
        where c.turn_id=${quote(turnId)}::uuid and c.owner_id=${quote(ownerId)}::uuid
          and c.policy_id=${quote(policyId)}::uuid and w.state='queued') <> 1
    then raise exception 'BUDGET_BASELINE_CHANGED'; end if;
  end $guard$;
  insert into public.model_budget_scopes(id,owner_id,currency,limit_micros,task_limit_micros,
    task_attempt_limit,concurrency_limit,enabled,expires_at)
    values(${quote(scopeId)}::uuid,${quote(ownerId)}::uuid,'CNY',10000000,7000000,1,1,true,
      now()+interval '2 hours');
  insert into public.model_budget_provider_limits(scope_id,provider,model,price_version,
    limit_micros,attempt_limit_micros,enabled)
    values(${quote(scopeId)}::uuid,'qwen',${quote(model)},${quote(priceVersion)},10000000,
      ${reservedMicros},true);
  commit;
  select id,enabled,frozen,limit_micros from public.model_budget_scopes where id=${quote(scopeId)}::uuid;`);
if (created.id !== scopeId || created.enabled !== true || created.frozen !== false) throw new Error("BUDGET_ACK_UNKNOWN_VERIFY_REMOTE_STATE");
const service = keyring(), provider = qwenKey();
const child = spawnSync(process.execPath, ["--experimental-strip-types",
  resolve("lib/server/jobs/run-staging-text-worker.mjs"), "--config", configPath,
  "--receipts", receiptPath], {
  encoding: "utf8", timeout: 160000, maxBuffer: 1024 * 1024,
  env: { ...process.env, NODE_OPTIONS: "", VERCEL_ENV: "",
    VISEPANDA_STAGING_TEXT_WORKER: "true",
    VISEPANDA_STAGING_TEXT_WORKER_KEY: service,
    VISEPANDA_STAGING_TEXT_PROVIDER_KEY: provider },
});
const receipts = readFileSync(receiptPath, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
const result = (() => { try { return JSON.parse(child.stdout.trim().split("\n").at(-1)); } catch { return null; } })();
const after = query(`begin read only; select c.turn_id,c.output_kind,g.intent,g.original_outcome,
  g.completed_at is not null as completed,w.state as work_state,
  (select count(*) from public.model_budget_attempts a where a.scope_id=${quote(scopeId)}::uuid) as attempts,
  (select jsonb_agg(jsonb_build_object('status',a.status,'actualMicros',a.actual_micros,
    'reservedMicros',a.reserved_micros)) from public.model_budget_attempts a
    where a.scope_id=${quote(scopeId)}::uuid) as budget
  from turn_private.text_content c join turn_private.grounded_turns g on g.turn_id=c.turn_id
  join turn_private.work w on w.turn_id=c.turn_id where c.turn_id=${quote(turnId)}::uuid; rollback;`);
console.log(JSON.stringify({ project, scopeId, priceVersion,
  reservedMicros, maxOutputTokens, priceInputPerMillion: 6,
  priceOutputPerMillion: 24, requiredMicros: required,
  workerExit: child.status, workerResult: result?.result ?? null,
  receiptPhases: receipts.filter(r => r.phase).map(r => r.phase),
  usageReceipts: receipts.filter(r => r.schemaVersion === "vpj07-usage-journal/1").length,
  turn: after, configPath, receiptPath }));
if (child.status !== 0 || result?.result !== "finished") process.exitCode = 1;
