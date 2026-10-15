# Real Section integration (supersedes optional addressBinding candidate)

Product source: `TripAddressSection.tsx`, `useAddressActor.ts`, `actor.ts`, `online-proposal.ts`. The earlier `TripCanvas.candidate.patch` and its pins are historical and must not be applied as the final integration: no caller supplied its optional binding. Main owns current Canvas/Editor and serially integrates this Section.

`TripAddressSection` now calls the real `createPasswordAuthClient().auth.getClaims()` and `onAuthStateChange` itself. Verified UUID sub/session_id, authenticated role, non-anonymous claims and future exp form an ephemeral identity; a local monotonic generation forms the root key. There is no static actor/default or session-object fallback. Visibility changes, pageshow, online/offline, auth events, expiry and an 8s claims timeout invalidate immediately. Async claim results cannot restore a superseded root. Cleanup unsubscribes and aborts. Facts are hidden while no current verified root or confirmed data is available; server current-Cookie owner/RLS remains the authority.

Canvas mount contract:

```tsx
<TripAddressSection
  tripId={tripId}
  data={data}
  locale={locale} // mount only for zh/en
  pending={pendingProposal}
  blocked={mutation !== null || pendingRollback !== null || initialProposalReference !== undefined || localEditorAddressBlocked}
  settledEpoch={addressSettledEpoch}
  onPrepared={setPendingProposal}
  onAddressRequestBlockChange={setAddressRequestBlocked}
  onAddressConfirmBlockChange={setAddressConfirmBlocked}
/>
```

`data` is the original current `LocalTripRead`, with `confirmationState:'confirmed'`. Identity/snapshot mismatches or unknown confirmation fail closed. Parent `pending` also blocks new edits inside Section. `localEditorAddressBlocked` is Main's newly leased stable `onAddressBlockChange` observer reporting old editor dirty/busy/unavailable; this line does not edit the old editor.

`setAddressRequestBlocked` and `setAddressConfirmBlocked` must be stable React state setters. The request lock blocks new mutation producers during POST/unknown ACK. The confirm lock blocks ONLY original Confirm, via Main's leased `addressConfirmationBlocked` flag; it must never disable Reject/cancel/LoadLatest. The old combined `onAddressBlockChange` Section prop is removed (the old editor observer keeps its original name). Use its boolean to disable other new mutation producers during this Section's POST or unknown ACK. **Do not feed that same boolean back into Section's `blocked`**: doing so prevents its GET-only recovery. External blocked includes the original parent pending/rollback/mutation/initial-reference and editor dirty/busy/unknown, excluding the Section's own lock. Once an exact pending Proposal is handed to `onPrepared` and its identity/confirmed review root remains qualified, Section releases the request lock; original pending blocks other producers and its original Confirm/Reject remain available. If identity/confirmed review becomes unavailable and hides the address diff, Section reasserts the parent lock until the review root is requalified, including for a restored pending proposal without a local request ledger.

`addressSettledEpoch` uses exact `applied:<proposalId>` or `rejected:<proposalId>` tokens, emitted only when the original parent authoritatively reads that exact terminal confirmation/cancellation. Generic epoch changes and another proposal's terminal token never settle an intent. Pending becoming null, a read failure, local cancel, a random render or auth refresh cannot advance it. It allows a handed intent to be dropped after settlement, then forces a new address read. Unknown requests never clear just from this epoch: first recover the exact original diff via GET and hand it to the parent. After Confirm, reload authoritative Trip content/version first; the Section re-reads at that version and never projects draft text into saved UI. Main must preserve existing confirmation idempotency/revision/digest/unknown-ACK/readback and actor-root fences.

Section owns real same-origin Cookie `POST /api/trips/:tripId/proposal` with exactly `{patch:{expectedVersion,operations:[set_item_chinese_address]}}`, browser-managed Origin, no custom CSRF bypass and an 8s AbortController covering POST and pending read. A successful POST must return exactly proposalId/revision/baseTripVersion. The next GET uses that exact proposalId. Pending read checks current Trip/version, exact id/revision/base, pending/nonstale, digest/expiry, exactly the original one operation, authoritative before/after versions/item and codec-valid unverified after text. `onPrepared` only receives that validated original pending object. Section never calls Confirm/Reject or creates a Goal.

Any transport/non-2xx/malformed/lost ACK retains original bytes/context and blocks resubmission. Recovery has no POST path: known receipts GET by exact id; lost receipts GET current original pending and accept only an exact matching operation/base/item/before/after with a valid digest, then delegate explicit review/Confirm to the original parent. A failed/empty/stale GET does not settle or clear the intent. Old contexts/actors cannot publish into current Trip. Same actor/session can requalify under a new generation for GET-only recovery; request bytes remain unchanged. The in-memory ledger stores unresolved request identities/bytes, not a new confirmed address store, and is not persisted or sent to models/maps.

PASS: added 6 contract cases against actual actor gate and HTTP functions, including mocked timer expiry/8s claims timeout; prior 13 cases reused, plus one actual Section SSR fail-closed case (20 total). Network calls in these tests are deterministic fetch doubles, not real Cookie/backend execution. Initial Node strip-only failure from a TypeScript parameter property was corrected to a regular property; no runtime/test check was weakened.

UNRUN: integrated Section/browser event and draft/prepare/Confirm/Reject interaction, real Cookie route/DB persistent same-resulting-version readback, and parent mutation CSRF/unknown-ACK/cancellation runtime. Main owns these checks and shared integration. No simulator/build/deploy/production/provider or shared dependency changes occurred.


## PR720 actor and snapshot-delta review repair

Current claims alone no longer qualify inherited Canvas data. For every root/generation and every trip/pending input fingerprint, Section issues ordinary current-Cookie GET `/api/trips/:id` then original pending GET (exact proposalId when expected). Same claims-root CAS and AbortSignal fence every await; 8s timeout remains. The returned Trip content/version/confirmation state and full pending identity/revision/digest/base/before/after must match the parent's original authority data before a display lease is issued. A failed/403/late read leaves all Section manual facts and diffs hidden. Same actor/session revalidation also requires fresh reads; B cannot inherit A's previous lease. No returned Trip payload is installed as a new store or sent to a model/map. Parent stale/unknown data is recovered through its original enabled LoadLatest; Section also offers a read-only recheck. No-pending requires exact 409 PROPOSAL_NOT_CONFIRMABLE, not any read failure.

Review now projects the union of original Proposal before/after addresses, rather than using set operation presence or requiring all targets in current items. Rollback clears, additions, deletions, restored items and moves therefore show actual raw before/after user-provided/unverified text. A move appears as old-day removal plus new-day addition. Future/restored target rows are rendered separately from current saved item cards. Grounded references remain separate and source-read availability never determines manual diff confirmation.

Main integration required: replace old Section `onAddressBlockChange` with the two exact callbacks above; use confirm-only state for `TripContentEditor.addressConfirmationBlocked` and any original Canvas Confirm entry; leave Reject/read/cancel enabled. No shared file is changed by this owner. Tests cover actor A→B denial→A reread, same-session root replacement, pending digest/version mismatch, exact absence, original snapshot rollback/restore/move projection and actual SSR rendering. Browser/real Cookie/DB/CI evidence remains Main-owned.
