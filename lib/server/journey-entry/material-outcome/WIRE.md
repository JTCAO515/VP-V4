# Original material outcome association (internal only)

This is a read-only source consumer for #203 E2. It adds no HTTP wire, RPC,
Result artifact, measurement Signal variant, storage, provider or Trip writer.
It returns qualification evidence to an original owner, never activation itself.

`readOriginalMaterialOutcome(requested, request, config, protectedSelection=null)`
composes ordinary authenticated existing sources and disposes their request scope.
Missing protected selection, malformed source and screenshot refuse before network.
The callback is acquired from the original guarded-selection holder inside the
request lifetime. Caller JSON, a local success ACK or Trip equality cannot implement it.
No such live holder is installed by this package; default is unobservable.

Canonical source (matches the accepted E2 source shape):

```ts
{ kind: 'native_entry', logicalId, entry: 'e2',
  anchor: { kind: 'trip', tripId, tripVersion, medium: 'pdf' | 'screenshot' } }
```

`tripVersion` is the selected pre-material base version. The original holder must
establish selection before material bytes/OCR. Retry preserves the same logicalId
and original proposal body; only explicit new selection rotates identity. This
consumer does not create or rotate selection. `readSelection(logicalId, signal)`
must return null for absent, withdrawn, replaced, expired or unprotected lineage.

Closed internal guarded selection:

```ts
{ actor: { ownerId, sessionId, mobileEpoch }, source,
  boundary: 'before_material_read', state: 'current', expiresAt,
  originalProposalBytes,
  presentation: 'rendered_confirmed_readback' | 'unknown' }
```

The exact original bytes contain only `{command, reviewedPreviewDigest}` from the
original PDF proposal request. No caller may manufacture that protected association.
The consumer rejects duplicate JSON keys/unknown fields, binds original request bytes,
complete parsed command, preview digest, operation ID, epoch and selected Trip/base.
The original `pdf_intake_v1('operation', ...)` receipt supplies confirmed state only
through existing `confirmation_v1` event/proposal/idempotency/version_snapshot join.
No new version-read RPC or SQL query substitutes for it.

Eight sequential domain reads within 15 seconds: actor, guarded selection, original
PDF operation, Trip, same operation, same Trip, same selection, same actor. Reads
recheck archive availability, full receipt immutability, source expiry and exact snapshot.
The existing getTrip returns current head only: head must equal resultingVersion,
never greater-than-or-equal. Later head is unobservable; no historical fallback.
Original adapters bound every fetched body to 64KiB and refuse history above 64 rows.
Cancellation aborts underlying transport; no retries, writes or retained queue.

Qualified internal evidence:

```ts
{ kind: 'qualified', source, actor,
  original: { operationId, proposalId, proposalRevision, confirmationEventId,
    baseTripVersion, resultingVersion },
  presented: 'observed' | 'unknown', adopted: true, saved: true }
```

`observed` requires the protected holder's actual confirmed-readback render evidence;
otherwise presentation is unknown. A lost confirmation ACK can recover only when
the original operation and exact current readback independently qualify. Upload,
OCR, parse, preview, click, pending/rejected/cancelled proposal and client success
are never qualifying outcomes. All rejection cases return `{kind:'unobservable',reason}`;
original continuation stays with the existing flow and there is no metric sink.

Main owns shared integration: verify actual original holder and exact before/patch/after
lease before applying any shared seam. No shared edits are proposed as applicable
until that protected source exists. Measurement collection/lifecycle stays default deny;
this package cannot enable it. Screenshots remain explicitly unobservable because
accepted original protected selection/material-to-proposal lineage is absent.
