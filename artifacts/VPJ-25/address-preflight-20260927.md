# #506 confirmed Chinese address contract preflight · 2026-09-27

Scope: proposed v3 producer/contract boundary and a v2 fail-closed regression. Base `origin/main` `a25af6c24f8d86b778f8b679d3f17eaede38588c`, read back from the GitHub main ref before branching. #506 and #215 remain OPEN. PR #555 is OPEN and owns concurrent native Trip view/model edits; this slice changes no native runtime consumer.

## Observed inputs

- [ADR-0021](../../docs/adr/ADR-0021-trip-content-snapshot-parity.md) and [TripPatch golden](../../docs/contracts/trippatch-golden.md) freeze the v2 operation union. `lib/server/trip/patch/contract.ts` and the current `public.apply_trip_content_patch` from `20260909033302_vpj_02_repair_local_rpc_runtime.sql` reject an address key or new operation.
- `trip_items` has no address column. `public.trip_content_snapshot` rebuilds snapshots from that projection, while `confirm_and_apply_trip_proposal` atomically writes the projection, immutable version, event and receipt. A JSON-only address would be lost at the next projection rebuild.
- `trip_place_references` exposes only canonical POI ID or user label, without Item ID, confirmed Trip revision or saved Chinese address. #363's canonical identity/provider mapping does not add that missing binding.
- `snapshotRestorePatch` reconstructs the current closed Item fields only. A v2 restore or old client edit must not silently discard a later saved address. #555 changes `NativeTripView` and `NativeTripModels`, so an unmerged native consumer would create ownership overlap.

## Delivery and limits

- **IMPLEMENTED — repository preparation:** [proposed ADR-0026](../../docs/adr/ADR-0026-confirmed-trip-item-chinese-address.md) specifies one Trip Item/version source, owner-entered provenance, explicit address diff/confirmation, v2 compatibility, privacy and staged activation. The v2 contract test now rejects address-shaped writes.
- **NOT MET — capability:** no address producer, migration, v3 endpoint, owner-visible confirmation UI, native Today address read or target-environment readback is present in this PR. No provider address or Trip title is converted into a saved address.
- **UNRUN — target environment:** authenticated same-version Web/native observation, RLS/adversarial database run, privacy export/delete lifecycle, device, offline and entitlement cases. An accepted contract and append-only migration are prerequisites for those checks.

## Checks

| Check | Result |
| --- | --- |
| `pnpm docs:check` | PASS |
| `git diff --check` | PASS |
| `node --test tests/contract/trip/patch.test.ts` | PASS · 3 tests, 0 failures |
| `pnpm typecheck` | UNRUN · `tsc: command not found`; this worktree has no `node_modules` and no network install was performed |

Rollback: revert this preflight ADR/test/index change. It contains no migration or runtime write and changes no Trip data. Future applied migrations require forward repair, not deletion of confirmed snapshots.
