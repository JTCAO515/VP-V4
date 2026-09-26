# VPJ-79 first slice verification — 2026-09-27

## Result and boundary

`comparison/1` is a closed, inert generated-result record with an immutable revision, owner/task/goal/input/optional Trip association, explicit Memory revision basis and an empty evidence basis. A service-role-only publisher validates current ownership/consent/basis, writes the revision and content-free outbox event in one transaction, and uses an idempotency key plus expected revision. A separate internal withdrawal operation hides content. Native VP v5 and the existing materials/Knowledge view use the same owner-scoped read endpoint and render literal text only. The materials view is a future Library consumption seam in the present five-tab shell; no four-tab acceptance is claimed. Test content is synthetic and is not a real planning recommendation.

## Checks

| Check | Result | Scope |
| --- | --- | --- |
| `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm docs:check`, `git diff --check` | PASS | Server/native-adjacent source policy, types, production build, docs and diff |
| `node --experimental-strip-types --test tests/contract/artifacts/result-contract.test.ts` | PASS, 1 test | Unknown schema, actions/URL/HTML fields, stale currentness and evidence rejection |
| `node --experimental-strip-types tests/integration/turn/run-native-http.mjs` | PASS, 2 tests | Disposable local Auth/Next/Postgres; synthetic result publish/read, other actor, revision immutability, CAS/idempotency, concurrent writer race, goal/Memory/Trip invalidation, withdrawal, account session replacement |
| `node scripts/ci-suites/db-integration.mjs --lane supabase-rls` | PASS, 22 tests | Disposable local Supabase: reviewed function ACL, RLS and related identity/Trip regression |
| `xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda -destination 'platform=iOS Simulator,id=B0AD77FD-33C3-4616-92CE-2E76ACD93148' -only-testing:VisePandaTests/NativeKnowledgeTests CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-` | PASS, 15 tests | iPhone 15 Pro iOS 17.5 Simulator; synthetic native comparison read model, unknown-schema fallback and late-response scope fence |
| `pnpm test:contract` | PASS, 686 tests | Repository contract suite; new result contract also run directly above |
| `pnpm test:integration` | INCOMPLETE, 39 pass / 118 skipped | Default runner omits disposable DB lanes; the relevant DB lanes are listed above |
| `pnpm test:security` | INCOMPLETE, 178 pass / 1 skipped | Default runner skips one identity/Supabase case without a disposable target; the relevant Supabase RLS lane passed separately |

The SQL migration was also parsed inside a transaction against the existing local PostgreSQL instance, checked against valid/null/missing comparison content, and rolled back. No migration was applied to Staging or Production. The local native HTTP runner created and removed its own disposable Supabase stack. A temporary ACL test signature error and a test expectation of HTTP 400 for a concurrent unique conflict were corrected before the final passing reruns; no gate was weakened.

## Data, permissions and rollback

No model, provider, payment or production action is introduced. The writer is internal only, and a result has no Trip confirm or URL action. Revoked text consent or deleted Memory makes content unavailable; a changed Memory revision, goal scope or Trip base makes an otherwise readable result non-current. Trip deletion cascades dependent result rows and outbox references in the local test. Account deletion is wired by owner foreign keys, but full all-user-data export/delete execution is not part of this slice.

Before any deployment, revert this isolated PR if necessary. After a migration is applied, disable the future producer, retain authorized read/withdraw and use a reviewed forward compatibility migration; do not drop user data or restore revoked/deleted sources. Historical revisions never become confirmable Trip payloads.
