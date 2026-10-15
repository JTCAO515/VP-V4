# IOS-005 original translation submission recovery

Issue #216 already required reopening the original submitted translation without creating another Turn or idempotency key. The old consumer kept pending identity only in memory and cleared it on background. The implemented recovery retains metadata before the initial POST, then uses the original actor/policy/thread/Turn/key-bound read. Unknown remains unresolved; it never implies non-submission or zero cost.

## Integrated source and boundary

Base QA `4a628e4a6063d8a2263a36c51af55c8f811c3066`. Server source `82b45d2f` plus seven-field normalization `3012850d`; journal `39521b32`/`cbf223da`/`599791ee`; Native consumer `ba42c895` plus source-eligibility repair `4d7c1961` and synchronous UI actor gate `78977a1d`. Main integrates Session/vault eligibility, the new closed GET query, the existing Turn-erasure fence, explicit account cleanup, fixed JournalData metadata inventory, PBX and CI.

Only identity metadata is durable: original IDs, policy/notice, direction and exact UTF-8 input SHA256, bound to endpoint/owner/mobile epoch. No original text, translation, Trip field, prompt, audio, token or credential is copied into the journal. A generation remains a live fence. Existing records and failed/corrupt storage cannot authorize another initial POST. Completion uses strict matching positive terminal evidence and physical CAS; local abandonment is a separate explicit action and never server undo or a completion receipt.

The server reuses current policy/notice/consent, ordinary authenticated RLS thread/Turn/key metadata, the policy-scoped recent-20 reader, and protected exact text reads. Eligibility and content are rechecked before publication. Because existing exact reads do not prove the original policy binding outside that window, out-of-window or unproved association is `unknown`/null. The old translated-only history v2 and CoreTurn/RLS/SQL/grants remain unchanged. Recovery invokes no submit/model/worker/admission/budget operation; existing read RPCs retain Supabase's HTTP POST transport.

## Actual validation

- Main actual App target on its exclusively leased iOS 26.5 simulator: **65/65 PASS, zero skips, 58.280s**, at integrated `02a765ec`. Suites include original Translation, new Recovery Store, Recovery Journal, Session actor gate and original JournalData. This includes the repaired pending-to-unknown and terminal-to-missing-history sequences. The later final UI-only actor gate leaves these Store/journal/test sources unchanged; its targeted SDK typecheck passed and final App compilation is recorded separately.
- Final integrated App compilation at `dd308016`: **PASS, 45.421s**, including the synchronous actor-clear/display gate. Log `build_sim_2026-10-15T19-37-14-086Z_pid2509_8031ca1e.log` in the same XcodeBuildMCP log directory. The unchanged 65-test source evidence above remains applicable; no physical-device or live-account claim follows.
- Actual App test log: `~/Library/Developer/XcodeBuildMCP/workspaces/Documents-2025647e2650/logs/test_sim_2026-10-15T19-35-09-123Z_pid2509_dfcb8424.log`; result bundle `test_sim_2026-10-15T19-35-09-123Z_pid2509_fd5dca9c.xcresult`. Simulator `8F6CA72C-73C0-45C0-8606-0543B1F725BD`, SDK27/minimum17. Original unrelated SDK/test warnings remain.
- Final server affected contracts/security **57/57 PASS** and TypeScript/lint PASS; original translation and new read-only negatives are covered. Journal fault sequences **15/15 PASS**; final Native standalone affected suites **39 PASS**. See the owner artifacts below for fixed sources and methods.
- Main independently executed the final reader/normalization against owned PostgreSQL17.11 with all **161 chronological migrations: 1/1 PASS, zero skips, 2.675s**. Ordinary authenticated RLS and actual original SQL readers enforce owner/key/thread/hash/language/policy, withdrawal/hidden/archive/deletion/session and recent-window limits. Repeated recovery does not add Turn, key, work or dispatch rows. Database states/completion are fixtures, with no provider invocation.
- CI registration/governance **39/39 PASS**, including the exact fifth PG17 step, opt-in flag and unchanged old lanes. Original skip/todo/cancel/timeout enforcement is retained. Documentation, PBX syntax and diff checks PASS.

## Repairs and retained failures

Main review found that a previously recovered private phrase was reinserted after a later unknown/null response, and again after the durable request completed but fresh history no longer returned that Turn. The original owner repaired both by expiring prior recovery display authority before the next read; the two added sequence tests pass. A final UI gate clears Store memory synchronously on actor change and hides recovery metadata until the current active scope matches the Store. Durable identity remains.

The first Main build-for-testing failed only in two new Main test assertions: throwing reads were nested inside `#require` without their own `try`. They now execute before the required-value assertion; the actual App run above passes. Initial build log: `build_sim_2026-10-15T19-33-24-724Z_pid2509_981a83b1.log` (53.230s). No production check or permission was weakened.

The first local CI classification attempt registered the gated PG test under `tests/security`, outside the integration discovery root. Main moved it to `tests/integration/translation-recovery/postgres.test.mjs`, adjusted only the helper import and registration, then executed the actual PG entry and all 39 governance cases successfully. This is test placement, not an exclusion or a skipped gate. Initial diagnostic and fixed logs remain in Main's private evidence directory.

An early Main wire-mismatch diagnosis used the initial journal receipt implementation. Its later stable commit already accepted both five-field nontranslated phrases and seven fields with explicit nulls; that diagnosis was withdrawn. The already-written minimal server normalization was reviewed and deliberately retained as an explicit seven-field wire. The original server was compatible; prior evidence is not rewritten into a false defect.

## Evidence limits and ownership

The SDK/JWT/HTTP bridge into private PostgreSQL is synthetic transport to actual local SQL. FakeVault and App test fixtures are not managed Auth, real PostgREST, remote deployment, real user/provider completion, physical device, VoiceOver or release acceptance. Those remain **UNRUN**. No shared database apply, new grant, provider enablement, fee, Production or TestFlight action occurred; old W2/E2 and expired recovery windows remain frozen.

Each original holder explicitly stopped and released only the new recovery compatibility hunks. Three V10 product owners implemented isolated source, delivered early, and stopped; Main alone writes shared Session/lifecycle/PBX/CI/HANDOFF. The original 29 JournalData sources and replay cursor retain their assertions and semantics; the added fixed source exports metadata only and missing companion remains unavailable.

Owner evidence: [server](../translation-recovery-server-20261016/verification.md), [journal](../translation-recovery-journal-20261016/verification.md), [Native consumer](../frontend-20261014/recovery-20261016/README.md). Main private diagnostic files are under `/Users/jtsm5p/Documents/Codex/2026-10-13/v10-main/ios005-translation-recovery-20261016`; only the single external HANDOFF is current coordination authority.
