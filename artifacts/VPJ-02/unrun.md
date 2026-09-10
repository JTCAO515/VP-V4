# VPJ-02 remaining runtime acceptance

As of2026-09-10, the authorized same-target Staging upgrade11->25, fresh encrypted backup/isolated restore, and two-account ordinary JWT isolation16/16 are PASS. Existing3 Auth/2 Trip row digests match after exact-ID fixture cleanup. See [actual evidence](staging-apply-20260910.md).

- Direct-host database read-only query was rerun2026-09-10 and failed:psql exit2, connection closed with verify-full. Session pooler maintenance passed.
- Worker connection/identity path remains UNRUN. Ordinary PostgREST JWT success does not establish worker isolation.
- No native authenticated session epoch, full Harness integration, Production database or real customer acceptance is claimed.
- Parent#189 remains OPEN; do not rewrite applied history or restore revoked direct UPDATE.

## 2026-09-11 update

Latest explicit metadata verifiesStaging26 (following the separately approved VPJ-59 migration),
not25. Frozen26→33 local preparation is complete; see
[verification](staging-33-preparation/verification.md). Actual migration27 is BLOCKED by three extra
public definer execute grants. Exact pre27 normalization and ACL rollback are prepared but not
executed remotely. New encrypted backup/restore, authorized maintenance/caller cutover, actual
27–33 application and native remote configuration remain unrun. Local SQL claims are not GoTrue.
