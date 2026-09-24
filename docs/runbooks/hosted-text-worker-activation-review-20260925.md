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

2026-09-25 target ECS readback: the 40 GiB ESSD Entry system disk is
**unencrypted**, with zero disk snapshots and zero automatic snapshot
policies. A root-path `/` **file-level** backup version completed at
2026-09-25 01:51:07, expires 2026-10-25 01:51:07, and offers Browse/Restore;
the UI's ongoing "备份中" label is a backup-service state, not a failed
version. This does not establish a bootable disk restore, backup encryption,
or whether future key/journal files would be included. ECS is pay-as-you-go,
with 100 Mbps peak public bandwidth billed by traffic. Its current public IP
is instance-assigned, not an EIP (the console offers conversion). `/run` is
tmpfs, current swap is empty, current shell core limit is zero, while Docker
root and the existing journal mount resolve to the unencrypted root ext4.
No real key or worker container is present. Re-read these facts before action.
The target Supabase `Settings → API Keys` UI exposes an enabled `New secret
key` form with name and optional description; it was closed without submit.
This proves the current account can reach the creation UI, not that a new
key has been granted or shown.

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
   Beijing Qwen API key only after a storage plan and explicit
   account/permission authority.
   The Supabase key is independently revocable but still maps to project-wide
   `service_role` and bypasses RLS ([Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys));
   this is not a least-privilege database role. The new key requires the
   repository's apikey-only RPC header compatibility; a legacy service-role
   JWT is a separate fallback. The target Qwen UI currently selects the
   Beijing **default business space**. `VP-v4` labels an existing key there;
   it is not an observed independent workspace. A new key's "Custom"
   permission form defaults to public IPv4 `0.0.0.0/0` and IPv6 `::/0`;
   both must be removed for a narrow whitelist. The model list visibly
   offers `Qwen3.7-Plus`, but exact snapshot-only access to
   `qwen3.7-plus-2026-05-26` is **unverified**. Do not claim it until a
   readback or controlled denial check establishes the granularity
   ([Alibaba Cloud API key guide](https://help.aliyun.com/zh/model-studio/get-api-key)).
   A separate Beijing sub-workspace could limit model permissions, but its
   creation, model authorization, endpoint/policy change and costs are a
   separate reviewed decision; the current default space cannot set
   workspace-level model limits
   ([permission management](https://help.aliyun.com/zh/model-studio/permission-management-overview)).
   For one short smoke, prefer the verified current ECS egress IP as a `/32`
   only after readback. Ordinary stop on the same instance can retain the
   instance-assigned IP, while savings stop, zero bandwidth or instance
   release can replace it. Before/after every stop or disk replacement,
   re-read egress IP; a mismatch keeps SQL disabled and requires whitelist
   update/key rotation before any call. EIP conversion is a separate,
   potentially billable and irreversible choice
   ([ECS IP lifecycle](https://help.aliyun.com/zh/ecs/user-guide/ip-address/),
   [EIP conversion](https://help.aliyun.com/zh/ecs/user-guide/convert-the-public-ip-address-of-an-instance-in-a-vpc-to-an-eip)).
   Subject to target-account UI verification and main approval, configure
   a **CNY7 monthly per-key Qwen budget with immediate stop** (optional 80%
   notification) as a second stop-loss beside the shared-ledger CNY7 scope.
   Alibaba documents an enforcement delay and charges during it, so this is
   not an absolute supplier-bill cap; a budget 429 must stop new claims via
   the SQL switch and retain unknown holds for reconciliation
   ([budget management](https://help.aliyun.com/zh/model-studio/budget-management)).
   Never pass plaintext through chat, source, shell arguments, logs or
   journal. Keep key inventory identifiers separately for rotation; do not
   print key values. The `/etc` handoff below applies **only after A has an
   encrypted disk**. Main has selected B as the first synthetic-only
   candidate; B requires a separate reviewed file-secret implementation
   and `/run` handoff before any real key can be transferred.
4. **Start while disabled:** After the selected storage route is implemented
   and reviewed, build the reviewed main SHA. A may use the current
   `ecs-worker.sh` on an encrypted disk; B must use its future file-secret
   entrypoint/script, never the current `--env-file`. Keep SQL switch
   confirmed `false`. Read back container
   running/healthy (health `disabled`), new worker ID/build and fresh SQL
   heartbeat, with no ready claims, provider destination receipts, budget
   attempts or unexpected journal content. Failures: keep switch disabled,
   stop container, retain journal and investigate without retry storms.
5. **Single activation:** Confirm S1 has exactly one current unrevoked Qwen
   policy/consent pair and it is the new policy, the one active S1 scope,
   zero unresolved attempts and the exact profile/endpoint. Submit one
   authorized synthetic Ask. Immediately before enabling, recheck that
   policy/consent pair and read back **exactly one** ready
   row globally and confirm its `text_content.owner_id` and `policy_id` match
   the reviewed S1 owner and new policy; leased must remain zero. Then enable
   SQL switch in the approved Staging
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

Before database writes and container start, re-read migration, switch,
policy/consent, zero ready/leased queue, all S1 scope candidates and
unresolved attempts. After the deliberate synthetic Ask, the expected queue
state changes to exactly one S1/new-policy ready row and zero leased; any
other change is drift. Abort on drift,
ambiguous active scope, mismatched price/endpoint, stale heartbeat, key
incompatibility or missing owner consent. Codes merged, healthy SQL and a
synthetic fixture alone do not constitute #195 acceptance.

## Host storage and IP decision before any real key

**A1 — encrypted system disk (preferred durable path).** Alibaba says an
existing unencrypted disk cannot be encrypted in place. First record the
completed file backup, then create and verify a **manual system-disk
snapshot** as a separate boot-level rollback source; the current file-level
version alone is not a bootable system image. Create a custom image of this
instance, make an encrypted copy with the ECS service key, and replace this
same instance's system disk from that encrypted image during an approved
ordinary-stop window. The old system disk is released and its bytes cannot
be recovered without a prepared snapshot. Alibaba estimates about ten
minutes for OS replacement and states same-instance IP remains unchanged,
but verify disk encryption, boot, SSH/Workbench, Docker, image, journal and
actual egress IP on the new system before any key. Keep the old snapshot/image
until rollback/readback is accepted; reverting by creating another disk or
image is a new reviewed action, not in-place decryption. The managed ECS
service key gives basic disk encryption without an additional encryption
feature/key usage fee; a customer-managed KMS key may require
`AliyunECSDiskEncryptDefaultRole` and paid KMS capacity. Snapshot, custom
image storage, extra disk and any parallel instance/storage **may incur
charges**; their Hong Kong quote and retention period must be read from the
target console before action. Do not infer zero cost from the service key.
Sources: [ECS encryption and conversion](https://help.aliyun.com/zh/ecs/user-guide/encryption-overview/),
[OS replacement and data loss](https://help.aliyun.com/zh/ecs/user-guide/replace-the-operating-system-of-an-instance-1),
[snapshot billing](https://help.aliyun.com/zh/ecs/snapshots-1).

**A2 — new encrypted data disk (alternative).** A separately created encrypted
ESSD disk could hold `/etc/visepanda`, Docker's data root and the persistent
journal after a reviewed migration and Docker restart. It leaves the original
system disk unencrypted, so logs, temporary files, core dumps and any other
secret-bearing path must be audited before acceptance. It adds a disk and
backup cost, and is not an automatic replacement for A1. A new encrypted
ECS instance from the copied image is another option but adds parallel
compute and network cutover; the present instance-assigned public IP would
not automatically follow it. Neither alternative is authorized here.

**B — existing-resource tmpfs only (main's preferred first synthetic-smoke
candidate, not current runtime or execution authority).** `/run` is tmpfs
and swap is currently empty. On this target ECS,
a synthetic `--env-file` container exposed its canary in `docker inspect`
and `/var/lib/docker/containers/<id>` on the unencrypted root. A synthetic
read-only `/run` bind mount, with no secret passed as Docker env or argument,
ran successfully with no canary in that container's inspected Env, container
metadata or logs. Both synthetic containers and files were removed. This
is limited evidence: it does not cover cloud backend logs or a future worker
entrypoint. The merged worker still **requires environment keys at start**;
B needs a separate reviewed file-secret loader, tests, core/swap/log audit,
and a host/container restart rehearsal. `/run` disappears on host reboot:
without fresh private key injection the worker must stay stopped and SQL
disabled, so unattended reboot recovery is unavailable.

The current journal is different: it fsyncs owner/policy/turn/attempt/scope
IDs, destination and cost metadata to root-owned 0700 storage on the
unencrypted system disk. It contains no question, answer or key and the
contract treats it as private trusted-operator evidence; no repo rule
explicitly mandates at-rest encryption for this journal. These are C1
account/operational identifiers, however, not public C0 data. Host root
access, disk/snapshot exposure, and the completed 30-day file-level backup
create residual read/retention risk that mode 0700 alone does not remove.
Moving the journal to tmpfs would violate its crash/reboot recovery contract;
do not do so. Main may separately accept B's residual risk for one bounded
**S1-only synthetic Staging** smoke with documented backup/deletion limits,
but B cannot be described as fully encrypted storage or production-ready. If a
reviewed journal at-rest requirement or real-user data is introduced, B
stops until an encrypted persistent volume or reviewed encrypted-journal
design exists ([data classes](../policy/data-classes.md),
[worker journal contract](../contracts/vpj-07.md#hosted-resident-text-worker)).

The completed `/` file-backup version is file-level and does not satisfy the
system-disk snapshot gate in A1. Alibaba bills file backup by backed-up
block-storage capacity after a successful version and documents a shared
100 GiB account allowance; the target account's cross-region usage, backup
encryption and future key/journal inclusion are **unverified**, so no zero-cost
or restore claim follows ([file-backup billing](https://help.aliyun.com/zh/cloud-backup/product-overview/billing-methods-and-billable-items),
[backup comparison](https://help.aliyun.com/zh/ecs/user-guide/select-the-appropriate-ecs-data-protection-scheme-snapshot-and-file-backup-essential-edition)).

### Private one-time key handoff on the available surfaces

**A-only procedure below. Do not write `/etc/visepanda` on the currently
unencrypted ECS.** The B candidate needs the next PR's file-secret loader
and `/run`-specific handoff, tested again with synthetic values before any
real key. The browser-to-Workbench in-memory transfer technique itself was
tested, but does not make an unencrypted destination safe.

The b446 in-app browser reaches the signed-in target Supabase project and
Alibaba ECS/Model Studio pages. Using the official ECS Workbench URL, this
session also connected to the selected Hong Kong ECS as root. A synthetic
browser DOM token was kept only in a browser-runtime memory variable and
passed to Workbench's `read -s` prompt via `wbTab.cua.type({text: token})`;
no token appeared in the visible terminal DOM, `history | tail` contained
only variable-name commands, and the temporary file was root:root 0600.
The synthetic `/tmp/vpj07-browser-synthetic` file and directory were removed
and their absence checked. This verifies the current toolchain's visible
output and shell-history behavior; it does **not** prove that Alibaba,
Supabase or Codex infrastructure keeps no internal audit logs. The agent
must not claim secret zeroization from clearing a JavaScript reference.

The agent-assisted path is preferred **only after main authorizes each real
key's creation, account scope and transfer to this ECS at action time**.
Browser confirmation policy may require JT to take over the final credential
creation step; main coordinates that handoff. The agent must not open a key
reveal/copy screen, read an actual value or write `/etc/visepanda` until that
specific action is authorized. During real key display, never request a
screenshot or full DOM snapshot, and never emit the value via `nodeRepl.write`,
console, chat, PR, shell command text or tool result. If the official UI's
one-time value cannot be read through a narrow, verified locator or browser
clipboard into a private browser-runtime variable without emitting it,
stop and use the manual fallback below.

1. Before key creation, after the host preparation action is authorized,
   prepare only the ECS target path in the already connected Workbench root
   shell. Confirm disk and backup encryption first; mode 0600 alone does not
   encrypt an unencrypted disk or snapshot.

   ```bash
   umask 077
   install -d -o root -g root -m 0700 /etc/visepanda
   install -o root -g root -m 0600 /dev/null /etc/visepanda/hosted-text-worker.env
   ```

2. In the target Staging Supabase project's official UI, create one
   separately named ECS-only `sb_secret_` key. In the VP-v4 Beijing
   business space, create one separate Qwen key with the pinned model and
   verified fixed ECS egress IP restrictions if available. The old masked
   Qwen key is not recoverable or copied. Keep only key labels/IDs in the
   rotation inventory, never values. Do not create either key until main
   approves that specific security-sensitive access.
3. For each key, **first** put the Workbench root shell at Bash's hidden
   `read` prompt. Then hold the official UI's value in a short-lived
   browser-runtime variable with a narrow read (or the official Copy action
   followed by `tab.clipboard.readText()`); never output the value. Type that
   variable into the focused Workbench prompt, press Enter, then use Bash's
   built-in `printf` with a variable reference, not a literal value or an
   external process argument. Do not batch commands after `read` into the
   same terminal paste; a pending `read` could consume the next command as
   its input. Repeat separately for the Supabase and Qwen keys:

   ```bash
   # Stage A: execute, then wait until the hidden prompt is visible.
   IFS= read -r -s -p 'Supabase ECS key: ' vp_db_key
   # Stage B: browser types its in-memory key variable and presses Enter.
   # Stage C: execute only after Bash returns to its normal prompt.
   [[ "$vp_db_key" == sb_secret_?* ]] && printf 'VISEPANDA_HOSTED_WORKER_DB_KEY=%s\n' "$vp_db_key" >> /etc/visepanda/hosted-text-worker.env
   unset vp_db_key
   # Repeat A/B/C with vp_qwen_key and VISEPANDA_HOSTED_WORKER_QWEN_KEY;
   # require [[ -n "$vp_qwen_key" ]] before writing, then unset it.
   ```

   The actual browser call uses `wbTab.cua.type({text: secretValue})` where
   `secretValue` is already in memory; the tool code contains only that
   variable name. After each transfer, clear the browser clipboard if used,
   reassign the session variable to an empty string, and close the reveal
   view without a screenshot. This removes readily accessible copies, not
   provider-side logs or every memory remnant.
4. Store the **operational** copies only in the verified encrypted ECS
   volume at root-owned mode 0600. If an independent recoverable backup is
   required, JT may privately save each one-time value in a separate macOS
   login Keychain item. A synthetic item proved that the final `-w` prompts
   twice without terminal echo; `-T ""` suppresses default app trust and
   `-U` should be omitted to avoid overwriting an existing item:

   ```bash
   security add-generic-password -a vpj07-staging-ecs -s vpj07-staging-supabase-secret -T "" -w
   security add-generic-password -a vpj07-staging-ecs -s vpj07-staging-qwen-key -T "" -w
   ```

   This Keychain step is a JT-only fallback, coordinated through main. If
   backup cannot be made safely, document that the ECS file is the sole
   operational copy and plan revocation/reissue if it is lost. No agent
   should retrieve Keychain values into chat or terminal output.
5. With no key visible in the UI, verify **only** existence and permissions
   in Workbench; do not use `cat`, `head`, shell tracing, `docker inspect`
   environment output or a `grep` that prints a line:

   ```bash
   stat -c '%U:%G %a' /etc/visepanda/hosted-text-worker.env
   grep -Eq '^VISEPANDA_HOSTED_WORKER_DB_KEY=.+$' /etc/visepanda/hosted-text-worker.env && echo 'DB key present'
   grep -Eq '^VISEPANDA_HOSTED_WORKER_QWEN_KEY=.+$' /etc/visepanda/hosted-text-worker.env && echo 'Qwen key present'
   bash /opt/vp-v4/deploy/hosted-worker/ecs-worker.sh preflight
   ```

   Add the reviewed nonsecret profile and worker flag before preflight;
   the SQL switch remains disabled. The presence checks do not establish
   key validity. If a one-time read, transfer, file permission, encryption
   or preflight check fails, keep SQL disabled and the container stopped;
   revoke the new keys in their official dashboards, remove the partial env
   file, clear clipboard/session references and review the cause before
   issuing replacements. Removing a file is not proof its bytes vanished
   from cloud snapshots; revocation is the primary containment step.

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
    or exists(select 1 from turn_private.text_consents c
        join turn_private.text_policies p on p.id = c.policy_id
        where c.owner_id = v_owner and c.revoked_at is null
          and p.provider = 'qwen' and p.revoked_at is null
          and p.effective_at <= clock_timestamp()
          and p.expires_at > clock_timestamp()
          and p.terms_recheck_at > clock_timestamp())
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
    where s.id = v_old_scope for update of s, l;
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
