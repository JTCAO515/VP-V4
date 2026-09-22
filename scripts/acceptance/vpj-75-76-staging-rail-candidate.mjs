// Prepare one reviewable rail fact from the real Qwen Wiki v1 for later
// native/Web readback. It intentionally duplicates an existing supported
// claim only within Staging, and does not perform review or publication.
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { requestFactory, STAGING } from "../db/vpj-02-verification-core.mjs";

const dir = "/Users/jtsm5p/.codex/secure-backups/vpj-75-76-staging";
const identity = join(dir, "20260919T073953Z-87d3a1dc.agekey");
const journalPath = join(dir, "rail-wiki-candidate-20260919.age");
const pageKey = "source_summary:vpj75-staging-20260919-rail-id";
const revisionId = "7c4d37b8-e7dc-473f-b806-dd85adab7c53";

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
function db(sql) {
  const result = cli(["db", "query", "--linked", "--project-ref", STAGING, `begin read only; ${sql}; rollback;`]);
  if (!Array.isArray(result.rows)) throw new Error("QUERY_FAILED"); return result.rows;
}
async function main() {
  if (process.argv.length !== 2) throw new Error("NO_ARGUMENTS_ALLOWED");
  const actors = readEncrypted(join(dir, "ops-actors-20260919.age"));
  if (actors.project !== STAGING || !actors.opsEnabled) throw new Error("OPS_PREREQUISITE_INVALID");
  const batch = JSON.parse(readFileSync("docs/knowledge-base/batches/2026-09-12-first-party/statements.json", "utf8"));
  const selected = batch.records.find(row => row.statement?.assertion?.subjectId === "rail_eticket_boarding"
    && row.statement?.assertion?.objectId === "original_valid_booking_id");
  if (!selected || selected.statement.sources?.length !== 1
    || selected.statement.sources[0].sourceKey !== "n-s04"
    || selected.statement.sources[0].revisionLabel !== "20260912-ticketing-q2") throw new Error("EDITORIAL_SOURCE_INVALID");
  const rows = db(`select r.id,r.version,r.draft_content is not null as body_present,
    r.source_revision_ids from knowledge_review_private.wiki_page_revisions r
    join knowledge_review_private.wiki_pages p on p.id=r.page_id
    where r.id='${revisionId}'::uuid and p.page_key='${pageKey}'`);
  if (rows.length !== 1 || Number(rows[0].version) !== 1 || !rows[0].body_present
    || rows[0].source_revision_ids?.length !== 1) throw new Error("WIKI_REVISION_CHANGED");
  const author = actors.users[0], request = requestFactory(keyring());
  const login = await request("/auth/v1/token?grant_type=password", { method: "POST",
    body: { email: author.email, password: author.password } });
  if (login.status !== 200 || login.body?.user?.id !== author.id) throw new Error("AUTHOR_LOGIN_FAILED");
  const input = { action: "submit_wiki_statement", operationId: randomUUID(), candidateId: randomUUID(),
    title: "VPJ-75/76 Staging rail Wiki readback candidate; temporary duplicate",
    wikiRevisionId: revisionId, expectedWikiVersion: 1, statement: selected.statement };
  const journal = { project: STAGING, pageKey, revisionId, input, phase: "before_submit" };
  saveEncrypted(journal);
  const response = await request("/rest/v1/rpc/ops_review_workspace", { method: "POST",
    token: login.body.access_token, body: { p_input: input } });
  if (response.status !== 200) throw new Error("SUBMIT_FAILED_VERIFY_RECEIPT");
  journal.phase = "submitted"; journal.result = response.body; saveEncrypted(journal);
  const after = db(`select c.id,c.status,c.version,w.wiki_revision_id,w.proposal_index,
    (select count(*) from knowledge_review_private.statement_sources ss where ss.candidate_id=c.id) as source_count
    from knowledge_review_private.candidates c join knowledge_review_private.wiki_statement_candidates w
    on w.candidate_id=c.id where c.id='${input.candidateId}'::uuid`);
  if (after.length !== 1 || after[0].status !== "pending" || Number(after[0].version) !== 1
    || after[0].wiki_revision_id !== revisionId || after[0].proposal_index !== null
    || Number(after[0].source_count) !== 1) throw new Error("CANDIDATE_READBACK_FAILED");
  journal.phase = "verified"; saveEncrypted(journal);
  console.log(JSON.stringify({ status: "RAIL_WIKI_CANDIDATE_PENDING", project: STAGING,
    candidateId: input.candidateId, wikiRevisionId: revisionId, sourceCount: 1,
    expectedClaim: "rail_eticket_boarding/original_valid_booking_id", journal: journalPath }));
}
try { await main(); } catch (error) {
  console.log(JSON.stringify({ status: "FAILED", reason: error instanceof Error ? error.message : "UNKNOWN",
    journal: journalPath })); process.exitCode = 1;
}
