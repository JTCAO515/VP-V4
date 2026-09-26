# ADR-0026: Confirmed Chinese address on a Trip item

Status: proposed for #506. This PR defines the compatibility boundary; it does not enable address writes or mark #506 accepted. Runtime implementation needs a separate reviewed, append-only migration and producer/consumer tests.

## Context

ADR-0021 and the [TripPatch golden contract](../contracts/trippatch-golden.md) freeze the v2 operation union. An Item contains title, Day, and optional time window, with no address. The TypeScript and SQL `upsert_item` validators reject extra keys. `trip_content_snapshot` rebuilds confirmed content from `trip_items`, which has no address column. The owner-scoped `trip_place_references` read surface holds a canonical POI ID or user label, without an Item ID, confirmed Trip version, or Chinese address. It cannot be treated as a confirmed Item address.

An address must remain part of the same authoritative Trip version as the Item. A sidecar write after confirmation, a provider detail response, or text parsed from a title would create a second source of truth and cannot satisfy #506.

## Proposed decision for the implementation PR

1. Keep v2 request and digest semantics frozen. Introduce an explicitly versioned `TripPatchV3` wire shape and read/proposal/confirm surfaces. V3 retains `expectedVersion` and the existing ordered operations, and adds only `set_item_address_zh {dayId,itemId,addressZh}`. `addressZh` is a nonempty owner-entered string or `null` for an explicit removal. The Item must exist at that point in the ordered patch, so a new Item uses `upsert_item` before `set_item_address_zh`. No direct Item or address write route is permitted.
2. Treat the address as an **owner-confirmed, unverified address**, never as a provider-verified entrance, route, or live fact. The actor may type or correct the text; a place-provider observation can only prefill an editable draft. Neither a model, a provider, a Trip title, nor a place reference can silently populate the confirmed field. Normalize text consistently in TypeScript and SQL before proposal persistence: NFC, trim surrounding whitespace, reject control/bidi-control characters, and bound it to 240 Unicode code points and 1,024 UTF-8 bytes. The server derives the `owner_confirmed` source marker from the successful confirmation receipt, rather than trusting a caller-supplied provenance flag.
3. The immutable Proposal diff must show the exact before/after Chinese address for the Item, including removal through `set_item_address_zh`, Item/Day deletion and snapshot restore. The user confirms the exact proposal ID, revision, base Trip version and server digest. The owner-checked transaction applies the validated Patch and writes the new `trip_items` projection, immutable `trip_version_snapshots.content`, event, audit and idempotency receipt atomically. The saved address is read only with that confirmed snapshot version and Item ID. Stale, wrong-owner, expired, unreviewed and replay-conflicting attempts write nothing.
4. Make the migration additive. Add nullable address and provenance fields to the existing `trip_items` projection and include them in snapshot generation; never rewrite old immutable snapshots or infer addresses for them. Use one authoritative confirmation transaction for v2 and v3, with versioned validation/digest branches. Do not change the v2 digest prefix or its frozen field set. Private owner RLS, mobile-session guard, existing grants and no direct authenticated DML remain intact.
5. Old v2 readers continue receiving their documented shape. V2 title changes may proceed without losing an address. A v2 operation that changes or removes an addressed Item/Day, or restores a snapshot where an address would change, must return a clear upgrade-required outcome **before** creating a confirmable proposal; it must not drop or silently preserve unseen address semantics. V3 reads and draft generation preserve every address. Both zh/en UI and legacy locale payloads must remain decodable; old clients never interpret an omitted address as proof that none exists.
6. The address is private owner Trip data. It enters existing export and deletion coverage with the Trip Item and snapshots, and is excluded from general logs, prompts, provider requests and sharing unless a separately reviewed recipient action allows it. Rollback after applying the migration disables new v3 writes while preserving stored address content and read compatibility; no destructive down migration or replay of old snapshots.

## Implementation gates

- Contract and SQL tests pair a real owner proposal producer with native/Web confirmed snapshot consumers. Assert same Item ID, address and `headVersion` after explicit confirm, plus unchanged v2 behavior for address-free Trips.
- Adversarial tests cover wrong owner, wrong Item/Day, stale base, absent diff, changed proposal revision/digest, duplicate idempotency key, deletion, restore and legacy v2 edits of addressed content. A simulated provider response alone must leave Trip unchanged.
- Exercise migration forward compatibility and rollback behavior on an isolated database, including RLS and privacy export/delete. Only then activate the versioned API. Actual Staging and device observations remain separate acceptance evidence.
- After #555's NativeTripView/NativeTripModels ownership settles, connect the native editor and Today to the accepted v3 snapshot. Today may label the saved text owner-confirmed and unverified; it must not label it provider-current. Keep #506/#215 open until target-environment and parent offline/entitlement criteria are met.

## Rejected shortcuts

- Reusing v2 `upsert_item` with an extra address key violates the closed union and fails its current TypeScript/SQL validators.
- A `trip_place_references` join has neither Item/version binding nor saved address text.
- A sidecar address table written outside Trip confirmation would not be atomic with the Trip version.
- Parsing an Item or Trip title, or displaying an unconfirmed provider address as saved, invents structure and authority.

Revert this proposed ADR to withdraw the plan. No runtime data or migration is changed by this PR.
