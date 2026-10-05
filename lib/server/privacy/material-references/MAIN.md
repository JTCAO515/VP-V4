# Exact current facts / remaining Main relay

Actual signed GoTrue/HTTP PASS log:
`/Users/jtsm5p/Documents/Codex/VP-V5-worktrees/vpj58-material-reference-data-server-20261006/artifacts/VPJ-58/material-references/auth-http-r4.log`.
It reports1PASS0FAIL0SKIP and cleanup PASS for `vp-native-ask-806da5f8` at63360.
Previous r1/r2/r3 logs remain beside it; no production/source oracle relaxed.
The actual source migration used is sole SQL `40a1fc55`; Native product normally
merged `03ac55e0` at `df207c30` and production sourceeq is empty. Current branch
also normally includes #663 immutable dependency `bda241be`; main/CI gate separate.

Precise old test adjustment requested (two lines, same missing-module invariant):
`tests/integration/privacy/coverage/dispatch.test.mjs:67-68`:
select `case_attachments` in place of newly implemented `order_references`, and
expect `ATTACHMENT_HANDLER_UNAVAILABLE` instead of obsolete
`EXPORT_DELETE_NOT_IMPLEMENTED`. Preserve all complete-promotion rejection,
device-proof rejection, denominator membership and every other existing test.

Precise TS fixture metadata alignment requested:
`tests/fixtures/privacy/coverage/producer.json` and `cancelled.json`:
catalogVersion `.2`→`.3`; producer only its actual MODULE_CATALOG metadata
(order_references/pdf_intake replacements + material_exit_progress appended in
accepted catalog order); preserve original UGC data/body and cancelled result.
Rewrite each existing opaque outer request's catalogVersion only, then recompute
its SHA256 requestDigest and corresponding receipt catalogVersion from those
actual bytes. No other result/negative/state/reason/module oracle changes.
Native mirrors the same current producer dictionaries in its two existing
DataCoverage fixture paths under its sole lease; its original successful module
count assertions31→32 preserve all11 old cases/negative assertions. TS never edits
the existing Native tests or fixture mirror concurrently.

The foreign-existing-vs-absent recover source finding is already accepted by
Main and assigned to the existing sole SQL owner. Do not count the previous
runtime freeze as final for that fix. Take its next immutable source normally;
reuse unaffected signed source/caller proof and run only the affected recovery
check needed for the final source. No extra matrix or second SQL writer.
