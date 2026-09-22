// Install one short-lived, truthful Qwen C2 policy on the pinned Staging
// project. This does not create consent or enable any deployed route.
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const project = "dzqdzetcctkhbrhlxxgn";
const notice = JSON.parse(readFileSync("docs/policy/vpj75-76-staging-qwen-notice-20260919.json", "utf8"));
const quote = text => `'${String(text).replaceAll("'", "''")}'`;
const noticeHash = createHash("sha256").update(`${notice.noticeZh}\n${notice.noticeEn}`).digest("hex");
const id = randomUUID();
const now = Date.now();
const effectiveAt = new Date(now - 60_000).toISOString();
const expiresAt = new Date(now + 6 * 60 * 60_000).toISOString();
const termsRecheckAt = new Date(now + 6 * 60 * 60_000).toISOString();
if (process.argv.length !== 2 || notice.provider !== "qwen"
  || notice.endpoint !== "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
  || notice.noticeZh.length > 8000 || notice.noticeEn.length > 8000
  || ["recipient", "sourceRegion", "processingRegion", "storageRegion"].some(k => notice[k].length > 200)) throw new Error("NOTICE_INVALID");
const sql = `begin;
  do $guard$ begin
    if (select count(*) from supabase_migrations.schema_migrations) <> 61
      or (select count(*) from auth.users) <> 9
      or (select count(*) from public.trips) <> 3
      or (select count(*) from turn_private.text_policies
          where context_mode='knowledge_intent_v1' and revoked_at is null
            and effective_at<=clock_timestamp() and expires_at>clock_timestamp()
            and terms_recheck_at>clock_timestamp()) <> 0
    then raise exception 'POLICY_BASELINE_CHANGED'; end if;
  end $guard$;
  insert into turn_private.text_policies(
    id,provider,recipient,endpoint,source_region,processing_region,storage_region,
    terms_version,notice_version,notice_hash,notice_zh,notice_en,retention,
    effective_at,expires_at,terms_recheck_at,context_mode)
  values(${quote(id)}::uuid,${quote(notice.provider)},${quote(notice.recipient)},
    ${quote(notice.endpoint)},${quote(notice.sourceRegion)},${quote(notice.processingRegion)},
    ${quote(notice.storageRegion)},${quote(notice.termsVersion)},${quote(notice.noticeVersion)},
    ${quote(noticeHash)},${quote(notice.noticeZh)},${quote(notice.noticeEn)},
    'retain_after_hide_v1',${quote(effectiveAt)}::timestamptz,
    ${quote(expiresAt)}::timestamptz,${quote(termsRecheckAt)}::timestamptz,
    'knowledge_intent_v1');
  commit;
  select id,provider,context_mode,notice_version,notice_hash,expires_at
    from turn_private.text_policies where id=${quote(id)}::uuid;`;
const result = spawnSync("supabase", ["db", "query", "--linked", "--project-ref", project,
  sql, "--output-format", "json"], { encoding: "utf8", timeout: 30000, maxBuffer: 1024 * 1024 });
if (result.status !== 0) {
  let code = "POLICY_QUERY_FAILED";
  try { code = JSON.parse(result.stdout).error?.code || code; } catch { /* safe summary only */ }
  throw new Error(code);
}
const rows = JSON.parse(result.stdout).rows;
if (!Array.isArray(rows) || rows.length !== 1 || rows[0].id !== id
  || rows[0].notice_hash !== noticeHash) throw new Error("ACK_UNKNOWN_VERIFY_REMOTE_STATE");
console.log(JSON.stringify({ status: "STAGING_POLICY_INSTALLED", project, policyId: id,
  provider: notice.provider, noticeVersion: notice.noticeVersion, noticeHash,
  effectiveAt, expiresAt, consentCreated: false, deploymentEnabled: false }));
