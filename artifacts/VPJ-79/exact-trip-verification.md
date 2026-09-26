# VPJ-79 exact Trip comparison slice — 2026-09-27

## Implemented scope

Append-only migration `20260927055000_vpj79_exact_trip_results.sql` extends `comparison/1` with the exact #572 user-confirmed goal→existing-Trip link operation/version. The internal publisher requires current owner, goal scope, link receipt, unarchived and nondeleting Trip head, and both a new source message and completed answered Task created after the link. It retains the old null-Trip path. A Trip-only reader returns an exact artifact ID/revision reference, then the existing permission-checked content reader supplies the body; VP, materials and the selected native Trip therefore consume one revision. No Trip content, Proposal, confirmation payload, URL action or second result body is written.

## Verification

| Check | Result | Evidence boundary |
| --- | --- | --- |
| `node --experimental-strip-types tests/integration/turn/run-native-http.mjs` | PASS, 8/8 | Disposable local Auth/Next/Postgres: real owner link, post-link Task/answer, service-role synthetic comparison, exact VP/materials/Trip readback; old Task/scope, same-owner wrong Trip, foreign owner, concurrent CAS, archive, retarget, unlink, queued/completed deletion, new Trip base, late publish, consent and session negatives |
| `node --experimental-strip-types tests/integration/turn/run-native-http.mjs --planning` | PASS, 1/1 | #561's existing null-Trip planning producer remains compatible after the new migration |
| `node scripts/ci-suites/db-integration.mjs --lane supabase-rls` | PASS, 22/22 | Disposable full-migration Supabase stack, RLS/ACL and related Trip/identity regression |
| `xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=B0AD77FD-33C3-4616-92CE-2E76ACD93148' -only-testing:VisePandaTests/NativeKnowledgeTests CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-` | PASS, 16/16 | iPhone 15 Pro iOS 17.5 Simulator; exact two-step Trip reference/body, wrong Trip and stale-body rejection |
| `pnpm lint`, `pnpm typecheck`, `pnpm build`, `git diff --check` | PASS | Source policy, types, production route build and changed diff |
| `pnpm test:contract` | PASS, 695/695 | Repository contract suite |
| `pnpm test:integration` | INCOMPLETE, 39 pass / 128 skipped | Default runner omits disposable DB lanes; relevant lanes above ran explicitly |
| `pnpm test:security` | INCOMPLETE, 189 pass / 1 skipped | One identity/Supabase case needs a disposable target; RLS lane above passed |

The first disposable migration run caught a PostgreSQL composite `SELECT INTO` syntax error. It was repaired before the passing 87-migration RLS run. The first native HTTP rerun exposed one old test expecting all non-null Trips to fail as `INVALID_INPUT`; it now asserts `STALE_BASIS` for an unlinked same-owner Trip. No denial or check was weakened.

## Risk, target environment and rollback

This is a permission and data-integrity change. The app never receives service-role credentials, the Trip reader exposes only an ID/revision and checks current eligibility, and the body remains behind the original owner/session/consent reader. Archive, unlink and retarget keep authorised history non-current; queued deletion hides it and completed deletion removes dependent rows. No paid transaction or real provider work was initiated by this slice; the local comparison body is synthetic.

Staging/Production migration and real provider-produced Trip comparison were not run. A physical iPhone reopen, four-tab Library/Journeys shell, supported Web result read, nonempty qualified evidence and the all-user-data export/delete executor remain outside this slice. #560 stays OPEN.

Before an environment migration, revert this isolated PR if necessary. After an append-only migration is applied, disable the future linked producer while retaining authorised read/withdraw; use a reviewed forward compatibility migration. Do not restore revoked/deleted source data or bypass TripProposal→diff→explicit confirm→atomic Patch.
