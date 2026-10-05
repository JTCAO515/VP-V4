# PDF intake SQL v1 (#236 F1)

SQL owner: `codex/vpj55-pdf-intake-sql-20261005`. Sole append-only migration:
`20261005070000_pdf_intake.sql`. TS/native integration stays with the paired
owners. This contract describes local implemented behavior, not target enrollment.

## Intake and original authority

`pdf_intake_v1(p_action text,p_trip_id uuid,p_input_bytes text,p_expected_epoch bigint)`
accepts `preview`, `proposal`, `operation`, or `cancel`. The UTF-8 body is bounded
to 8,192 bytes and closed to the TS wire fields. Commands have 1–10 pages,
1–20,000,000 original bytes, one required date, and up to four unique corrected
date/amount/address/status values of at most 96 UTF-16 units. Calendar year zero
is rejected because the original Trip date writer cannot represent it faithfully.
ISO expiry has exactly three UTC milliseconds, is live and at most 24 hours from
admission. No retry renews the original expiry.

The installed account lock, current native session and epoch, ordinary owner,
unarchived/undeleted Trip and actual locked head are re-proved. Operation keys are
owner scoped and bound permanently to the original Trip/session/epoch. Replacement
sessions cannot reuse an old operation. A current authoritative absent read carries
no proposal, digest or confirmation fields; it grants no permission for a new key.

`commandDigest` is SHA-256 of recursively sorted compact JSON with original array
order and UTF-8 strings. Closed wire keys are ASCII. Valid integral numeric spellings
are normalized before use. `requestDigest` is separately SHA-256 of the exact original
proposal POST bytes, including whitespace and property order. Reusing a submitted
key with changed bytes rejects. No raw PDF or full page/line text is persisted.

The preview uses the current original Trip snapshot and matches the paired TS
`buildPdfPreview`: stable document/field IDs, duplicate detection, append-only
corrected alternatives and conflict labels. Existing dates, time zones, fixed times,
titles and relative item ordering are preserved. Same-ID content collisions reject.
Amount/status/address remain user text qualified as `user_checked_local_pdf`,
`local_only`, with order verification unavailable.

Only `create_trip_proposal_patch` creates the proposal. Its original visible diff
and explicit exact-digest confirmation remain required. The `pdf_intake` marker,
immutable operation binding, revision/patch/expiry fingerprints and original writer
prewrite/deferred-event guards prevent ordinary successor revisions, TTL extension,
wrong session, cancellation, stale head or erased material from escaping the bounds.
The original writer function and ACL are preserved apart from its checked guard hook.

`confirmed` requires the original applied `trip_events.id`, owner/Trip/proposal,
base+1 resulting version, matching original idempotency digest/outcome and actual
version snapshot. `confirmationEventId` and `resultingVersion` are null in every
other state. Later Trip changes do not invalidate this historical recovery proof.

## Cancellation, erasure and locking

Cancel-before-submit creates a durable tombstone. Cancel of an unconfirmed proposal
uses the original rejection contract, erases command/POST bytes and corrected
candidate patch, and retains minimal operation/digest/ID replay denial. Cancel after
actual application returns the original confirmed receipt and never undoes a Trip.

Expiry is enforced before confirmation and again at actual transaction commit.
`pdf_intake_prune_v1(p_limit)` is a bounded service retention worker; operation reads
also erase expired temporary material. The retention worker remains disabled by ACL
until explicitly enrolled. Actual scheduled target retention is UNRUN.

Mobile replacement/logout or deletion of the original Auth session erases its
temporary material. Trip deletion/archive admission erases candidates **before**
the installed write fence is established; failed admission rolls back atomically.
Physical Trip/account deletion cascades feature records. Applied proposal/Trip
history remains subject to the original Trip/account lifecycle.

Account locks precede proposal/Trip/operation locks. Contending trusted paths use
NOWAIT and abort without partial application; no JWT/GUC override or privacy fence
bypass is introduced. Every feature table has private RLS and all public/private
RPCs default deny PUBLIC, anon, authenticated and service_role.

## Controlled export

`pdf_intake_export_v1(p_input jsonb)` is the explicit versioned handler, requiring
exact `{version,requestId,leaseId,generation,cursor,limit}` and version
`pdf-intake-export/1`. It uses the installed export job lock, policy, owner/session,
generation and current lease. No caller-selected owner or separate export authority
exists. Page/row/cursor progress is actually recorded, source revision and live
material deadline invalidate later pages, commit and controlled ready disclosure.

Export includes bounded corrected fields only while material is live and in the
bound current session, minimal operation metadata, original-PDF/full-text absence
and local-only qualifications. Erased rows export only minimal denial metadata.
The original core artifact commit validates the actual PDF page progress for the
`user_artifact` module; unenrolled modules cannot claim complete. Pre-version jobs
and already completed packages are not retrofitted. All-user-data completion stays
false. Target handler/worker enrollment, paid providers, Storage and real user data
were not activated by this migration.

## Local verification

See `artifacts/VPJ-55/sql/verification.md`. The network-none PostgreSQL fixture
explicitly grants only its own disposable test RPCs after proving default deny.
Its administrator-created Auth rows/claims are synthetic. The paired TS owner
separately owns actual signed Auth/Native HTTP/PDFKit joint evidence.
