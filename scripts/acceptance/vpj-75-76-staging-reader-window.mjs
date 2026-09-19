// Toggle only the existing Staging publication read switch for this bounded
// VPJ-75/76 acceptance window. Never changes candidate/publication rows.
import { spawnSync } from "node:child_process";

const mode = process.argv[2];
if (!["--enable", "--disable"].includes(mode) || process.argv.length !== 3) throw new Error("MODE_REQUIRED");
const desired = mode === "--enable";
const expected = !desired;
const sql = `begin;
do $guard$ begin
  if (select count(*) from supabase_migrations.schema_migrations) <> 61
    or (select count(*) from auth.users) <> 9
    or (select count(*) from public.trips) <> 3
    or (select md5(coalesce(string_agg(md5(row_to_json(t)::text),'' order by id),'')) from public.trips t) <> 'df58483b35f0002eb3bb9a9e829c8198'
    or (select count(*) from knowledge_review_private.members where active) <> 2
    or (select enabled from knowledge_review_private.settings) is distinct from true
    or (select enabled from knowledge_review_private.publication_settings) is distinct from ${expected}
    or (select count(*) from knowledge_review_private.publications) < 27
  then raise exception 'READER_WINDOW_BASELINE_CHANGED'; end if;
end $guard$;
update knowledge_review_private.publication_settings set enabled=${desired} where singleton=true and enabled=${expected};
commit;
select enabled from knowledge_review_private.publication_settings where singleton=true;`;
const call = spawnSync("supabase", ["db", "query", "--linked", "--project-ref",
  "dzqdzetcctkhbrhlxxgn", sql, "--output-format", "json"],
  { encoding: "utf8", timeout: 30000, maxBuffer: 1024 * 1024 });
if (call.status !== 0) {
  let code = "READER_WINDOW_QUERY_FAILED";
  try { code = JSON.parse(call.stdout).error?.code || code; } catch { /* safe summary */ }
  throw new Error(code);
}
const row = JSON.parse(call.stdout).rows?.[0];
if (row?.enabled !== desired) throw new Error("ACK_UNKNOWN_VERIFY_REMOTE_STATE");
console.log(JSON.stringify({ project: "dzqdzetcctkhbrhlxxgn", publicationReadEnabled: desired,
  scope: "existing reviewed, current, non-revoked facts; exact Staging acceptance window" }));
