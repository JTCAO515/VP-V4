// Exact, one-transaction Staging migration package for VPJ-75 / VPJ-76.
// The official Supabase CLI's Management API connection is used because this
// host's direct CLI TCP path terminates before migration comparison. The
// existing repository SQL is applied byte-for-byte and its version/name is
// inserted into Supabase's migration history in the same transaction.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const project = "dzqdzetcctkhbrhlxxgn";
const expectedHead = "2370391f28fc43822be8458f7c6ecb0fc7ddc549";
const backup = "/Users/jtsm5p/.codex/secure-backups/vpj-75-76-staging/20260919T073953Z-87d3a1dc.dump.age";
const identity = "/Users/jtsm5p/.codex/secure-backups/vpj-75-76-staging/20260919T073953Z-87d3a1dc.agekey";
const backupDigest = "b820c34016455b309d7ead9b40824aafc7e12d22cc614b970b4c5761f6cf975b";
const files = [
  "20260914110000_vpj_75_359_wiki_schema.sql",
  "20260914120000_vpj_75_359_wiki_dispatcher.sql",
  "20260914130000_vpj_75_wiki_draft_content.sql",
  "20260914140000_vpj_75_wiki_statement_review.sql",
  "20260914150000_vpj_75_wiki_statement_proposals.sql",
  "20260915180000_vpj_75_wiki_job_reclaim.sql",
  "20260915190000_vpj_76_360_grounded_ai_assist_context.sql",
  "20260915200000_vpj_76_360_grounded_ai_assist_jobs.sql",
  "20260916120000_vpj_75_359_wiki_source_withdrawal.sql",
  "20260917100000_vpj_75_359_wiki_read_withdrawal_status.sql",
  "20260917110000_vpj_75_359_wiki_withdrawal_scan.sql",
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 120000, maxBuffer: 1024 * 1024, ...options });
  if (result.status !== 0) {
    let code = "COMMAND_FAILED";
    try { code = JSON.parse(result.stdout).error?.code || code; } catch { /* keep sanitized code */ }
    throw new Error(code);
  }
  return result.stdout;
}

const mode = process.argv[2];
if (!(["--dry-run", "--apply"].includes(mode)) || process.argv.length !== 3) throw new Error("MODE_REQUIRED");
if (run("git", ["rev-parse", "HEAD"]).trim() !== expectedHead) throw new Error("HEAD_CHANGED");
if (statSync(backup).mode & 0o077 || statSync(identity).mode & 0o077) throw new Error("BACKUP_PERMISSIONS_CHANGED");
if (createHash("sha256").update(readFileSync(backup)).digest("hex") !== backupDigest) throw new Error("BACKUP_CHANGED");

const before = `do $baseline$
begin
  if (select count(*) from supabase_migrations.schema_migrations) <> 50
    or (select max(version) from supabase_migrations.schema_migrations) <> '20260914090000'
    or to_regclass('knowledge_review_private.wiki_pages') is not null
    or to_regprocedure('public.ops_wiki_generation_v1(jsonb)') is not null
    or (select enabled from knowledge_review_private.settings limit 1) is distinct from false
    or (select enabled from knowledge_review_private.publication_settings limit 1) is distinct from false
    or (select count(*) from knowledge_review_private.members where active) <> 0
    or (select count(*) from auth.users) <> 7
    or (select count(*) from public.trips) <> 3
    or (select count(*) from knowledge_review_private.source_revisions) <> 24
    or (select count(*) from knowledge_review_private.publications) <> 27
  then raise exception 'BASELINE_CHANGED'; end if;
end $baseline$;`;
const after = `do $verified$
begin
  if (select count(*) from supabase_migrations.schema_migrations) <> 61
    or (select count(*) from supabase_migrations.schema_migrations where version in (${files.map(f => `'${f.slice(0, 14)}'`).join(",")})) <> 11
    or to_regclass('knowledge_review_private.wiki_pages') is null
    or to_regprocedure('public.ops_wiki_generation_v1(jsonb)') is null
    or to_regprocedure('public.ops_source_revision_withdraw_v1(jsonb)') is null
    or to_regprocedure('public.grounded_ai_assist_work_v1(jsonb)') is null
    or (select md5(coalesce(string_agg(md5(row_to_json(u)::text),'' order by id),'')) from auth.users u) <> '366440bcaa3cbc6a439a23a0109e2826'
    or (select md5(coalesce(string_agg(md5(row_to_json(t)::text),'' order by id),'')) from public.trips t) <> 'df58483b35f0002eb3bb9a9e829c8198'
    or (select md5(coalesce(string_agg(md5(row_to_json(p)::text),'' order by candidate_id),'')) from knowledge_review_private.publications p) <> '72f7a019ea83b676093ae0bd10da4b04'
    or (select md5(coalesce(string_agg(md5((row_to_json(s)::jsonb - 'withdrawn_at' - 'withdrawn_by' - 'withdrawal_reason')::text),'' order by id),'')) from knowledge_review_private.source_revisions s) <> '39736e1628af77eb574e38c934888dca'
  then raise exception 'POST_MIGRATION_INVARIANT_FAILED'; end if;
end $verified$;`;
const statements = files.map(file => {
  const match = /^(\d{14})_([a-z0-9_]+)\.sql$/.exec(file);
  if (!match) throw new Error("MIGRATION_NAME_INVALID");
  const sql = readFileSync(join("supabase", "migrations", file), "utf8");
  return `${sql}\ninsert into supabase_migrations.schema_migrations(version,name) values('${match[1]}','${match[2]}');`;
});
const query = ["begin;", "set local statement_timeout='120s';", before, ...statements, after,
  mode === "--dry-run" ? "rollback; select 'DRY_RUN_ROLLED_BACK' as result;" : "commit; select 'MIGRATIONS_APPLIED' as result;"].join("\n");
const response = JSON.parse(run("supabase", ["db", "query", "--linked", "--project-ref", project, query, "--output-format", "json"]));
const expectedResult = mode === "--dry-run" ? "DRY_RUN_ROLLED_BACK" : "MIGRATIONS_APPLIED";
if (response.rows?.[0]?.result !== expectedResult) throw new Error("ACK_UNKNOWN_VERIFY_REMOTE_STATE");
console.log(JSON.stringify({ project, head: expectedHead.slice(0, 7), migrationCount: files.length,
  backupSha256: backupDigest, result: expectedResult }));
