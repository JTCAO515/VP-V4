// Real Ops claim -> Qwen structured proposal -> complete for the owned
// museum source revision. Bounded manual invocation, no auto-publication.
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { requestFactory, STAGING } from "../db/vpj-02-verification-core.mjs";
import { runWikiStatementProposalJob, proposalInputDigest } from "../../lib/server/jobs/wiki-statement-proposal-job.ts";
import { completeWikiGenerationJob } from "../../lib/server/jobs/wiki-generation-complete.ts";
import { WIKI_STATEMENT_PROPOSALS_PROMPT_REF } from "../../lib/server/model-gateway/prompt/wiki-statement-proposals.ts";

const dir = "/Users/jtsm5p/.codex/secure-backups/vpj-75-76-staging";
const identity = join(dir, "20260919T073953Z-87d3a1dc.agekey");
const actorsPath = join(dir, "ops-actors-20260919.age");
const sourcePath = join(dir, "museum-source-intake-20260919.age");
const runPath = join(dir, "museum-proposal-job-20260919.age");
const pageKey = "source_summary:vpj75-staging-20260919-museum-proposal";
const endpoint = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";

function command(program, args, options = {}) {
  const result = spawnSync(program, args, { encoding: "utf8", timeout: 30000, maxBuffer: 1024 * 1024, ...options });
  if (result.status !== 0) throw new Error("COMMAND_FAILED");
  return result.stdout;
}
function readEncrypted(path) { return JSON.parse(command("age", ["-d", "-i", identity, path])); }
function saveEncrypted(value) {
  const recipient = command("age-keygen", ["-y", identity]).trim();
  const sealed = spawnSync("age", ["-r", recipient], { input: JSON.stringify(value), timeout: 10000 });
  if (sealed.status !== 0) throw new Error("JOURNAL_ENCRYPTION_FAILED");
  const temp = `${runPath}.${randomUUID()}.pending`;
  writeFileSync(temp, sealed.stdout, { mode: 0o600, flag: "wx" }); renameSync(temp, runPath);
}
function cli(args) { return JSON.parse(command("supabase", [...args, "--output-format", "json"])); }
function keyring() {
  const keys = cli(["projects", "api-keys", "--project-ref", STAGING]);
  const items = Array.isArray(keys) ? keys : keys.keys ?? keys.api_keys;
  const anon = items?.find(k => k.name === "anon")?.api_key;
  const service = items?.find(k => k.name === "service_role")?.api_key;
  if (!anon?.startsWith("eyJ") || !service?.startsWith("eyJ")) throw new Error("KEYRING_UNAVAILABLE");
  return { anon, service };
}
function qwenKey() {
  const text = readFileSync("lib/server/jobs/.local/.env", "utf8");
  const key = /^QWEN_API_KEY=(.+)$/m.exec(text)?.[1]?.trim().replace(/^"|"$/g, "");
  if (!key || key.length < 16) throw new Error("QWEN_KEY_UNAVAILABLE");
  return key;
}
function db(sql) {
  const result = cli(["db", "query", "--linked", "--project-ref", STAGING, `begin read only; ${sql}; rollback;`]);
  if (!Array.isArray(result.rows)) throw new Error("QUERY_FAILED");
  return result.rows;
}
async function main() {
  if (process.argv.length !== 2) throw new Error("NO_ARGUMENTS_ALLOWED");
  const actors = readEncrypted(actorsPath), intake = readEncrypted(sourcePath);
  if (actors.project !== STAGING || !actors.opsEnabled || intake.project !== STAGING
    || intake.phase !== "source_readback" || intake.sourceRevisionId === undefined) throw new Error("PREREQUISITE_INVALID");
  const source = { id: intake.sourceRevisionId, declaration: intake.declaration };
  const rows = db(`select id,declaration,snippet_hash,withdrawn_at from knowledge_review_private.source_revisions where id='${source.id}'::uuid`);
  if (rows.length !== 1 || rows[0].withdrawn_at !== null
    || Object.entries(source.declaration).some(([key, value]) => rows[0].declaration[key] !== value)
    || rows[0].snippet_hash !== createHash("sha256").update(source.declaration.snippet).digest("hex")) throw new Error("SOURCE_DRIFT");
  const author = actors.users[0], request = requestFactory(keyring());
  const login = await request("/auth/v1/token?grant_type=password", { method: "POST",
    body: { email: author.email, password: author.password } });
  if (login.status !== 200 || login.body?.user?.id !== author.id) throw new Error("AUTHOR_LOGIN_FAILED");
  const token = login.body.access_token;
  const provider = { provider: "qwen", endpoint, configurationId: "458b64a2-ef6c-42e1-8f0b-3d12bd048369",
    configurationVersion: 1, timeoutMs: 30000 };
  const promptVersion = WIKI_STATEMENT_PROPOSALS_PROMPT_REF.version;
  const configDigest = createHash("sha256").update(JSON.stringify({ provider,
    promptDigest: WIKI_STATEMENT_PROPOSALS_PROMPT_REF.digest,
    maxOutputTokens: 4096, timeoutMs: 30000 })).digest("hex");
  const input = { dataClass: "c0_synthetic", sources: [source], configDigest,
    maxOutputTokens: 4096, timeoutMs: 30000, provider };
  const inputDigest = proposalInputDigest(input);
  const claim = { action: "claim", operationId: randomUUID(), pageType: "source_summary", pageKey,
    sourceRevisionIds: [source.id], promptVersion, configDigest, inputDigest };
  const journal = { project: STAGING, pageKey, sourceRevisionId: source.id,
    promptVersion, configDigest, inputDigest, claim, phase: "before_claim", destinationReceipts: [] };
  saveEncrypted(journal);
  const call = async (name, parameters) => {
    const result = await request(`/rest/v1/rpc/${name}`, { method: "POST", token, body: parameters });
    return result.status === 200 ? { data: result.body, error: null }
      : { data: null, error: { message: result.body?.message || result.body?.error || `HTTP_${result.status}` } };
  };
  const claimed = await call("ops_wiki_generation_v1", { p_input: claim });
  if (claimed.error || claimed.data?.kind !== "claimed") throw new Error("CLAIM_FAILED");
  journal.claimed = claimed.data; journal.phase = "claimed"; saveEncrypted(journal);
  const outcome = await runWikiStatementProposalJob(input, {
    credential: () => qwenKey(),
    recordDestination: async receipt => { journal.destinationReceipts.push(receipt); saveEncrypted(journal); },
  }, AbortSignal.timeout(45000));
  journal.outcome = outcome; journal.phase = "provider_returned"; saveEncrypted(journal);
  const completion = { operationId: randomUUID(), jobId: claimed.data.jobId,
    claimToken: claimed.data.claimToken, expectedVersion: claimed.data.expectedVersion,
    sourceRevisionIds: [source.id], statementRefs: [], promptVersion, configDigest,
    generatedAt: new Date().toISOString(), changeNote: "Real Qwen statement proposals from official museum notice editorial synopsis; pending human review" };
  journal.completion = completion; journal.phase = "before_complete"; saveEncrypted(journal);
  const completed = await completeWikiGenerationJob({ call }, completion, outcome);
  if (completed.error) throw new Error("COMPLETE_FAILED_VERIFY_RECEIPT");
  journal.completed = completed.data; journal.phase = "completed"; saveEncrypted(journal);
  console.log(JSON.stringify({ project: STAGING, pageKey, promptVersion, configDigest, inputDigest,
    outcome: outcome.kind, modelError: outcome.kind === "failed" ? outcome.errorCode : null,
    proposalCount: outcome.kind === "succeeded" ? outcome.output.statementProposals.length : null,
    costTokens: outcome.kind === "succeeded" ? outcome.usage.totalTokens : null,
    receiptPhases: journal.destinationReceipts.map(r => r.phase),
    result: completed.data?.kind, version: completed.data?.version, journal: runPath }));
}
try { await main(); } catch (error) {
  console.log(JSON.stringify({ status: "FAILED", reason: error instanceof Error ? error.message : "UNKNOWN",
    journal: runPath })); process.exitCode = 1;
}
