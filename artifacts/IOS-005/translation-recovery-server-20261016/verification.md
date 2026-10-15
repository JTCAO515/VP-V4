# IOS-005 exact original translation recovery server

Product source: `82b45d2f4373008bc03f38be3b21eb97412133fc`.
Base: `4a628e4a6063d8a2263a36c51af55c8f811c3066` (QA).
Branch: `codex/ios005-translation-recovery-server-20261016`.
Owner chat: `01a14101-15e3-7300-ab83-322b45c0b11a`, verified project VPV10 `4f2191db-3e04-4042-94b5-ec94ff67b427`.
Target configuration gpt-6.1-sol / medium; effective model/thinking/tier UNKNOWN (not exposed).
Actual local tooling: Node v26.8.2; PostgreSQL17.11 Homebrew; danger-full-access, network enabled, approval never. Git push to the existing origin succeeded; no credential contents read or recorded.

## Delivered behavior

`GET /api/translate/recovery/{turnId}` accepts exactly seven query fields: threadId, idempotencyKey, policyId, noticeHash, sourceLocale, targetLocale, inputHash. UUID/hash strings are canonical lowercase; direction is zh/en with distinct locales. inputHash is SHA256 of the original user text UTF8 bytes, without trimming/normalization and without the translation prompt prefix. Neither original text nor actor identity is accepted in query.

Reply: `{version:1,kind:"translation_recovery",identity,state,phrase}`. identity contains path turnId and the seven query fields. state is unknown/pending/translated/cancelled/unavailable/needs_review. `phrase` uses the existing projectTranslation shape, including original/sourceLocale/targetLocale/turnId and state; translated also includes translation/backTranslation. Unknown always has null phrase and no private content. Same original submission and identity survive; there is no new key/Turn or generation/admission call.

The ordinary verified Bearer client's existing RLS selects exact owner/thread/turn/idempotency rows. Active native session, current accepted policy/notice, policy-scoped list_text_turns and exact read_text_turn are checked before and after. Complete local thread/turn/key/history-candidate/exact-text evidence must match across reads; policy/session are checked three times. Deleted/hidden/archived/missing or racing evidence cannot publish a positive result. Unknown is not proof of no submission, a failure, a refund, or permission to resubmit/clear the retained attempt.

Existing read_text_turn does not expose policy/status/thread binding. The existing policy-scoped recent20 list proves policy binding only inside its bounded window. Outside that window return unknown/null even though the original Turn still exists. No fallback to latest/global history. Existing translated-only history v2 is unchanged and unused by recovery.

Public endpoint is GET-only, no Cookie/Origin authority. Existing Supabase read RPCs retain their POST transport and existing session guard bookkeeping; this is not a claim of physically zero POST/database writes. Main explicitly accepted this clarification. Recovery never calls submit/worker/provider/model/admission/budget RPCs. Request lifetime10s, upstream each response2,000,000 bytes, wire64,000 bytes, query URL2,000 characters; no-store; existing production refusal retained. Transport/permission/policy/session errors remain errors, not fake unknown.

## Verification

- PASS `node --experimental-strip-types --test tests/contract/translate/*.test.ts tests/security/translate/recovery.test.ts`: 56/56, zero skip. Full local translation contract regression and recovery security negatives; `translation-regression.log`.
- PASS focused new recovery contract/security: 33/33, zero skip; `recovery-tests.log`.
- PASS `IOS005_NATIVE_PG=1 IOS005_PG_BIN=/opt/homebrew/opt/postgresql@17/bin IOS005_PG_MODULE=<existing read-only pg8.13.1 module> node --experimental-strip-types --test tests/security/translate/recovery-postgres.test.mjs`: 1/1, zero skip, current161 migration replay on owned PostgreSQL17.11; `owned-postgres.log`.
- PASS `node node_modules/typescript/bin/tsc --noEmit --incremental false` (exit0, empty output).
- PASS `node scripts/lint.mjs`: source policy880 files.
- PASS `node scripts/docs-check.mjs`; `docs-check.log`.
- PASS `git diff --cached --check` before source commit.

The PG test reuses the unchanged createOwnedPg utility, which creates a fresh nonce directory/socket/data cluster, mode0700, noTCP, validates resource identity and cleans up only its own cluster. Its historical ios004 directory-name prefix does not refer to an existing IOS004 resource. System PG16, shared databases and other owners' running clusters were not used. Dependencies are read-only reused node_modules symlink and an existing pg client module; no installs/lockfile/global/config changes.

Actual migration-defined authenticated table grants and RLS are exercised under SET ROLE authenticated. The real original submit_text_turn seeds the original Turn/key/content association. Current-policy consent and read_text_turn/list_text_turns/native_session_v2 are actual SQL functions from the full chronological migration chain. Cross-owner SDK credentials and direct SQL RLS both deny disclosure. Same-policy pending/completed/failed states are fixture database states; cancellation uses the actual cancel_chat_turn. No provider/worker completion is claimed. Archived/hidden/deleted/current-consent/session denial, another accepted policy with same notice, wrong Turn/thread/key/hash/direction, recent20 eviction and late-output inconsistency are tested. Repeated recovery keeps Turn/key/work/dispatch row counts unchanged. SDK fetch routes allow only the four existing read RPCs and three RLS tables.

SDK HTTP/JWT signing is synthetic and intercepted to the owned SQL connection. It does not test managed Auth, actual PostgREST routing/ACL exposure, the remote deployment or real account/device behavior. Unit security separately tests upstream403/503, malformed schemas/extra fields, >2MB body, abort and delayed callbacks, metadata/content/session/policy race revalidation, closed query and production refusal.

Earlier failures, fixed before source commit:
- Node strip-only rejected a constructor parameter property; replaced with a normal explicitly assigned field.
- TSC rejected inferred optional-undefined unions in two test arrays; explicit array types fixed the test types.
- A cross-owner PG fixture initially expected unknown despite having no accepted policy; actual403 correctly preserved policy semantics. Seeded that synthetic actor's legitimate consent, then verified RLS still returned unknown/no phrase for the original owner's Turn. No runtime guard or expectation of policy403 was weakened.

## Remaining scope and writer boundary

UNRUN: managed Auth, actual PostgREST, deployed target, physical device/VoiceOver, real worker/provider completion, release and remote CI. Full build is not required for this GET server change; TSC and affected translation/security behavior were verified. Main owns CI registration, shared interfaces, integration, PR/merge and whole-Issue closure. No independent PR or Issue closure was performed here.

Only six new source/test paths were committed. No old http.ts/contract.ts hunk, history v2, CoreTurn/native-http.ts, SQL/RLS/grant, provider/worker/config, shared fixture/CI/registry or HANDOFF edits. All old owner resources/dirty retained. Source writer is stopped after this commit; no in-flight product edits, no planned successor/source writer. Main receives exact future translation-recovery paths for integration; further implementation/repair only on Main's explicit scope. Final residual untracked path is the initial read-only node_modules symlink.
