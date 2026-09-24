# VPJ-07 #195: Hong Kong ECS Staging activation review

Status: repository preparation only. No worker container, key, provider call or shared
database write is authorized by this document. Keep #195 open through native and
provider acceptance. The operator stop switch is currently disabled.

## Observed starting point

Coordination thread's 2026-09-25 read-only Staging check of project
`dzqdzetcctkhbrhlxxgn`: hosted migration `20260923090000` exists; worker switch
`false`, zero heartbeats, ready work and leases; hosted RPC `EXECUTE` is denied to
anon/authenticated and granted to service_role. Three existing Qwen scopes are
enabled but expired; all have zero unresolved holds. Their related policies have
expired and reached their terms recheck dates, so **current valid consent is zero**.
This is a reported target observation, not a fresh database read by this worktree;
repeat it immediately before any write. Historic policies/consents are immutable
evidence and cannot be prolonged or silently reused.

| Cohort | Old scope and usage | Provider limit | Activation decision |
| --- | --- | --- | --- |
| S1 | CNY70m micros cap; CNY2,737,992 micros settled, no unresolved; expires 2026-09-14 | pinned Qwen; `qwen-public-upper-20260912-v1`; CNY7m micros/attempt | Candidate synthetic owner for first smoke only; leave old scope expired |
| S2 | CNY70m cap; CNY2,823,684 settled, no unresolved; expires 2026-09-14 | same model/version and CNY7m/attempt | Leave expired for first smoke |
| S3 | CNY10m cap; CNY64,986 settled, no unresolved; expires 2026-09-19 | different price version; CNY6.4m/attempt | Leave expired; does not fit the proposed CNY7m reserve |

The table uses stable anonymous labels, not owner or scope IDs. `m` above means
million micros, not CNY millions. Prior S1/S2 task limits are CNY21m micros and
three attempts, and concurrency is one; S3's are CNY7m, one attempt, concurrency
one. No existing row or spend is reset by this plan.

## Frozen first-slice profile for review

Only `current_input_v1`, one owner, one synthetic text Ask. Configure the
`vpj07-hosted-text-worker/1` profile with `pollIntervalMs=3000`,
`maxLifetimeMs=86400000`, `drainMs=45000`, `concurrency=1`, `groupLimit=1`,
`modes=["current_input_v1"]`. Bind the existing Beijing Qwen endpoint and the
pinned model `qwen3.7-plus-2026-05-26`; a new current policy must use that exact
endpoint. `groupLimit=1` is a throughput limit, **not** owner authorization.

For the initial S1 owner, use `priceVersion=qwen-public-upper-20260912-v1`
only if the newly reviewed provider limit matches exactly. Flat conservative
CNY6 per million input tokens and CNY24 per million output tokens are still
listed for the Beijing 256k–1m tier in the [current Qwen model page](https://help.aliyun.com/zh/model-studio/qwen3-7-plus).
Set `inputMicrosPerMillion=6000000`, `outputMicrosPerMillion=24000000`,
`cachedInputMicrosPerMillion=null`, `maxOutputTokens=1024`, `timeoutMs=60000`,
`reservedMicros=7000000`. The code's full-context bound is
`ceil((1048576×6000000 + 1024×24000000)/1000000)=6316032` micros; CNY7m
reserve covers it. Set a fresh nonsecret `configurationId` UUID and version 1.
This rate is a conservative ledger estimate, not a supplier invoice or a claim
that any discounted tier will be billed.

## Ordered actions and stop gates

1. **Policy and owner:** Review a new immutable bilingual Qwen notice for the
   actual path (Staging Supabase Singapore, worker Hong Kong, Beijing Qwen
   endpoint), recipient, retention and current terms. Insert a new short-lived
   `current_input_v1` policy only in an approved Staging write window; preserve
   old policies and notice hashes. Point only the intended Staging API setting
   to its new policy ID. The synthetic owner must read the new notice and accept
   it through the ordinary authenticated `accept_text_policy` path. Confirm one
   current consent by readback. No service-role insertion or old-consent copy.
2. **Budget:** Prefer a **new short-lived S1-only scope** to renewing S1's old
   CNY70m scope, whose remaining ledger capacity is about CNY67.262008. In a
   reviewed transaction with fresh owner/row/count guards, insert exactly one
   CNY scope: `limit_micros=7000000`, `task_limit_micros=7000000`,
   `task_attempt_limit=1`, `concurrency_limit=1`, `enabled=true`, `frozen=false`,
   expiry no more than 24 hours after activation. Insert one enabled Qwen
   provider limit for the pinned model and price version with
   `limit_micros=7000000`, `attempt_limit_micros=7000000`. Confirm the S1 owner
   has exactly one active matching scope, and S2/S3 still have none. Old task
   bindings, spent amounts and pending attempts remain untouched. The CNY7m
   ledger stop-loss is **not** an absolute bound on a supplier's bill after
   unknown or duplicate attempts; stop after the first synthetic terminal result.
3. **Keys and host:** Create one ECS-only Supabase `sb_secret_` key and one
   VP-v4 Beijing Qwen API key only after explicit account/permission authority.
   The Supabase key is independently revocable but still maps to project-wide
   `service_role` and bypasses RLS ([Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys));
   this is not a least-privilege database role. The new key requires the
   repository's apikey-only RPC header compatibility; a legacy service-role
   JWT is a separate fallback. For Qwen, choose the VP-v4 business space and,
   if available for this account, custom access to the pinned model and ECS
   egress IP only ([Alibaba Cloud API key guide](https://help.aliyun.com/zh/model-studio/get-api-key)).
   Transfer plaintext through an approved encrypted credential channel into
   ECS root-owned `/etc/visepanda/hosted-text-worker.env` mode 0600; never
   pass it through chat, source, shell arguments, logs or journal. Keep key
   inventory identifiers separately for rotation; do not print key values.
4. **Start while disabled:** Build and launch the reviewed main SHA on ECS with
   `ecs-worker.sh`, with SQL switch confirmed `false`. Read back container
   running/healthy (health `disabled`), new worker ID/build and fresh SQL
   heartbeat, with no ready claims, provider destination receipts, budget
   attempts or unexpected journal content. Failures: keep switch disabled,
   stop container, retain journal and investigate without retry storms.
5. **Single activation:** Confirm current policy/consent, the one active S1
   scope, zero unresolved attempts and the exact profile/endpoint. Submit one
   authorized synthetic Ask, then enable SQL switch in the approved Staging
   window. Observe one claim, one bounded Qwen destination/usage receipt,
   ledger settlement or explicitly pending unknown cost, terminal Turn and
   native owner readback. Verify another owner cannot read it. Stop switch
   immediately after the first result; do not expand modes or owners as part
   of this approval. A 401 only proves route reachability, not this outcome.
6. **Rollback/readback:** `set_hosted_worker_enabled(false, 'rollback #195')`
   first; verify disabled, then `ecs-worker.sh stop`. Preserve journal and
   pending holds at full reserve, compare the private per-group audit with
   the authorized ledger, and do not release unknown costs. Retain old scope,
   policy and consent history. Revoking a new key or deactivating the new scope
   is a separate reviewed action after checking other consumers. No migration
   down or Production change.

Before steps 1–5, re-read migration, switch, policy/consent, ready/leased
queue, all S1 scope candidates and unresolved attempts. Abort on drift,
ambiguous active scope, mismatched price/endpoint, stale heartbeat, key
incompatibility or missing owner consent. Codes merged, healthy SQL and a
synthetic fixture alone do not constitute #195 acceptance.

## Exact Staging write proposal (review only; not authorized to run)

The next transaction is deliberately unusable until the private UUIDs and
reviewed notice fields are filled through an approved operator channel.
Never paste those values or a credential into an Issue/PR/chat. First confirm
the project's backup/PITR status and record a private before-snapshot of the
affected S1 scope, provider limit, attempt aggregates, policy counts and
worker switch. Rehearse the transaction and rollback on a disposable database
at the same migration level. Main must approve the actual shared Staging write
window and the exact filled notice, owner, budget and expiry values.
Record the last completed managed backup and whether a restore point is
available; if backup state cannot be established, stop and resolve that
operator decision before the shared write.

The SQL inserts one new policy and scope; it does not alter or delete old
policy/consent/scope/attempt rows. The fixed S1 usage count and amount are
intentional compare-and-stop guards based on the coordination readback. If
either has changed, stop and review rather than editing the numbers to fit.

```sql
begin;
set local statement_timeout = '15s';
set local lock_timeout = '3s';

do $vpj07_activation$
declare
  v_owner uuid := '<S1_OWNER_UUID>'::uuid;
  v_old_scope uuid := '<S1_OLD_SCOPE_UUID>'::uuid;
  v_new_scope uuid := '<NEW_SCOPE_UUID>'::uuid;
  v_new_policy uuid := '<NEW_POLICY_UUID>'::uuid;
  v_expires timestamptz := '<APPROVED_EXPIRY_UTC>'::timestamptz;
  v_notice_zh text := '<REVIEWED_NOTICE_ZH>';
  v_notice_en text := '<REVIEWED_NOTICE_EN>';
  v_notice_hash text := '<REVIEWED_SHA256_HEX>';
  v_notice_version text := '<NEW_NOTICE_VERSION>';
  v_terms_version text := '<CURRENT_TERMS_VERSION>';
  v_recipient text := '<CURRENT_RECIPIENT_NAME>';
  v_source_region text := '<REVIEWED_SOURCE_REGION>';
  v_processing_region text := '<REVIEWED_PROCESSING_REGION>';
  v_storage_region text := '<REVIEWED_STORAGE_REGION>';
  v_old record;
begin
  if (select enabled from turn_private.hosted_worker_control where singleton) is distinct from false
    or (select count(*) from turn_private.hosted_worker_heartbeats
        where last_seen_at > clock_timestamp() - interval '1 minute') <> 0
    or (select count(*) from turn_private.work
        where state = 'queued' or (state = 'leased' and expires_at > clock_timestamp())) <> 0
    then raise exception 'WORKER_BASELINE_CHANGED'; end if;
  if v_expires <= clock_timestamp() + interval '30 minutes'
    or v_expires > clock_timestamp() + interval '24 hours'
    then raise exception 'EXPIRY_INVALID'; end if;
  if v_notice_hash <> encode(extensions.digest(
       convert_to(v_notice_zh || E'\n' || v_notice_en, 'UTF8'), 'sha256'), 'hex')
    then raise exception 'NOTICE_HASH_MISMATCH'; end if;
  if exists(select 1 from turn_private.text_policies
       where id = v_new_policy or notice_hash = v_notice_hash)
    or exists(select 1 from public.model_budget_scopes where id = v_new_scope)
    or (select count(*) from public.model_budget_scopes
        where owner_id = v_owner and enabled and not frozen and expires_at > clock_timestamp()) <> 0
    then raise exception 'POLICY_OR_SCOPE_AMBIGUOUS'; end if;
  select s.id, s.owner_id, s.currency, s.limit_micros, s.task_limit_micros,
      s.task_attempt_limit, s.concurrency_limit, s.enabled, s.frozen, s.expires_at,
      l.model, l.price_version, l.limit_micros as provider_limit,
      l.attempt_limit_micros, l.enabled as provider_enabled
    into v_old from public.model_budget_scopes s
    join public.model_budget_provider_limits l on l.scope_id = s.id and l.provider = 'qwen'
    where s.id = v_old_scope for update of s;
  if not found or v_old.owner_id <> v_owner or v_old.currency <> 'CNY'
    or v_old.limit_micros <> 70000000 or v_old.task_limit_micros <> 21000000
    or v_old.task_attempt_limit <> 3 or v_old.concurrency_limit <> 1
    or not v_old.enabled or v_old.frozen or v_old.expires_at > clock_timestamp()
    or v_old.model <> 'qwen3.7-plus-2026-05-26'
    or v_old.price_version <> 'qwen-public-upper-20260912-v1'
    or v_old.provider_limit <> 70000000 or v_old.attempt_limit_micros <> 7000000
    or not v_old.provider_enabled
    or (select count(*) from public.model_budget_attempts
        where scope_id = v_old_scope and status = 'settled') <> 242
    or (select coalesce(sum(actual_micros), 0) from public.model_budget_attempts
        where scope_id = v_old_scope and status = 'settled') <> 2737992
    or (select count(*) from public.model_budget_attempts
        where scope_id = v_old_scope and status in ('reserved','dispatched','pending')) <> 0
    then raise exception 'S1_BASELINE_CHANGED'; end if;

  insert into turn_private.text_policies(
    id, provider, recipient, endpoint, source_region, processing_region,
    storage_region, terms_version, notice_version, notice_hash, notice_zh,
    notice_en, retention, effective_at, expires_at, terms_recheck_at,
    context_mode)
  values(v_new_policy, 'qwen', v_recipient,
    'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    v_source_region, v_processing_region, v_storage_region, v_terms_version,
    v_notice_version, v_notice_hash, v_notice_zh, v_notice_en,
    'retain_after_hide_v1', clock_timestamp() - interval '1 minute',
    v_expires, v_expires, 'current_input_v1');
  insert into public.model_budget_scopes(
    id, owner_id, currency, limit_micros, task_limit_micros,
    task_attempt_limit, concurrency_limit, enabled, frozen, expires_at)
  values(v_new_scope, v_owner, 'CNY', 7000000, 7000000, 1, 1,
    true, false, v_expires);
  insert into public.model_budget_provider_limits(
    scope_id, provider, model, price_version, limit_micros,
    attempt_limit_micros, enabled)
  values(v_new_scope, 'qwen', 'qwen3.7-plus-2026-05-26',
    'qwen-public-upper-20260912-v1', 7000000, 7000000, true);
end $vpj07_activation$;
commit;
```

After commit, privately read back the new policy's notice hash, mode, endpoint
and expiry and the new scope/provider limits, owner, expiry and attempt count
(zero). Confirm the previous scopes and ledger aggregates are byte-identical
to the before-snapshot, the SQL switch is still false, and anon/authenticated
still cannot execute hosted RPCs. Do not set the Vercel policy env value or
request owner consent until these checks pass. A failed transaction is rolled
back by PostgreSQL; after a successful commit, rollback is a **forward**
operational stop: disable worker switch, stop ECS, and, if separately approved,
set only the new scope `enabled=false` and revoke only the new policy. Never
delete old rows, change historical attempt amounts or insert consent as admin.
