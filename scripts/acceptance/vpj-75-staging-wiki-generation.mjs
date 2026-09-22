// One real Staging claim -> Qwen Wiki worker -> completion for an already
// published first-party editorial source. Manual/on-demand; billed provider.
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { requestFactory, STAGING } from "../db/vpj-02-verification-core.mjs";
import { runWikiGenerationJob, computeWikiInputDigest } from "../../lib/server/jobs/wiki-generation-job.ts";
import { completeWikiGenerationJob } from "../../lib/server/jobs/wiki-generation-complete.ts";
import { WIKI_GENERATION_PROMPT_REF } from "../../lib/server/model-gateway/prompt/wiki-generation.ts";

const directory = "/Users/jtsm5p/.codex/secure-backups/vpj-75-76-staging";
const identity = join(directory, "20260919T073953Z-87d3a1dc.agekey");
const actorJournal = join(directory, "ops-actors-20260919.age");
const runJournal = join(directory, "wiki-generation-20260919.age");
const sourceKey = "n-s04", revisionLabel = "20260912-ticketing-q2";
const pageKey = "source_summary:vpj75-staging-20260919-rail-id";
const endpoint = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";

function command(program, args, options = {}) {
  const out = spawnSync(program, args, { encoding: "utf8", timeout: 30000, maxBuffer: 1024 * 1024, ...options });
  if (out.status !== 0) throw new Error("COMMAND_FAILED");
  return out.stdout;
}
function jsonCli(args) { return JSON.parse(command("supabase", [...args, "--output-format", "json"])); }
function readEncrypted(path) {
  return JSON.parse(command("age", ["-d", "-i", identity, path]));
}
function saveEncrypted(path, value) {
  const recipient = command("age-keygen", ["-y", identity]).trim();
  const result = spawnSync("age", ["-r", recipient], { input: JSON.stringify(value), timeout: 10000 });
  if (result.status !== 0) throw new Error("JOURNAL_ENCRYPTION_FAILED");
  const temporary = `${path}.${randomUUID()}.pending`;
  writeFileSync(temporary, result.stdout, { mode: 0o600, flag: "wx" });
  renameSync(temporary, path);
}
function keyring() {
  const value = jsonCli(["projects", "api-keys", "--project-ref", STAGING]);
  const keys = Array.isArray(value) ? value : value.keys ?? value.api_keys;
  const anon = keys?.find(k => k.name === "anon")?.api_key;
  const service = keys?.find(k => k.name === "service_role")?.api_key;
  if (!anon?.startsWith("eyJ") || !service?.startsWith("eyJ")) throw new Error("KEYRING_UNAVAILABLE");
  return { anon, service };
}
function localKey() {
  const text = readFileSync("lib/server/jobs/.local/.env", "utf8");
  const key = /^QWEN_API_KEY=(.+)$/m.exec(text)?.[1]?.trim().replace(/^"|"$/g, "");
  if (!key || key.length < 16) throw new Error("QWEN_KEY_UNAVAILABLE");
  return key;
}
function sourceRecord() {
  const result = jsonCli(["db", "query", "--linked", "--project-ref", STAGING,
    `begin read only; select id,declaration,snippet_hash,withdrawn_at from knowledge_review_private.source_revisions where source_key='${sourceKey}' and revision_label='${revisionLabel}'; rollback;`]);
  if (result.rows?.length !== 1 || result.rows[0].withdrawn_at !== null) throw new Error("SOURCE_UNAVAILABLE");
  const record = result.rows[0];
  const batch = JSON.parse(readFileSync("docs/knowledge-base/batches/2026-09-12-first-party/statements.json", "utf8"));
  const source = batch.records.find(r => r.editorialId === "RAIL-02")?.statement?.sources?.[0]
    ?? batch.records.flatMap(r => r.statement?.sources ?? []).find(s => s.sourceKey === sourceKey && s.revisionLabel === revisionLabel);
  if (!source || JSON.stringify(record.declaration) !== JSON.stringify(source)) {
    // JSON key order is not a semantic requirement; compare every approved
    // source declaration field instead of weakening the source gate.
    if (!source || Object.keys(source).length !== Object.keys(record.declaration).length
      || Object.entries(source).some(([k, v]) => record.declaration[k] !== v)) throw new Error("SOURCE_DECLARATION_DRIFT");
  }
  const digest = createHash("sha256").update(source.snippet).digest("hex");
  if (record.snippet_hash !== digest) throw new Error("SOURCE_HASH_DRIFT");
  return { id: record.id, sourceText: source.snippet };
}
async function main() {
  if (process.argv.length !== 2) throw new Error("NO_ARGUMENTS_ALLOWED");
  const actors = readEncrypted(actorJournal);
  if (actors.project !== STAGING || !actors.opsEnabled || actors.users?.length !== 2) throw new Error("OPS_JOURNAL_INVALID");
  const author = actors.users[0];
  const request = requestFactory(keyring());
  const login = await request("/auth/v1/token?grant_type=password", { method: "POST",
    body: { email: author.email, password: author.password } });
  const token = login.body?.access_token;
  if (login.status !== 200 || login.body?.user?.id !== author.id || typeof token !== "string") throw new Error("AUTHOR_LOGIN_FAILED");
  const source = sourceRecord();
  const provider = { provider: "qwen", endpoint, configurationId: "458b64a2-ef6c-42e1-8f0b-3d12bd048369",
    configurationVersion: 1, timeoutMs: 30000 };
  const promptVersion = WIKI_GENERATION_PROMPT_REF.version;
  const configDigest = createHash("sha256").update(JSON.stringify({ provider, promptDigest: WIKI_GENERATION_PROMPT_REF.digest,
    maxOutputTokens: 1024, timeoutMs: 30000 })).digest("hex");
  const inputDigest = computeWikiInputDigest(promptVersion, configDigest, source.sourceText);
  const claim = { action: "claim", operationId: randomUUID(), pageType: "source_summary", pageKey,
    sourceRevisionIds: [source.id], promptVersion, configDigest, inputDigest };
  const journal = { project: STAGING, pageKey, sourceRevisionId: source.id,
    promptVersion, configDigest, inputDigest, claim, phase: "before_claim", destinationReceipts: [] };
  saveEncrypted(runJournal, journal);
  const call = async (name, input) => {
    const result = await request(`/rest/v1/rpc/${name}`, { method: "POST", token, body: input });
    return result.status === 200 ? { data: result.body, error: null }
      : { data: null, error: { message: result.body?.message || result.body?.error || `HTTP_${result.status}` } };
  };
  const claimed = await call("ops_wiki_generation_v1", { p_input: claim });
  if (claimed.error || claimed.data?.kind !== "claimed") throw new Error("CLAIM_FAILED");
  journal.claimed = claimed.data; journal.phase = "claimed"; saveEncrypted(runJournal, journal);
  const outcome = await runWikiGenerationJob({ pageType: "source_summary", pageKey,
    sourceText: source.sourceText, promptVersion, configDigest, maxOutputTokens: 1024,
    timeoutMs: 30000, provider }, {
    credential: () => localKey(),
    recordDestination: async receipt => { journal.destinationReceipts.push(receipt); saveEncrypted(runJournal, journal); },
  }, AbortSignal.timeout(45000));
  journal.outcome = outcome; journal.phase = "provider_returned"; saveEncrypted(runJournal, journal);
  const completion = { operationId: randomUUID(), jobId: claimed.data.jobId,
    claimToken: claimed.data.claimToken, expectedVersion: claimed.data.expectedVersion,
    sourceRevisionIds: [source.id], statementRefs: [], promptVersion, configDigest,
    generatedAt: new Date().toISOString(), changeNote: "Real Qwen draft from previously reviewed 12306 editorial synopsis; awaiting Ops review" };
  journal.completion = completion; journal.phase = "before_complete"; saveEncrypted(runJournal, journal);
  const completed = await completeWikiGenerationJob({ call }, completion, outcome);
  if (completed.error) throw new Error("COMPLETE_FAILED_VERIFY_RECEIPT");
  journal.completed = completed.data; journal.phase = "completed"; saveEncrypted(runJournal, journal);
  console.log(JSON.stringify({ project: STAGING, pageKey, promptVersion, configDigest, inputDigest,
    provider: "qwen", outcome: outcome.kind, modelError: outcome.kind === "failed" ? outcome.errorCode : null,
    costTokens: outcome.kind === "succeeded" ? outcome.usage.totalTokens : null,
    receiptPhases: journal.destinationReceipts.map(r => r.phase),
    result: completed.data?.kind, version: completed.data?.version, journal: runJournal }));
}
try { await main(); } catch (error) {
  console.log(JSON.stringify({ status: "FAILED", reason: error instanceof Error ? error.message : "UNKNOWN",
    journal: runJournal }));
  process.exitCode = 1;
}
