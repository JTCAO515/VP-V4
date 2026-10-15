# Per-run fixture ownership repair

Code: `0b850a8a57de35fb1c8bff51e7c741afc63fdefa`, parent `58a18b8b1e2c5886fbd8463bc110b749b6d820fb`.

Main expanded the original diagnostic-only repair to the required native entry's before/after resource lifecycle. No product SQL, shared Guide test, db.mjs, fixtures.mjs, selected cases, inspect source, migration inputs, activation flag, skip rule, timeout, gate predicate, or CI configuration changed.

## Ownership

Six diagnostic programs now allocate an explicit local PG in a private 0700 run directory, capture its nonce/socket identities, and connect using the captured descriptor. Cleanup never reads a shared descriptor. Bootstrap transforms an in-memory copy of inspect.mjs only; diagnostics omit its versioned before-snapshot output. Init/start failures clean only this allocation. Unknown inode, symlink, or postmaster directory identity fails closed. The bootstrap retains the existing no-TCP and private Unix socket configuration.

The required entry uses the same ownership closure and the original inspect SQL. It retains inspect's snapshot output and publishes the same descriptor fields for the unchanged db Proxy only after successful initialization. Before publication it checks that the previous descriptor bytes are unchanged. After cleanup it restores prior bytes (or removes a newly introduced pointer) only when the pointer bytes still match this run's publication; an unknown replacement remains untouched. Missing env allocates nothing and invokes no cleanup of prior resources. The explicit operator cleanup.mjs is unchanged and is no longer called by these automated after/finally paths.

The separate source-generation tools (freeze/build scripts), explicit inspect/operator commands, and singleton Guide runner are unchanged. This repair does not grant cleanup authority over resources created by those commands.

## Historical diagnosis

Both historical Guide diagnostics now read the stored before.mjs only after validating SHA256 `b0e80fc9faf0bd094e1827e494cb101797403897a9aa3c1e02bf5ebeb10ba78b`. Current checkout source no longer supplies a partial normalizer with unresolved canonicalKnown. New results use separate safe/current-checkout filenames; original failure evidence remains unchanged.

## Verification

- PASS: native PostgreSQL 17.11 / pg 8.13.1, original required entry **21/21, zero skip**, `native21-owned-lifecycle.log`.
- PASS: **14 resource cases**, `diagnostic-resource-safety.json` and `.log`. A synthetic prior fixture with a valid a005sql prefix retained descriptor and payload bytes. Six diagnostics and the required entry reject missing env without stopping it. Successful and partial-init/start allocations clean only their captured nonce even after their private descriptor is poisoned. Required publication restores prior bytes and preserves an unknown replacement. No real prior fixture was inspected/stopped/deleted.
- PASS: all six migrated diagnostics executed successfully on their own local fixture. Their original guard rejection, Trip-only metadata rejection, subject/order failure reproduction, and default ACL negatives remain asserted; outputs have safe filenames.
- PASS: current fixed Guide checkout reproduces expected original `ERR_ASSERTION` at `read_grounded_turn(uuid)`, with expected hash `d678a6e2f321b3ebe7210cae6f4932b574b7a4a2620f5e9bc96faebfe25fbd82` and actual hash `613183cf023dbcaba336ea32a81afb9e693c0fafc4b950aee0c527a8565368a6`; no ReferenceError. See `guide-original-assertion-current-checkout.log`.
- PASS: unknown marked/unmarked Guide bodies and ACL mutations still rejected, `diagnostic-unknown-body-acl-check.log`.
- PASS: node syntax checks for all 12 changed/new modules and git diff whitespace check.
- Retained initial verification-harness FAIL: `diagnostic-resource-safety-first.log`. The first test cut the bootstrap before an ownership anchor; corrected harness inserts a failure while retaining both anchors. Final resource run passes.
- UNRUN here: unchanged Guide13, original59, HTTP/hosted suites; shared CI and formal fixed-ref review remain Main-owned. No managed DB, provider, Docker daemon, target, device, or production acceptance is claimed.

Invocation environment uses explicit `VP_WIKI_PG_BIN=/opt/homebrew/opt/postgresql@17/bin` and `VP_WIKI_PG_MODULE=/Users/jtsm5p/Documents/Codex/2026-10-13/v10-main/agent008-pg-client-20261015/node_modules/pg/lib/index.js`; required entry additionally sets `CANONICAL_PLACE_NATIVE_PG=1`.
