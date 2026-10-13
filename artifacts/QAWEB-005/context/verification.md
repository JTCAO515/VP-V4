# Context delivery verification — 2026-10-13

Scope: new context consumer and backend executor adapter for #682, base
`daa7bae44a660381fb3295d0d2afc327ea98d3ba`. No shared source/migration/config modification.

PASS:
- 13 context behavioral tests: exact P0 latest requests and source projection; fresh Session;
  owner/auth-session/Session/Task/policy/consent/Turn binding; full bounded source qualification;
  newest three whole pairs; unknown/legacy/preview refusal; order/duplicates/injection/size;
  initial/fresh-read/authorization refusal; changed source fingerprint; budget/cancellation;
  provider refusal/timeout; initial SQL timeout with no late dispatch; executor adapter.
- Existing provider protocol contract/security + context tests: **40 pass, 0 fail, 0 skip**.
  Command: `node --test tests/contract/qa-agent-context/context.test.ts tests/contract/model-gateway/provider-protocol/protocol.test.ts tests/security/model-gateway/provider-protocol/boundaries.test.ts`.
- Source policy lint: 813 files, `node scripts/lint.mjs`.
- Full repository compiler: `node node_modules/typescript/bin/tsc --noEmit`, no errors.
  Used existing installed dependencies through a temporary local node_modules symlink;
  no dependency, lockfile, package-manager identity or global setting changed.
- Targeted strict compiler on all three new modules + context test, no errors.
- `git diff --check` and staged diff review.
- Cross-worktree SYNTHETIC executor integration: actual backend executor source SHA256
  `9b3bd549bc2617a6f62b169e453acf7eaa51e5016c6962a40873d6e79762ca57`;
  original QA claim → read → reserve (attempt=leaseToken) → two protected context reads →
  QA authorization → one protocol transport → validated usage → settle → QA complete;
  result `finished`. No pre-dispatch_model_budget call. Reproducible command:
  `node artifacts/QAWEB-005/context/joint-executor-check.mjs /absolute/path/to/qa-agent/executor.ts`.
  This check used synthetic RPCs and transport; no actual database/provider request or cost.

Observed environment failures, resolved/limited honestly:
- First full typecheck with an older existing dependency tree failed for missing
  `@apple/app-store-server-library`. Reusing the backend's complete installed dependency
  tree allowed the full TypeScript check above to pass.
- `pnpm typecheck` launcher later refused pnpm@9.15.9 identity verification because the
  configured registry request could not be completed in the current restricted network.
  That launcher is FAIL, not PASS. The installed TypeScript compiler was invoked directly;
  no signature bypass, package install or package-manager setting change was used.

UNRUN here:
- Actual SQL migration and permission/expiry/withdrawal RLS tests (SQL owner/Main).
- Deployed browser → persisted QA source → real provider semantics/usage/latency.
- Exact-head independent review, integrated CI, QA deploy and user acceptance (Main).

Consumer is code-complete for the frozen QA wire including fresh ownerId/authSessionId.
Target #682 P0 acceptance remains incomplete until Main integrates SQL/backend/prompt and
records real why/simplify/second-option/correction/new-Session cases. No closed parent reopened.

Verified source SHA256 pins:

- `lib/server/qa-agent-context/executor-adapter.ts`: `19319cc6f88b08f0f013fc17c487e111b21dcd72df989e5673818e9ebd483727`
- `lib/server/qa-agent-context/index.ts`: `d298d97ac5a30332d586f53035d80fade9750aeb43ca159ae12a86a9f874557c`
- `lib/server/qa-agent-context/session.ts`: `62263650cd30de79d0d8715d7d863a4bf64c7b502b681d5b904cce9767338a91`
