# IOS-004 Web source and integration wire

Owned implementation: `components/trip-address/**`. This file is integration evidence for Main, not a second project handoff. Shared files remain untouched.

## Read port (Main/backend must agree before mounting)

Default browser GET: `/api/trips/:tripId/addresses?expectedTripVersion=N&dayId=D&itemId=I`, same-origin cookies, `cache:no-store`, no redirect, 8s consumer timeout/AbortSignal. Response:

```
{ kind: "conflict" | "unavailable" | "blocked" }
// or
{ kind: "addresses", context: {tripId,tripVersion,dayId,itemId},
  userProvided: {kind:"missing"|"unsupported"}
                | {kind:"provided",address:{text,source:"user_provided",verification:"unverified"}},
  reference: {kind:"missing"|"unavailable"|"not_qualified"}
             | {kind:"qualified",entries:AddressReference[]} }
```

This matches Main's 2026-10-16 relayed `lib/server/trip/address/read.ts` candidate, read from the backend owner's actual checkout. It is not yet an integrated source dependency here. Qualified entries retain original supportId/receiptId/placeReferenceId/version/scope/status/applicability/claim/claimRevision/payloadHash/sourceDigest/sourceRefs; backend adds `chineseText` and `expiresAt` (minimum evidence expiry). Browser rechecks exact context, valid GroundedClaim, metadata/trace refs, actual address-line script classification and exact minimum future expiry. The original server reader still owns current mapping/source/RLS/TTL eligibility. A client cannot grant it.

`reference:missing` is a successful empty result; unavailable/not_qualified are shown as unavailable. Top-level conflict/blocked/unavailable and malformed envelopes never become missing. `userProvided` is the backend's shared codec read of the same confirmed snapshot. Missing in old stored JSON is compatible only after a successful authenticated read; read failures must never turn into missing. No NativeBearer/service-role credentials enter this browser consumer.

Chinese observation uses actual `claim.value.lines` only, including unknown scripts. Origin, observation and validity are separate. No title/country/default/POI inference. Optional `AddressReader` allows the parent to use the agreed Cookie request wrapper with its original timeout and current-root fences, without changing the wire. Default GET matches the backend owner's actual route draft; no runtime success is claimed.

## Original Proposal callback (no new writer)

`AddressPrepare(request): Promise<void>` receives `{context:{actorKey,tripId,tripVersion,dayId,itemId},patch:{expectedVersion,operations:[{kind:"set_item_chinese_address",dayId,itemId,text:string|null}]}}`.

Implement this in the original authenticated Proposal controller using current Cookie/CSRF/request-scope and existing prepare service. Verify actor/root/route/current version/item again immediately before dispatch and after each await; bind to the captured generation, not a later mutable Trip. A resolved callback means prepare request acknowledged only. The candidate then uses original `readPendingProposal`, mounts the original pending state and adds `AddressProposalDiff`; original Confirm/reject/readback owns every subsequent transition. Never confirm or write Trip from this callback. Existing Proposal revision/digest/base/idempotency/reconciliation/explicit cancellation remain authoritative. Do not recover an unknown prepare ACK by resending or creating a new Goal.

`blocked` must include pending rollback/proposal, parent mutation, unknown ACK, actor transition, and any unresolved original local editor draft. `actorKey` is opaque current authenticated actor/session-root identity plus root invalidation generation, not tripId, static string or locale. Do not persist/log it. Canvas currently has no such exposed prop; Main must bind it to its accepted identity root. Parent checks server-side actor/root too; the opaque key alone grants no authority.

`settledEpoch` changes only after authoritative cancellation/terminal readback/reconciliation. It remounts the draft and forces a fresh current read. Do not derive it from transient pending disappearance or increment it to retry unknown ACK. Preparing freezes local edits. Local draft cancellation writes nothing. Parent explicit reject/cancel retains original request identities and resolves through its original authority. After confirmation, refresh authoritative Trip then read addresses at its resulting version; never project the draft into confirmed UI.

## Exact shared candidate

`TripCanvas.candidate.patch` is NOT APPLIED. `candidate-pins.json` pins actual before/patch-result bytes from this checkout. It adds imports, an optional parent binding and per-current-item address/diff JSX only. It does not change the existing Confirm/reject/editor/SaveAskAdd/directions subjects. Main reviews/applies serially, implements the authenticated binding and any necessary existing editor diff hunk under its own lease. Optional binding is deliberately absent until the real read and Proposal callback are connected; absence is not product acceptance.

Parent old TripContentEditor `SnapshotContent` and local draft functions are unchanged. The shared backend must preserve `chineseAddress` on old upsert/title/time/order and snapshot round trips. The new diff consumes original before/after and requires an exact address operation, same base version, digest, and matching saved after text; it supplies no confirm button or authority.

## Verification and remaining integration

PASS: 10 Node contract cases (7 web + 3 unchanged shared codec); 3 SSR render cases using the actual TSX component. Cases cover both languages, escaped original text, separate origins, unknown script, false-missing prevention while unloaded, current version/item, evidence/TTL, revoked/unmatched sources, late/actor/unmount fences, failed reads, original prepare operation/null clear, bounds, forged verification, no confirm/retry, original proposal before/after and stale/mismatched diff rejection.

PASS: TypeScript `--noEmit --incremental false`; source-policy lint. Typecheck initially caught a test-only assertion narrowing and was fixed; no production type issue was suppressed. Test loader transpiles TSX in memory and stubs CSS module names for SSR; it is not a browser or visual acceptance.

UNRUN: actual Cookie route/backend persistence joint tests; parent CSRF/8s mutation/unknown-ACK/idempotency/cancel runtime; same-resulting-version authoritative reload; integrated browser/responsive interaction; provider/target/device/VO/release/CI. No shared database, model/map/provider calls, dependency install/cache writes, heavy App build, simulator or deployment used. Full #506 remains open for Main's complete original scope.
