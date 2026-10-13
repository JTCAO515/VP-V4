# VP-V10 rule adoption evidence — 2026-10-13

This is an immutable change receipt, not a task tracker or HANDOFF. Current rules are in
`/Users/jtsm5p/Documents/Codex/VP-V5-worktrees/DEVELOPMENT-RULES.md`; current task state remains
with the Main-owned HANDOFF. The `.before.md` files and removed diff lines are historical,
not active concurrency or model instructions.

Scope: the dedicated `codex/v10-spec-ticket-rules-20261013` branch from
`2dbc7136620bd75ce81e99103aac1ea1b5dfd6ae`, the two explicitly handed-off external rule files,
and the repository AGENTS navigation pointer. No product implementation, tickets, CI, tests,
deployment, upstream skills or HANDOFF changed. Local commit only; no push or PR.

## Reviewable external edits

- [External file hashes](external-file-hashes.json) records both absolute paths and SHA-256 before/after.
- [Global AGENTS diff](global-AGENTS.diff) adds only the conditional VP-V10 navigation entry;
  all pre-existing personal instructions remain byte-for-byte intact.
- [Development rules diff](DEVELOPMENT-RULES.diff) replaces old concurrency/model instructions,
  retains original permissions and ownership protections, and maps installed skills to the
  accepted workflow. Adjacent before/after snapshots retain exact file bytes.
- [Installation proof](skills-install-proof.json) is copied from Main's supplied installation
  receipt. This task independently rechecked all 27 installed SKILL.md hashes against it;
  it did not rerun installation or independently repeat every upstream file comparison.

External files were saved and read back; hashes match the after snapshots. This task read the
six named installed skills at the pinned revision. Explicit file access is verified; automatic
catalog reload in another chat is not established. Astra/medium/Fast remains the target;
no model or Fast setting was changed. The repository pointer needs Main's normal integration.

## Three bounded retrospective improvements

Source: [PR #684](https://github.com/JTCAO515/VP-V4/pull/684), read live as MERGED with
merge commit matching this task's base. Its body records scoped validation and retained target
acceptance gaps; that historical report is not a fresh target acceptance result.

1. **Reuse recovery checks.** The existing
   `tests/e2e/qa-agent-ui/pending-identity.test.mjs` covers identity persistence across reload,
   actor changes and confirmation matching. The existing
   `tests/security/qa-agent-service/reconciliation-read.test.mjs` covers expired-dispatch
   reads without new admission/charge and cross-actor refusal. Future affected changes should
   extend/reuse these seams instead of adding a second rule or mirrored test suite.
2. **Reuse evidence by code scope.** PR #684 records full review plus a later recovery delta;
   old-head green alone did not authorize a new-head merge. Keep the tested SHA and invalidation
   scope with evidence, then retain exact-head review, applicable CI and normal match-head merge.
   Existing `.github/workflows/quality-pr.yml` and `scripts/ci-change-scope.mjs` already select
   affected checks; no new CI gate is justified by this rule edit.
3. **Separate implementation from target readiness.** PR #684 retains real-data restore,
   target upgrade and real Auth/Session/provider acceptance gaps despite merged code. Dispatch
   from integrated source, interface ownership and available environment; record ready/wait/
   integration/idle/rework transition timestamps in existing evidence, never infer speed from
   the number of chats. Remove stale concurrency instructions rather than append another override.

## Validation and rollback

PASS: `pnpm docs:check`; exact external-file readback/hash checks; installed SKILL.md hashes;
manual Markdown/navigation/diff inspection; `git diff --check`.
Product build/tests and target acceptance: UNRUN, not needed for this rule-only change.
No fresh runtime claim is made. Restore only this task's exact diff after checking current hashes;
if files have since changed, merge a targeted inverse patch rather than overwrite concurrent work.
