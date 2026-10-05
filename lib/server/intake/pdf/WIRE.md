# #236 F1 PDF wire v1

Owners: sole TS/integrator `vpj55-pdf-intake-server-20261005`, paired Native
`vpj55-native-pdf-intake-20261005`; SQL owner assigned by Main after this audit.
This is the feature contract, not target/provider/device acceptance.

## Actual foundation and scope

Native screenshot production is protected device Inbox → corrected field draft →
`create_trip_proposal_patch` → original visible diff/explicit confirm. The TS
`SyntheticScreenshotImportStore` and `UserArtifactImportStore` are memory helpers,
not durable production material stores. PDF needs a durable operation binding for
lost ACK recovery, cancellation tombstones and owner lifecycle; no new Trip writer.

One text-bearing, non-encrypted PDF, 1–10 pages and 1–20,000,000 bytes. Native validates
the actual bounded security-scoped copy with PDFKit and rejects active content,
malformed/encrypted files and text limits without truncation. Each original page
retains its page number, every visible line its original line number. No readable
text means unavailable, with manual/screenshot fallback; no provider or fake OCR.
The original Files document is never deleted or changed. All local copies are protected,
excluded from backup, owner/session scoped, expire within 24 hours, and are cleaned on
cancel/close/account replacement/logout/deletion. This does not establish AppGroup/F2.

The server receives corrected values, original bytes hash and page/line/source-line hash
only, never raw PDF/full page text. Hashes and explicit correction do not qualify an
order, address truth, rights, provider verification or future feasibility.

## Frozen input and output

Exact types and bounds: `contract.ts`; exact additive preview algorithm: `preview.ts`.
Field values use at most 96 UTF-16 code units; four unique kinds date/amount/address/status,
date required and strict ISO calendar date (years 0001–9999, representable by the
original PostgreSQL Trip writer; astronomical year zero is rejected). `expiresAt` is UTC ISO with exactly 3
milliseconds, from the original protected local receipt, never renewed on retry.
Fields remain in command order. Digests use SHA256 UTF8 of compact recursively
key-sorted JSON (`pdfCanonical`), preserving array order. SQL must use the same canonical
serialization (including non-ASCII strings), not spaced `jsonb::text`.

`/api/trips/native/v2/{tripId}/pdf-intake/preview` POST: body is exact `PdfCommand`.
`.../proposal` POST: exact `{command: PdfCommand, reviewedPreviewDigest: sha256}`.
`.../operation?operationId={uuid}` GET: exactly one query, no body.
`.../cancel` POST: exact `{operationId: uuid}`. Same operation ID is its cancellation key.

Responses are direct PdfPreview / PdfProposal / PdfOperation JSON (no outer version).
Trip ID and lower-case UUID operation ID are always exact. Proposal/operation receipts
carry actual current `sessionEpoch`. `requestDigest` hashes the exact UTF8 bytes of the
original proposal POST body; it is distinct from canonical `commandDigest`. Native
journals the original POST bytes/owner/epoch/Trip/op/endpoint generation before sending.
For unknown ACK, read the same operation with current actor/endpoint, verify digest,
Trip/op/base/proposal binding, then recover original pending/diff or actual applied
receipt. An absent, malformed, unavailable, cancelled or expired read does not erase
the unknown journal or create permission for a new operation. Only an authoritative
absent result under the same active actor/endpoint plus retained original bytes permits
a retry of that exact operation (never a changed/recreated POST).

## Authoritative RPC slot

New append-only migration slot proposed `20261005070000_pdf_intake.sql`; Main must
reserve and assign sole SQL owner. Public `pdf_intake_v1(p_action text,p_trip_id uuid,
p_input_bytes text,p_expected_epoch bigint)` actions preview/proposal/operation/cancel.
The `p_input_bytes` string is the exact original body above; GET operation serializes
only `{operationId}`. SQL strictly checks UTF8 ≤8,192 bytes and closed input shapes.
Neither user service-role bypass nor caller-selected owner/session/target is supported.

Each RPC re-proves current ordinary owner/native session epoch, non-deleted Trip and
archive/ownership authority. Mutations serialize against original Trip/proposal locks
and the owner+operation key; exact original byte digest prevents operation reuse with
changed body, Trip, expiry, locator, correction, preview or actor. All RPCs fail closed
on missing/malformed authority. Same-owner operations cannot be reused on a replacement
session. Repeat imports compare the *current actual Trip snapshot*, never fixtures.

Preview is read-only and returns the exact `buildPdfPreview` outcome from current locked
head/snapshot. It persists no values. Proposal recomputes that same preview, checks
reviewed digest, current head, active candidate expiry (now < expiry ≤ now+24h), rejects
duplicate (no patch) and uses ONLY `create_trip_proposal_patch`; stores immutable binding
and receipt atomically. No SQL-supplied arbitrary patch or second writer. Proposal expiry
is capped at original material expiry; this cannot weaken other domain guard triggers.

Stable additive IDs/labels are in `preview.ts`. New corrected alternatives are appended;
existing activities, dates, fixed time windows, reservations and their relative ordering
remain. Same digest/field/locator/value is duplicate. Different corrected alternatives
of this document show conflict and append only; no automatic replacement. A same-ID
collision/changed saved value rejects rather than overwriting. Full original Proposal
diff/explicit confirm remains required. Amount/status are user text, never orders.

Operation read returns absent only after proving no owner/session operation row;
otherwise immutable original binding. `pending` requires the original current pending
proposal. `confirmed` requires original writer's actual applied version/receipt naming
the same original proposal, owner and Trip, never proposal creation/preview/status alone.
Revision/rejection/stale/expired states cannot re-open a candidate or manufacture a
confirmed receipt. Applied confirmation can remain recoverable after later Trip changes.
Confirmed PdfOperation additionally has `confirmationEventId` (actual original
`trip_events.id`) and `resultingVersion = baseTripVersion + 1`, proven by the
original applied Trip event + proposal-bound idempotency receipt + version snapshot.
Both are null for every other state. A head increment by itself is no proof.

Cancel records a tombstone even when no proposal exists (racing POST cannot resurrect).
For an original unconfirmed pending proposal, reject using the original rejection
contract under the same locks; purge only feature temporary values. If already applied,
preserve the original Trip/receipt and report confirmed, never Undo or false cancelled.
Cancelled/expired rows retain minimal idempotency hashes/binding only, no corrected
values/source text/PDF bytes. TTL prevents further confirmation; read cleanup must not
clear a live unknown operation. No revival after logout/delete/session replacement.
An explicit cancel ACK may clear an unknown journal only under the same active
owner/epoch/Trip/op and endpoint generation. Two exact cancelled shapes are accepted:
(A) a cancel-before-create tombstone with every digest/expiry/proposal/base/confirmation
field null, authoritatively fencing any late same-op POST; (B) an existing operation
with all original request/command/preview hashes, expiry/base/proposal ID/revision strictly
matching the retained journal. Mixed nulls or non-null mismatches reject. Ordinary
operation reads of cancelled/absent/expired never automatically clear a journal or
authorize a new op. Confirmed additionally requires its original actual applied receipt.
Close can delete the app PDF copy while preserving an unresolved server-operation journal.
PDF proposals need permanent marked lineage and a guard inside the original confirm
transaction: original proposal/revision/digest/patch, owner/session, preview binding,
TTL/cancel and current head revalidated before any Trip write. Ordinary proposal revision
or successor cannot escape this binding/extend expiry; fresh corrections require a fresh
preview and explicit workflow. Other proposal types and their existing guards remain.

## Owner lifecycle

New persisted PDF operation/material values require explicit owner export/delete handlers
integrated with the current privacy protocol/source revision/job lease and Trip deletion,
not a second independently trusted export/delete route. Before values can leave TTL,
export is owner-scoped and records original PDF absence/local-only qualification.
Deletion destroys temporary command bytes/corrected fields and candidate authority,
retains only minimal actor/session/op/digest replay denial allowed by current deletion
contracts; original applied Trip data remains under original Trip deletion. Foreign keys
and existing privacy worker hooks must be audited, not assumed from user cascade.
Native's request-bound local selection deletion must validate file identity and affect
only the selected app copy. Any unenrolled whole-account export scope is honestly partial.

## Required evidence

Actual authenticated local Native HTTP → durable RPC → original Proposal read → original
explicit confirm → same Trip read/replay. Wrong owner/Trip/epoch/head; stale preview;
lost ACK/same bytes/reused operation/changed bytes; repeat import; conflicting corrected
value preserving originals; encrypted/malformed/limits/no truncation; cancel-vs-submit/
confirm; TTL/logout/delete/export source invalidation. Target/device/provider remains
UNRUN unless actually executed with existing authorized scope. #507 checks are retained;
F1 complete does not close all #236/F2.
