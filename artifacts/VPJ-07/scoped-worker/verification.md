# Scoped native text worker binding

Related to #195, integrated into the single PR325 after170e27f. No remote activation.
The previous global claimer could take an unrelated queue item before selecting its owner budget.
The new service-only `claim_text_work(owner,policy)` filters the selected owner/policy before lease
mutation. The bounded server HTTP adapter binds that policy and budget to the existing worker.
No service credential is loaded automatically or exposed through a user route.

## Executed evidence (2026-09-11)

- `VP_TURN_DB_TEST=1 node --experimental-strip-types --test tests/integration/turn/text-work.test.mjs tests/integration/turn/durable-work.test.mjs`:
  28pass/0fail/0skip,172.6s. Real disposable network-isolated PostgreSQL with all application SQL.
  Existing policy/text/Turn/leased-work snapshot preserved across the new migration; ordinary roles
  cannot execute the capability. Other owner/policy/metadata work stays byte-identical. Concurrent
  scoped/global claimers, expiry/recovery, old-token rejection, one terminal, real cancellation,
  withdrawal, actual policy expiry, hiding, deletion lock rollback and worker process SIGKILL pass.
  Revoking the new service EXECUTE grant stops claims without changing retained data; regrant only
  restores this disposable test capability. Production rollback was not executed.
- `node --experimental-strip-types --test tests/security/turn/scoped-text-worker.test.mjs`:
  8pass/0fail/0skip. Owner/policy/budget snapshot binding, wrong destination/config shape, missing
  credential, deployed-environment/pre-abort rejection, substituted claim/policy, manual redirect,
  oversize/invalid UTF-8, pending credential/claim/body cancellation and unknown completion ack.
- `node tests/integration/turn/run-native-http.mjs`:1pass/0fail/0skip,10.9s final test process.
  Real disposable GoTrue/PostgREST/Next API now uses the composed one-shot job, scoped worker and allowlisted provider
  HTTP transport through a closed test destination mapper. Explicit consent, duplicate submit, worker final-answer reload,
  cancellation, withdrawal, cross-owner read denial and native replacement pass. Three destination
  metadata hooks and synthetic integer-fee settlement are asserted. The model endpoint
  is controlled loopback synthetic HTTP; this does not establish a real recipient or semantic quality.
- Dedicated one-shot job and CLI security plus scoped-worker tests:12pass/0fail/0skip.
  Missing activation/credentials/config, existing receipt files and unqualified providers fail closed.
  Receipt mode0600 and secret-canary absence pass. Fee tests cover actual integer settlement,
  incomplete cache usage, full-context input/output/cache upper bounds, overflow and ceil arithmetic.
  No credential or network access occurs for insufficient reservations.
- Fee review initially found under-reservation; fixed before activation/commit. The final independent
  three-file re-review reports Critical0/Important0, setSHA256
  `139baa926284e869b1361ecc808d0820dc03c1250a64c7ceb3ab6e38ff448948`.
  The job is restricted to pinned Qwen with conservative1,048,576 input-token bound, based on the
  [official model context](https://www.qianwenai.com/models/qwen3.7-plus) read2026-09-11.
  Actual account tariff and provider acceptance are not established by this bound or these tests.
- Lint/typecheck passed. Full security:124pass/0fail/1explicit unrelated AI-14 environment skip,
  so the full security suite reports incomplete. Full contract:241pass/0fail/0skip.
- A separate newly owned Supabase stack with all migrations ran `supabase db advisors --local
  --type security --fail-on error --output json`:exit0. One pre-existing WARN for
  `private.ai10_confirm_fault_trigger` mutable search_path from20260825161535; no new scoped-function
  finding. No ERROR. Original private diagnostic output was not committed.
- All three test-container families and the advisor stack were cleaned; subsequent exact-prefix
  `docker ps -a` checks returned no owned test containers.
- Independent permission/migration review:Critical0/Important0. It identified a priceVersion regex
  mismatch; corrected to the downstream durable-budget token grammar and added `v1:2026` rejection.
  The8worker checks passed again after that correction. No old migration was edited.

## Version and boundaries

PR325170e27f preceding this worker increment passed Quality34573778721, Budget34573778786,
Native34573778751 and Vercel. Its unchanged native source evidence is reusable for this server/SQL
increment. PR324 was closed as superseded, with its source and evidence retained in PR325; no stacked
runtime PR or Production merge is pending on it. Its branch and previously authorized Preview remain.

The new migration20260911072414 is local-only. Named Staging remains the previously verified33
migration history; this increment did not inspect or apply remote schema. No active policy,
provider credential, budget scope, cron or deployed worker was installed. A qualified recipient,
reviewed price and dedicated trusted process/scheduler still need actual runtime binding and
remote tests. Existing S1 remote source remains backend f5db769/native c333d9b.

A read-only attempt to inspect the reported Qwen account found the in-app browser not signed in;
no connected Chrome was available. No account/contract settings were changed or terms accepted.
This is an account-evidence limitation, not proof of provider eligibility or key failure.

Rollback stops the owned worker and can revoke only the new service EXECUTE capability. Leave
retained data, old migrations, consent history, lease receipts and unknown budget holds intact.
No fallback to global claiming or other recipient is permitted. #191/#192/#195 and full S1/S2 remain open.

The later [33→36 preparation rehearsal](../staging-36-preparation/verification.md) applies the
same SQL from the currently observed remote baseline33 and passes18text-work checks. Its updated
text-work test hash is included in source-hashes.json; earlier combined28-check evidence remains
scoped to its recorded run. No remote upgrade is implied.
