// Real Ops intake of a new original editorial synopsis of an official museum
// notice. The candidate remains pending; publication still requires another
// authenticated member's review and the separate publication operation.
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { requestFactory, STAGING } from "../db/vpj-02-verification-core.mjs";

const directory = "/Users/jtsm5p/.codex/secure-backups/vpj-75-76-staging";
const identity = join(directory, "20260919T073953Z-87d3a1dc.agekey");
const actorsPath = join(directory, "ops-actors-20260919.age");
const journalPath = join(directory, "museum-source-intake-20260919.age");
const declaration = {
  sourceKey: "cq-museum", revisionLabel: "20260919-entry-crowd-ops-v1",
  publisher: "重庆中国三峡博物馆 / Chongqing China Three Gorges Museum",
  uri: "https://www.3gmuseum.cn/web/article/1430010139317059584/web/content_1430010139317059584.html",
  locator: "Notice dated 2025-09-30, first two substantive paragraphs",
  snippet: "Original editorial synopsis (not a quotation): In Chongqing, the China Three Gorges Museum notice says its main museum and affiliated sites waive advance reservations from 1 October 2025. The Song Qingling Memorial Hall and Baiheliang Underwater Museum still require tickets, and visitors need valid identity documents; check current crowd notices.",
  usageDeclaration: "Original editorial factual synopsis and citation metadata only; not a source quotation or official translation. No blanket licence, raw-page, media, corpus, embedding or TTS permission is asserted. Public accessibility is not a licence.",
};
const statement = {
  schemaVersion: "knowledge-statement/1",
  assertion: { subjectId: "chongqing_museum_subsidiary_entry", predicate: "requires_action",
    objectId: "obtain_ticket_for_named_subsidiary",
    conditions: ["song_qingling_or_baiheliang"], exclusions: ["no_other_site_inference"] },
  scope: { cities: ["chongqing"], scene: "attraction", audience: "international_independent_traveler" },
  expressions: {
    zh: { text: "重庆宋庆龄纪念馆和白鹤梁水下博物馆免预约，但仍需购票入馆。",
      conditions: ["仅针对公告列出的这两处附属场馆。"], exclusions: ["不据此推断其他场馆的票务规则。"] },
    en: { text: "The Song Qingling Memorial Hall and Baiheliang Underwater Museum waive advance reservations but still require tickets.",
      conditions: ["Only for these two affiliated sites named in the notice."],
      exclusions: ["This does not establish ticket rules for other sites."] },
  },
  sources: [declaration],
};

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
  const temp = `${journalPath}.${randomUUID()}.pending`;
  writeFileSync(temp, sealed.stdout, { mode: 0o600, flag: "wx" }); renameSync(temp, journalPath);
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
function db(sql) {
  const result = cli(["db", "query", "--linked", "--project-ref", STAGING, `begin read only; ${sql}; rollback;`]);
  if (!Array.isArray(result.rows)) throw new Error("QUERY_FAILED");
  return result.rows;
}
async function main() {
  if (process.argv.length !== 2) throw new Error("NO_ARGUMENTS_ALLOWED");
  const actors = readEncrypted(actorsPath);
  if (!actors.opsEnabled || actors.project !== STAGING || actors.users?.length !== 2) throw new Error("OPS_JOURNAL_INVALID");
  const existing = db(`select id from knowledge_review_private.source_revisions where source_key='${declaration.sourceKey}' and revision_label='${declaration.revisionLabel}'`);
  if (existing.length) throw new Error("SOURCE_ALREADY_EXISTS");
  const author = actors.users[0];
  const request = requestFactory(keyring());
  const login = await request("/auth/v1/token?grant_type=password", { method: "POST",
    body: { email: author.email, password: author.password } });
  if (login.status !== 200 || login.body?.user?.id !== author.id) throw new Error("AUTHOR_LOGIN_FAILED");
  const input = { action: "submit_statement", operationId: randomUUID(), candidateId: randomUUID(),
    title: "2026-09-19 Staging editorial intake: museum subsidiary tickets", statement };
  const journal = { project: STAGING, declaration, input, phase: "before_submit" };
  saveEncrypted(journal);
  const submitted = await request("/rest/v1/rpc/ops_review_workspace", { method: "POST",
    token: login.body.access_token, body: { p_input: input } });
  if (submitted.status !== 200 || submitted.body?.error) throw new Error("SUBMIT_FAILED_VERIFY_RECEIPT");
  journal.result = submitted.body; journal.phase = "submitted"; saveEncrypted(journal);
  const rows = db(`select id,snippet_hash,withdrawn_at from knowledge_review_private.source_revisions where source_key='${declaration.sourceKey}' and revision_label='${declaration.revisionLabel}'`);
  if (rows.length !== 1 || rows[0].withdrawn_at !== null) throw new Error("SOURCE_READBACK_FAILED");
  journal.sourceRevisionId = rows[0].id; journal.phase = "source_readback"; saveEncrypted(journal);
  console.log(JSON.stringify({ status: "REAL_OPS_SOURCE_INTAKE_PASS", project: STAGING,
    sourceKey: declaration.sourceKey, revisionLabel: declaration.revisionLabel,
    sourceRevisionId: rows[0].id, candidateId: input.candidateId,
    candidateKind: submitted.body?.kind ?? null, journal: journalPath }));
}
try { await main(); } catch (error) {
  console.log(JSON.stringify({ status: "FAILED", reason: error instanceof Error ? error.message : "UNKNOWN",
    journal: journalPath })); process.exitCode = 1;
}
