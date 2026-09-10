# VPJ-14 — Local protected Ops candidate review

Issue: [#204](https://github.com/JTCAO515/VP-V4/issues/204). This increment is a real local runtime slice, not production membership activation or a Fact publication pipeline.

## Identity and access

`/ops/review` reuses `/auth/sign-in?returnTo=/ops/review` and the existing Supabase Web SSR Cookie login. `/api/ops/review` rejects ambient Authorization headers, checks mutation Origin, verifies Cookie JWT claims, and invokes one authenticated database RPC. No service credential enters the application or browser.

Three independent defaults keep the flow closed: `OPS_LOCAL_REVIEW=1` is required; the public Supabase URL must be plain HTTP loopback with no credentials/path/query/hash; `knowledge_review_private.settings.enabled` defaults false. The controlled `members` table starts empty and requires an active database-managed entry. Neither user metadata nor UI/API input can activate settings or membership. This delivery adds no real member and grants no cross-customer access.

Every RPC, including list and successful receipt replay, checks the live `auth.sessions` row, the existing mobile session guard, and current active membership. Auth root, session and membership locks serialize destructive revocation with the transaction. Revocation committed before a new operation prevents that operation and replay. An already-running transaction holding those locks may finish before revocation commits. Operations that cannot acquire the existing auth-root NOWAIT lock fail closed.

## Content and transaction boundary

Members submit immutable title/text candidates, then another active member reviews or rejects with a bounded note and expected version 1. Actor IDs come from `auth.uid()`. Self-review is rejected. Candidate row locking permits one terminal review, with version 2 and an audit row. Submission and review each write their candidate transition, audit and idempotency receipt in one database transaction. A failed audit insert rolls all three back.

An operation UUID is scoped to its authenticated actor. Exact JSON replay returns the committed receipt only after current identity checks; payload drift conflicts. A later different operation cannot overwrite a terminal review. Audit entries include actor, action, candidate, version and timestamp; candidate text is not copied into audit entries. Private receipts retain the original operation input for exact replay. This is a private local candidate store with no automatic ingestion from `docs/knowledge-base/`, no runtime retrieval, no public Fact rows, and no external publication. `reviewed`, publication and retrieval eligibility remain separate: this slice always returns `published:false` and `retrievalEligible:false`.

## Web scope

The page is a single small form plus the latest 50 candidates and expandable audits. All labels are synchronized in `lib/i18n.ts` for zh/en/es/ru/ar; Arabic updates document language and direction. Current data is fetched without cache and cleared on failed reads, auth change and tab re-entry. Requests have one 8-second budget covering Cookie claims/refresh, body reads and RPC, plus the request abort signal. Configuration, Origin, bearer and credentials are checked before obtaining a body reader. Cancel is fire-and-forget; ignored abort cannot hold the handler open or allow a late credential completion to start a new RPC.

An already dispatched SQL transaction may still commit after a transport timeout: `OPS_ACK_UNKNOWN` is an unknown acknowledgement, not rollback proof. The page retains the exact unconfirmed operation/payload in memory, hides new submit/review forms and offers same-ID retry. Before retry it checks the current actor for UX; the POST additionally carries `X-Ops-Expected-Actor`, compared strictly with the verified Cookie subject before body read. That assertion only rejects drift and never supplies author authority. Credential changes clear pending content; stale completions cannot publish results into a newer identity view. Pending state is in-memory for the current page, not persisted across navigation. Browser fetches are also bounded at 10 seconds. Browser-held text is not a revocation mechanism; every server action rechecks database authority.

## Validation and remaining boundary

Run `node --experimental-strip-types --test tests/contract/ops/local-review.test.mjs` for closed input/config cases. Run `node tests/integration/ops/run-local.mjs` to create a uniquely named disposable local stack, apply the current migrations, run the real integration suite, and remove only that stack. It checks availability of loopback ports 56920/21/22/23/24/27/29/31 by default; `VP_OPS_TEST_PORT_BASE` changes the base if those ports are occupied. The opt-in integration suite uses real GoTrue accounts, cookies, HTTP, PostgreSQL and injected audit failure. It requires an explicit disposable `VP_IDENTITY_SUPABASE_WORKDIR`, matching `VP_IDENTITY_SUPABASE_API_URL`, `VP_OPS_LOCAL_INTEGRATION=true`, and a project ID beginning `vp-ops-review-`. It never discovers the existing development database. Test provisioning uses only that disposable instance's synthetic users and local admin credential outside browser/application code. The suite leaves settings disabled and membership empty.

Production identity deployment, actual team activation, remote migration, rights verification/publication, approved retrievable Fact construction, and customer-wide CRUD permissions are outside this increment. Existing #189 release/recovery and #190 identity gates remain separate; local evidence does not close #204 by itself.

The optional `VP_OPS_BROWSER_EXECUTABLE` points to an installed test Chromium/headless-shell executable. With it, the disposable runner also tests a real browser response lost after SQL commit and verifies the same-ID retry leaves one candidate, audit and receipt.
