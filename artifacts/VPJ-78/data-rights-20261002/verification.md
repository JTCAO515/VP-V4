# VPJ-78 Conversation data-rights export preparation

Date: 2026-10-02 (Asia/Shanghai). Base: `906017da4ec0fcf89317a3c5f76e6bdac353c40b`.
Related to #559; #228 retains all-data execution/delivery ownership. Neither parent is complete.

## Result and scope

Source trace found no account-deletion executor: `/api/privacy` records intent as
`requested/not_started`. Existing auth.users FKs cascade assistant conversation,
goal, message, goal–Trip link/receipt and result artifact/revision/event rows.
A full-history disposable database test confirmed that behavior before the fix,
with another owner retained and old-identity read/write attempts rejected.
Existing retained text is permanently hidden rather than physically erased.

The missing Conversation export helper was reproduced (undefined SQL function).
The only runtime addition is an append-only service-only paginated export seam:
five closed sections, max 100 items/page, deterministic UUID keysets, owner/section
anchor validation and explicit nextCursor/hasMore/sectionComplete. Link/receipt
items preserve the existing goal–Trip manifest fields. Four owner/key indexes
support bounded windows; no public EXECUTE or private table grants are added.
The dedicated test is registered only in the existing postgres lane, reusing
VP_PRIVACY_DB_TEST; main coordinator authorized that shared-file edit.

## Observed local checks

- PASS `VP_PRIVACY_DB_TEST=1 node --test tests/integration/privacy/assistant-data-rights.test.mjs`: 2/2, zero skips. Full migration history, transactional forward/rollback, compensation-ACL rollback, two owners, readable synthetic result before deletion, deletion cascades, late reads/writes, 57 reconstructed messages across two conversations, 50-row presentation cutoff, matching goal–Trip export fields, repeated deterministic pages, page/limit/cursor validation, consent withdrawal and post-delete empty pages. See focused.log.gz.
- PASS `pnpm test:integration:db --lane postgres`: 138/138, zero skips, 18 files, 104 seconds. This includes the new test. The final helper's STABLE/range-bound refinements also passed the focused 2/2 rerun.
- PASS `pnpm test:unit`: 154/154, zero skips; `pnpm test:contract`: 698/698, zero skips.
- PASS `pnpm lint`, `pnpm typecheck`, `pnpm docs:check`, `git diff --check`, `node --check tests/integration/privacy/assistant-data-rights.test.mjs`, database lane classification.
- PARTIAL `pnpm test:security`: 194 pass, 0 fail, 1 skip (AI-14 owner RLS requires a configured disposable Supabase target); this does not establish that skipped behavior.
- PARTIAL `pnpm test:integration`: 39 pass, 0 fail, 136 gated skips; PostgreSQL lane above supplies its actual database evidence. Other lanes remain for applicable CI, not inferred from this command.

All actors, policies, claims, Trip/task data and terminal answers were synthetic.
Database containers were uniquely named, network-disabled and removed after use.
No model/provider call, real JWT/HTTP account operation, private user data, secret,
shared Staging/Production migration, financial operation or native UI change ran.

## Limits and rollback

UNRUN: operational account-delete/export executor, reauthentication-to-download,
consistent multi-page snapshot/retry assembly, result/Turn/Task-content export,
backup/provider/cache/device deletion, real target acceptance and complete #559/#228.
sectionComplete marks only the terminal page of one section; an executor must
collect every prior page and all sections/modules before claiming completion.
Concurrent changes can shift live traversal; an invalidated anchor requires restart.
No API request scope/status, retention policy, Trip confirmation, actor/RLS gate or
model ledger changes. No second privacy executor or delivery endpoint is introduced.

Rollback: append-only compensation revoking EXECUTE on the new function disables
this seam without changing existing readers, source records or cascade behavior.
Transactional apply/rollback and EXECUTE-revocation rollback passed locally.
