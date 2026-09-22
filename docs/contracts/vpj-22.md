# VPJ-22 — ordinary official hotel search handoff

Related to #212. Scope: native Tools → Hotel search → review → official HTTPS exit.
This does not implement VPJ-23 comparison, VPJ-24 order import, inventory, booking or payment.

## Input and destination boundary

`NativeHotelSearch` accepts only an explicitly entered public hotel/city search text,
Gregorian check-in/check-out days, adult/room counts and a children-present flag.
It never reads Trip text, guest identities, passport/health information, provider room SKUs,
credentials or user/order identifiers. The UI warns against entering personal information.
It is an explicit search field, not a semantic personal-data detector.
There is no persistence, request log, analytics event, inventory fetch or Trip mutation.

The review action is local. Only the final named-provider Open action hands the URL to
SwiftUI `openURL`. The receipt expires after 15 minutes or when check-in is in the past.
System acceptance means only that the device accepted the URL, never page-load success or booking.
`prepared`, `opened`, `openFailed` and `expired` remain distinct; no booked state exists.
There is no automatic cross-provider retry or background transmission.

Host, scheme and path are fixed in code. `URLComponents` encodes each query value;
search text cannot inject another host, fragment or attribution field. Empty/control-character,
overlength and URL-like text, invalid calendar dates, past arrivals, non-positive stays,
stays over 90 nights, invalid counts and rooms exceeding adults fail closed.

| Exit | Sent | Explicitly omitted / needs re-entry |
| --- | --- | --- |
| Booking.com `/searchresults.html` | `ss`, `checkin`, `checkout`; adult-only: `group_adults`, `no_rooms`, `group_children=0` | Exact hotel identity, filters, foreign-passport eligibility; with children, **all occupancy fields** omitted because ages are not collected |
| Trip.com `/hotels/` | No query parameters | Hotel/city, dates, all occupancy and filters |

Hotel text is a search hint, not a hotel ID or a guaranteed hotel selection. The review
explicitly asks the user to select the hotel again and check every field at the destination.
Child searches explicitly require re-entry of all guests, ages and rooms; no age or zero-child
value is invented. Multi-room allocation, prices, taxes, cancellation and admission conditions
must be checked with the supplier. The application makes no price or inventory claims.

## Attribution and data use

Both links work without an affiliate account. VisePanda adds no affiliate ID, commission,
tracking label or claimed conversion. A destination may add its own session/marketing fields;
these are not copied back, stored or represented as VisePanda attribution. No provider content
is imported, cached, embedded, translated or added to a model prompt by this feature.

Current evidence: [verification](../../artifacts/VPJ-22/verification.md) and
[remaining acceptance](../../artifacts/VPJ-22/unrun.md). Browser observations do not establish
installed-provider-app or physical-iPhone retention. #212 remains open.

## TourMind candidate

Decision: **defer adoption for this exit slice**, retain the candidate from #212.
Source/version: the live VPJ-22 issue body read on 2026-09-22. No source repository,
fixed source revision, remote API account or content permission was established in this task.
Query entitlement, fees/total-price basis, foreign-passport metadata, provenance/version and
per-field display/storage/model-use rights are **unknown / UNRUN**. Source reuse licence and
remote API/content rights require separate evidence if adoption is pursued; neither implies the
other. No provider approval is being awaited, and this candidate does not gate ordinary exits.

## Rollback

Revert this PR to remove the two Hotels files, test registration and single Tools row.
No schema, production configuration, account or stored-data rollback is involved.
