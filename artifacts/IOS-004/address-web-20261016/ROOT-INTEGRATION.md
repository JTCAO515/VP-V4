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
  onReadCurrent={readCurrentAddressTrip} // original GET-only reloadAll with actor/scope CAS
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

## Reference display lease follow-up

The address read controller now caps current reference display at the earlier of 30 seconds from read start (monotonic elapsed time) or evidence expiry. Its timer only publishes referencesUnavailable with an empty reference list; it preserves the same confirmed manual read/context unchanged and never calls fetch or increments refresh. The existing explicit Read again button performs the next current-Cookie address request. Actor/version/route/unmount invalidate and clear the timer. TripItemAddress's former expiry-triggered automatic read has been removed. This is display freshness, not provider polling or a new source permission.

PASS: two new fake-clock controller cases for the 30-second cap, earlier evidence expiry, no reads after expiry/long idle, exact manual bytes retained, explicit refresh and invalidated old-scope timer. Existing seven flow cases reused. Full unrelated matrix/browser/provider/DB checks were not rerun for this local follow-up.

## Unknown-ACK resume recovery qualification

The root now separates two leases. A fresh exact current-Cookie Trip GET under the current same claims root issues a **recovery-only Trip lease**. The full display/new-prepare lease still additionally requires the pending GET to match parent pending (including strict authoritative absence when parent pending is null). A server 200 pending while parent expects null still fails that full proof; it never admits a fresh POST or renders old pending/manual data.

The unknown-request GET-only recovery control is outside the full-qualified display branch, but requires the recovery-only Trip lease and the original intent's exact subject/session identity, Trip/version/item and current-root CAS. It then calls only the original pending GET; exact original request operation/text/before/after/base/id/revision/digest checks must pass before handoff. Thus a lost POST ACK followed by pageshow/same-session generation change can recover its now-existing pending even while the parent's pending is null. Parent updates to the validated pending then trigger the strict full display qualification before its diff/Confirm becomes available. New actor denied by the Trip RLS GET gets neither lease nor recovery control. No Main shared hunk or new prop is needed.

Targeted tests cover lost POST→resumed Trip proof→server own pending 200→GET-only handoff, retained original bytes/no second POST, unrelated pending rejection, B/RLS denial, late root rejection and unchanged strict null-pending absence proof. The earlier combined-state deadlock is recorded as a real failure; the absence check itself was not loosened. Main owns the actual pageshow/browser reproduction.


## Explicit unknown-attempt current read / local abandonment

New required prop: `onReadCurrent: () => Promise<unknown>`. Main implements this with its original GET-only current Trip/pending reload, fencing the parent's own publications by actor/session-root and route generation before/after awaits. Section also checks the same current verified claims root, exact original intent identity, current route and mounted owner around the callback; it does not adopt the callback result as a receipt or install a new Trip authority. Important: while an unknown attempt still exists, a read error/unavailable result must not unmount/reset the Section owner and thereby silently discard the unresolved bytes. Preserve it until a matching authoritative receipt or explicit abandonment.

The unknown notice is now visible to the same verified subject/session and Trip even if parent data is an older head and the exact Trip display/recovery lease cannot be obtained. It exposes “Read current Trip” (only the new callback), and a separate local-abandon action with a second explicit confirm and a keep-request option. The GET-only original-proposal recovery button retains its stricter fresh exact Trip proof. B never sees or acts on A's ledger. A changed head, missing pending, failed read or auth revalidation never automatically clears the original attempt.

Only the second explicit local-abandon confirmation may delete that same current unknown ledger entry and clear its stored request bytes. It does not call POST/reject/confirm/undo, does not assert failure/applied/rejected, and cannot delete another actor/Trip entry or a handed attempt. Then it calls only `onReadCurrent`. Existing cached display bindings are invalidated; any future new edit still requires fresh full current-Cookie Trip/pending qualification and authoritative no-pending. Actor/scope replacement while awaiting the current read prevents local adoption. Original POST bytes remain intact for the read-only action and for cancelled abandonment.

Main hookup candidate is only the new JSX prop shown above, with its existing original reload callback wrapper; no shared file is modified here. No extra status API, persistent store or service cancellation is added. Targeted tests validate no extra POST, changed-head/missing-pending reads retain unknown bytes, explicit confirmation and same-scope CAS, sibling/handed retention, local byte clearing without server undo, and late root rejection. Main owns the actual advanced-head browser scenario and callback-publication behavior.

## Existing address JSON content visibility callback

Optional Section prop: `onAddressContentVisibilityChange?: (visible:boolean) => void`. Main supplies a stable state setter, initially false, and uses it only to hide/disable existing raw JSON controls containing the new address kind/field. Do not clear/normalize original bytes. Legacy JSON without new address fields is unchanged.

This callback reports exactly the fresh current-Cookie Trip content lease (`tripQualified`), not the Confirm lock or the stricter pending display lease. It is false without current verified actor, on root/generation/session/Trip/version mismatch, after a denied/failed current Trip read, and on unmount. Pending may be null: B still cannot inherit A's previously read Trip lease. Same actor/session under a new generation must reread before true. Layout-effect delivery invalidates existing raw address UI before paint when the Section commits an invalid root; no render-time parent state mutation is used. Only content visibility is reported: it does not grant fresh POST or Confirm.

Targeted production-predicate tests cover initial false, successful exact Trip read, null pending, invalid current root, B/RLS403, A return requiring reread, and Trip/version replacement. Main owns raw textarea masking and its actual A→B→A browser verification. No shared Canvas/Editor file was edited here.
