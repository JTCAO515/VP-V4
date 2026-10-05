# VPJ-55 F1: bounded Files PDF correction in the same Trip

Scope: [#236 F1](https://github.com/JTCAO515/VP-V4/issues/236), using the original
[#507 screenshot correction and Proposal boundary](https://github.com/JTCAO515/VP-V4/issues/507).
F2 Share Extension/AppGroup/Universal Link/login routing is a separate unfinished result.

The Trip screen opens Files for one PDF with extractable text, at most ten pages and
20,000,000 bytes. The device bounds the security-scoped read, rejects malformed,
encrypted and active-content PDFs, and preserves original page and line numbers.
Text limits reject the review without silently truncating pages or text. A scanned
or image-only page is visibly unavailable; the existing screenshot review is a fallback.
The original Files document is never modified or deleted.

The user selects source lines and checks up to four fields: date, amount, address,
status. Date is required and must be a valid calendar date the original Trip writer
can represent (years 0001–9999). Corrected values are at most 96 UTF-16 code units.
No dates, amounts, addresses, orders or provider qualifications are inferred.
The protected device copy expires within 24 hours and is cleared on Close, cancellation,
logout, account replacement and the relevant local-data deletion. Source values and
copies are excluded from general logs and backup.

Preview sends only the corrected fields, original bytes hash and page/line/source-line
hashes through the existing ordinary Native identity/epoch boundary. PDF bytes and
page text stay on the device. The SQL preview compares the actual owner-scoped Trip
head. It displays added, duplicate and conflicting corrected content. Proposed changes
are additive: conflicting alternatives retain every existing date/activity/booking,
fixed time window and original relative order. A changed/colliding saved ID rejects.
Unknown order verification, source rights and future feasibility stay unavailable.

After the user reviews the comparison, the server creates an immutable PDF-bound
proposal using `create_trip_proposal_patch`. The original Trip diff and original explicit
confirm are still required. A permanent PDF marker and original-writer atomic guard
revalidate proposal/revision/digest/patch, owner/session, preview, TTL/cancellation and
current head. An ordinary revision/successor cannot escape the material binding.
Neither preview nor proposal creation changes the saved Trip.

An unknown ACK retains the exact original request bytes and operation/Trip/actor/endpoint
binding. The same operation is read before retry; retries keep the original bytes.
`confirmed` requires the original applied event, proposal-bound idempotency receipt and
version snapshot, with exact event ID and resulting version. A higher head or proposal
creation is insufficient. Cancellation fences a late same-operation POST, rejects an
unconfirmed proposal and preserves already-applied Trip data. Strict empty cancellation
tombstones are accepted only on explicit cancellation; mixed bindings reject.

Persistent temporary values are scrubbed on TTL, session change, archive and Trip deletion.
Minimal replay-denial hashes survive temporary payload erasure; account/Trip physical
deletion follows the existing cascades. Owner export uses the current privacy request,
policy, session, job generation, source revision and exact lease. PDF/raw text are absent.
Unenrolled handlers produce an honest partial/ unavailable export rather than a full-data
completion claim. New feature RPCs, retention worker and export handler default deny;
the disposable test-only GRANT does not enroll a real environment.

Exact wire and algorithm: [feature wire](../../lib/server/intake/pdf/WIRE.md),
[closed command/DTO](../../lib/server/intake/pdf/contract.ts),
[additive preview](../../lib/server/intake/pdf/preview.ts).
Evidence is recorded in [VPJ-55 artifacts](../../artifacts/VPJ-55/).
Local synthetic PDFKit/SQL/Auth/Native HTTP evidence does not claim physical-device Files
selection, target deployment/enrollment, actual private documents or provider acceptance.

Rollback removes the feature entry/consumer; preserve the append-only migration,
original confirmed Trip history and its replay-denial lineage. No rollback reopens
expired/cancelled/deleted material or enables F2 entitlements/signing.
