# #239 selected order/PDF owner data exit

This slice adds one owner result: choose an actual Trip and up to20 owned
reference/material records, preview exported values and erased fields, explicitly
confirm export or erasure, consume the exact source-bound result and recover an
ambiguous erasure ACK using its original request bytes. It does not complete all
#239 modules or ALL2 restore/old-device isolation.

The independent `material-reference-data/1` scopes are
`reservation-reference-data/1`, `pdf-intake-data/1`, and
`material-exit-progress/1`. Ordinary native owner credentials call
`POST /api/privacy/native/v1/material-references`; no client service lease or old
core-export job is reused. Local HTTP admission requires
`DATA_MATERIAL_REFERENCES_LOCAL=1` plus accepted local Native configuration.
Default RPC EXECUTE remains denied; target activation, roles/GRANTs, credentials,
Storage, provider charges and real user data are separately UNRUN.

The actual owner/session/epoch and recent reauthentication precede all source
lookup/effects. A versioned preview binds the exact sorted selected IDs, current
source digest and Trip version. Immutable30s maximum expiry also respects original
live PDF expiry; retries do not renew it. Metadata export/erasure can work for
retained archived/expired/cancelled owned records, without exposing expired fields.
Export walks selected IDs in5-row pages, requires current final proof and caps
the whole result at1MB. Each consumer verifies rows, selection, actor, epoch,
scope, exact request digest, source binding, deadline and complete counts.

Order erasure removes only selected server reference fields/source and cascading
event/operation metadata. Minimum reference/operation replay fences survive and
are owner exportable. No external booking is cancelled, refunded or contacted;
financial ledgers and original Trip content are untouched. PDF erasure reuses the
original temporary-material eraser, clears sensitive command/POST bytes and
unapplied candidate patches, and preserves applied Proposal/history/confirmation
proof. PDF `confirmed` requires the original actual applied receipt; locator/content
hashes never qualify a provider or original-PDF verification.

New source-free exit requests/page progress and replay fences have a named owner
scope. Users may export selected exit metadata and erase selected transient page
progress; minimum immutable IDs/hashes/decision receipts remain and are listed.
Missing original bytes, device/AppGroup/share copies, external copies, financial
records and target retention are declared precisely in every result. An erased
receipt may be read beyond preview TTL only for its original current authority,
exact mutation bytes and immutable decision time within the original deadline.
Unknown/cancelled/expired/absent ACKs never become an erasure success or authorize
a fresh operation key.

Read-only source-specific `trip_list` discovers real source contexts, including
archived records and retained exit progress after a Trip is deleted. Its title is
null when no actual owned current title exists. Historical progress selection
uses its retained owner/Trip binding; it grants no permission to recreate or write
the original Trip. Ordinary Trip business readers and RLS remain intact.

Exact RPC wire, source/copy inventory and ownership are in
`lib/server/privacy/material-references/WIRE.md`; independent row and result
decoders are adjacent. Main review655b3f accepted the bounded owner seam and the
archived/expired metadata/cleanup and immutable recovery boundaries. Source-only
implementation, synthetic consumer fixtures, disposable SQL/real signed Auth,
Native simulator, target environment and user/device acceptance remain distinct.
