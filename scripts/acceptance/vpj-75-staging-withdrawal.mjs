// Real Staging source withdrawal barriers, with one real provider call
// between claim and withdrawal. The owned source/candidate are never published.
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { requestFactory, STAGING } from "../db/vpj-02-verification-core.mjs";
import { runWikiGenerationJob, computeWikiInputDigest } from "../../lib/server/jobs/wiki-generation-job.ts";
import { WIKI_GENERATION_PROMPT_REF } from "../../lib/server/model-gateway/prompt/wiki-generation.ts";

const dir = "/Users/jtsm5p/.codex/secure-backups/vpj-75-76-staging";
const identity = join(dir, "20260919T073953Z-87d3a1dc.agekey");
const journalPath = join(dir, "withdrawal-run-20260919.age");
const pageKey = "source_summary:vpj75-staging-20260919-withdrawn";
const declaration = {
  sourceKey: "cq-museum-vpj75-withdrawal", revisionLabel: "20260919-official-notice-v1",
  publisher: "重庆中国三峡博物馆 / Chongqing China Three Gorges Museum",
  uri: "https://www.3gmuseum.cn/web/article/1430010139317059584/web/content_1430010139317059584.html",
  locator: "Notice dated 2025-09-30, first two substantive paragraphs",
  snippet: "Original editorial synopsis (not a quotation): In Chongqing, the China Three Gorges Museum notice says the main museum and named subsidiaries waive reservations from 1 October 2025, while two named subsidiaries still require tickets and visitors should check current crowd notices.",
  usageDeclaration: "Original editorial factual synopsis and citation metadata only; no quotation, raw-page, media, corpus, embedding or TTS rights claimed. This revision is for a real Staging withdrawal barrier rehearsal and is never approved for publication.",
};
const statement = {
  schemaVersion: "knowledge-statement/1",
  assertion: { subjectId: "chongqing_museum_withdrawal_rehearsal", predicate: "requires_action",
    objectId: "check_current_crowd_notice", conditions: ["museum_visit"],
    exclusions: ["no_entry_guarantee"] },
  scope: { cities: ["chongqing"], scene: "attraction", audience: "international_independent_traveler" },
  expressions: {
    zh: { text: "参观前核对博物馆最新客流公告。", conditions: ["仅限该博物馆参观。"], exclusions: ["不保证可以入馆。"] },
    en: { text: "Check the museum's current crowd notice before visiting.",
      conditions: ["Only for this museum visit."], exclusions: ["Entry is not guaranteed."] },
  }, sources: [declaration],
};
function command(program, args, options = {}) {
  const r = spawnSync(program, args, { encoding: "utf8", timeout: 30000, maxBuffer: 1024 * 1024, ...options });
  if (r.status !== 0) throw new Error("COMMAND_FAILED"); return r.stdout;
}
function cli(args) { return JSON.parse(command("supabase", [...args, "--output-format", "json"])); }
function readEncrypted(path) { return JSON.parse(command("age", ["-d", "-i", identity, path])); }
function saveEncrypted(value) {
  const recipient = command("age-keygen", ["-y", identity]).trim();
  const sealed = spawnSync("age", ["-r", recipient], { input: JSON.stringify(value), timeout: 10000 });
  if (sealed.status !== 0) throw new Error("JOURNAL_ENCRYPTION_FAILED");
  const path = `${journalPath}.${randomUUID()}.pending`;
  writeFileSync(path, sealed.stdout, { mode: 0o600, flag: "wx" }); renameSync(path, journalPath);
}
function keyring() {
  const keys = cli(["projects", "api-keys", "--project-ref", STAGING]);
  const a = Array.isArray(keys) ? keys : keys.keys ?? keys.api_keys;
  const anon = a?.find(k => k.name === "anon")?.api_key, service = a?.find(k => k.name === "service_role")?.api_key;
  if (!anon?.startsWith("eyJ") || !service?.startsWith("eyJ")) throw new Error("KEYRING_UNAVAILABLE");
  return { anon, service };
}
function qwenKey() {
  const text = readFileSync("lib/server/jobs/.local/.env", "utf8");
  const key = /^QWEN_API_KEY=(.+)$/m.exec(text)?.[1]?.trim().replace(/^"|"$/g, "");
  if (!key || key.length < 16) throw new Error("QWEN_KEY_UNAVAILABLE"); return key;
}
function db(sql) {
  const result = cli(["db", "query", "--linked", "--project-ref", STAGING, `begin read only; ${sql}; rollback;`]);
  if (!Array.isArray(result.rows)) throw new Error("QUERY_FAILED"); return result.rows;
}
async function main() {
  if (process.argv.length !== 2) throw new Error("NO_ARGUMENTS_ALLOWED");
  const actors = readEncrypted(join(dir, "ops-actors-20260919.age"));
  if (actors.project !== STAGING || !actors.opsEnabled) throw new Error("OPS_PREREQUISITE_INVALID");
  if (db(`select id from knowledge_review_private.source_revisions where source_key='${declaration.sourceKey}' and revision_label='${declaration.revisionLabel}'`).length) throw new Error("SOURCE_ALREADY_EXISTS");
  const author = actors.users[0], request = requestFactory(keyring());
  const login = await request("/auth/v1/token?grant_type=password", { method: "POST",
    body: { email: author.email, password: author.password } });
  if (login.status !== 200 || login.body?.user?.id !== author.id) throw new Error("AUTHOR_LOGIN_FAILED");
  const token = login.body.access_token;
  const call = async (name, body) => request(`/rest/v1/rpc/${name}`, { method: "POST", token, body: { p_input: body } });
  const intake = { action: "submit_statement", operationId: randomUUID(), candidateId: randomUUID(),
    title: "VPJ-75 Staging withdrawn-source barrier rehearsal only", statement };
  const journal = { project: STAGING, pageKey, intake, phase: "before_intake", destinationReceipts: [] };
  saveEncrypted(journal);
  const submitted = await call("ops_review_workspace", intake);
  if (submitted.status !== 200) throw new Error("SOURCE_INTAKE_FAILED");
  journal.phase = "intake_submitted"; saveEncrypted(journal);
  const sources = db(`select id,withdrawn_at from knowledge_review_private.source_revisions where source_key='${declaration.sourceKey}' and revision_label='${declaration.revisionLabel}'`);
  if (sources.length !== 1 || sources[0].withdrawn_at !== null) throw new Error("SOURCE_READBACK_FAILED");
  const sourceId = sources[0].id; journal.sourceRevisionId = sourceId; saveEncrypted(journal);
  const provider = { provider: "qwen", endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    configurationId: "458b64a2-ef6c-42e1-8f0b-3d12bd048369", configurationVersion: 1, timeoutMs: 30000 };
  const promptVersion = WIKI_GENERATION_PROMPT_REF.version;
  const configDigest = createHash("sha256").update(JSON.stringify({ provider,
    promptDigest: WIKI_GENERATION_PROMPT_REF.digest, maxOutputTokens: 1024, timeoutMs: 30000 })).digest("hex");
  const inputDigest = computeWikiInputDigest(promptVersion, configDigest, declaration.snippet);
  const claim = { action: "claim", operationId: randomUUID(), pageType: "source_summary", pageKey,
    sourceRevisionIds: [sourceId], promptVersion, configDigest, inputDigest };
  journal.claim = claim; journal.phase = "before_claim"; saveEncrypted(journal);
  const claimed = await call("ops_wiki_generation_v1", claim);
  if (claimed.status !== 200 || claimed.body?.kind !== "claimed") throw new Error("PRE_WITHDRAWAL_CLAIM_FAILED");
  journal.claimed = claimed.body; journal.phase = "claimed"; saveEncrypted(journal);
  const outcome = await runWikiGenerationJob({ pageType: "source_summary", pageKey,
    sourceText: declaration.snippet, promptVersion, configDigest, maxOutputTokens: 1024,
    timeoutMs: 30000, provider }, {
    credential: () => qwenKey(),
    recordDestination: async receipt => { journal.destinationReceipts.push(receipt); saveEncrypted(journal); },
  }, AbortSignal.timeout(45000));
  if (outcome.kind !== "succeeded") throw new Error("PROVIDER_OUTCOME_NOT_SUCCESS");
  journal.providerOutcome = outcome; journal.phase = "provider_returned"; saveEncrypted(journal);
  const withdrawn = await call("ops_source_revision_withdraw_v1", {
    operationId: randomUUID(), sourceRevisionId: sourceId,
    reason: "VPJ-75 Staging verification: this owned source revision was intentionally withdrawn before job completion; never publish it." });
  if (withdrawn.status !== 200) throw new Error("WITHDRAWAL_FAILED");
  journal.withdrawn = withdrawn.body; journal.phase = "withdrawn"; saveEncrypted(journal);
  const completeOperationId = randomUUID();
  const successCompletion = { action: "complete", operationId: completeOperationId,
    jobId: claimed.body.jobId, outcome: { kind: "succeeded", claimToken: claimed.body.claimToken,
      costTokens: outcome.usage.totalTokens, expectedVersion: claimed.body.expectedVersion,
      sourceRevisionIds: [sourceId], statementRefs: [], promptVersion, configDigest,
      generatedAt: new Date().toISOString(), changeNote: "Must not persist after withdrawal",
      draftContent: outcome.output } };
  journal.successCompletion = successCompletion; journal.phase = "before_blocked_complete"; saveEncrypted(journal);
  const blockedCompletion = await call("ops_wiki_generation_v1", successCompletion);
  if (blockedCompletion.status === 200 || blockedCompletion.body?.message !== "OPS_SOURCE_WITHDRAWN") throw new Error("COMPLETION_BARRIER_FAILED");
  journal.blockedCompletion = { status: blockedCompletion.status, code: blockedCompletion.body.message };
  journal.phase = "complete_blocked"; saveEncrypted(journal);
  const settled = await call("ops_wiki_generation_v1", { action: "complete", operationId: randomUUID(),
    jobId: claimed.body.jobId, outcome: { kind: "failed", claimToken: claimed.body.claimToken,
      errorCode: "OPS_SOURCE_WITHDRAWN" } });
  if (settled.status !== 200 || settled.body?.kind !== "failed") throw new Error("TERMINAL_SETTLEMENT_FAILED");
  journal.phase = "failed_terminal"; saveEncrypted(journal);
  const replayClaim = await call("ops_wiki_generation_v1", { ...claim, operationId: randomUUID() });
  if (replayClaim.status === 200 || replayClaim.body?.message !== "OPS_SOURCE_WITHDRAWN") throw new Error("NEW_DISPATCH_BARRIER_FAILED");
  const after = db(`select s.withdrawn_at is not null as source_withdrawn,p.version,
      (select count(*) from knowledge_review_private.wiki_page_revisions r where r.page_id=p.id) as revisions,
      j.status,j.cost_unknown,j.cost_tokens
      from knowledge_review_private.source_revisions s
      join knowledge_review_private.wiki_pages p on p.page_key='${pageKey}'
      join knowledge_review_private.wiki_generation_jobs j on j.page_key=p.page_key
      where s.id='${sourceId}'::uuid`);
  if (after.length !== 1 || !after[0].source_withdrawn || Number(after[0].version) !== 0
    || Number(after[0].revisions) !== 0 || after[0].status !== "failed") throw new Error("FINAL_STATE_INVALID");
  journal.phase = "verified"; journal.finalState = after[0]; saveEncrypted(journal);
  console.log(JSON.stringify({ status: "WITHDRAWAL_BARRIERS_PASS", project: STAGING,
    sourceRevisionId: sourceId, jobId: claimed.body.jobId, pageKey,
    providerUsageTokens: outcome.usage.totalTokens,
    completedAfterWithdrawal: blockedCompletion.body.message,
    newClaimAfterWithdrawal: replayClaim.body.message,
    destinationPhases: journal.destinationReceipts.map(r => r.phase),
    final: after[0], journal: journalPath }));
}
try { await main(); } catch (error) {
  console.log(JSON.stringify({ status: "FAILED", reason: error instanceof Error ? error.message : "UNKNOWN",
    journal: journalPath })); process.exitCode = 1;
}
