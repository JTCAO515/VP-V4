# VPJ-23 H3 native accommodation comparison slice

The confirmed native Trip is the only source for the suggested date span. The
client takes the earliest and latest valid Trip days, suggests checkout on the
following day, and labels this as a window to confirm, not a booked stay. An
unconfirmed Trip, invalid date, or span over 90 nights yields no suggestion.
The view checks the active owner scope, Trip ID, version and confirmation state
before displaying the comparison.

The current Trip snapshot has no structured occupancy, bed, budget, lodging
intention, or exact place and route IDs. The #199 native preference projection
currently covers travel pace only. Explicit current-Trip lodging input is saved
only when the user acts, in the existing device-private offline Trip vault as
`native-lodging-local/1`. The record binds endpoint, owner, mobile epoch, Trip
ID, record revision and confirmed Trip version. It stores explicit stay dates,
party/room counts, bed choice, budget currency and basis, intention, at most two
user-selected public hotel names/place references and one tentative selection.
It stores no supplier result body,
inventory, quote or booking confirmation. AES-GCM associated data binds the
namespace and record purpose; the key is device-only Keychain material and the
file uses complete protection and is excluded from backup. This is not cloud
sync or a new server authority.

Reading a saved record requires the current owner/endpoint/epoch and exact Trip.
A changed Trip version preserves the user's stated intention but requires
explicit review and resave before an exit or proposed Trip edit. Already
booked, not needed and deferred states suppress comparison and booking prompts.
The native comparison also reads the current owner/Trip/version-scoped #214
reservation references. A current user-reported reserved or amended lodging
reference suppresses fresh booking prompts; it is labelled as the user's report,
never supplier verification. A failed, stale or incomplete bounded read is
unknown, not evidence of no booking. An `unknown` lodging status on any page
remains unknown across later empty pages; an active reserved/amended report
takes precedence. The user must explicitly acknowledge a
replacement before comparing while an active or unread report may exist.
This read does not modify the reference or the confirmed Trip.
Account sign-out and Trip deletion use the existing vault purge; the same view
provides deliberate per-Trip deletion and an exact preview of user-entered
export data. An inaccessible or corrupt record fails closed instead of being
silently replaced. Export excludes account namespace, credentials and supplier
observations; copies shared outside the app cannot be recalled.

The user selects a first or last saved Trip item, supplies a public place name
and search city, and confirms an AMap search result for that destination. The
Trip item title and private notes are never sent as provider query text. Two distinct area
reference points are selected the same way. The native client consumes the
existing owner-scoped #363 place search and #364 route comparison endpoints.
When a user selects an exact hotel map point for an area, that point becomes
the route origin; otherwise the explicitly selected area point is the origin.
The result never proves room availability or hotel classification by itself.
Only a pair of complete, current three-mode route responses whose provider IDs
match the selected points and share an observed mode can show planning duration.
A failure for either area leaves both routes as gaps. The route observation is for
departure now, expires after five minutes, and is never presented as a
forecast for the Trip date. Missing, failed or expired routes show a gap.
The item title alone is never interpreted as a verified entrance or route.

Optional hotel names start as user-entered notes, not verified candidates. An
explicit map selection may add a provider/canonical POI identity for each of
the two displayed areas. The separate
`lodging/context` ordinary-owner read can upgrade only a current, matching,
reviewed hotel-classification receipt to `reviewed_hotel`; this still proves no
inventory, quote, bed match or foreign-guest eligibility. Missing or expired
classification stays unknown. Area order is user order, with no commission
input. Budget is labelled with currency, room count and per-room-per-night or
whole-stay basis as the user's limit, never a supplier price.
The user may explicitly request the #199 eligible saved travel pace for a
single context preview; it is not persisted as lodging input, never supplies
bed or budget, and does not affect candidate ranking. No management list or
unqualified Memory value is copied into the local lodging record.

H4 keeps tentative selection, official search, external opening and Trip edits
distinct. The selected public name and explicitly confirmed date/party fields
prefill the existing VPJ-22 allowlisted handoff; the user reviews which fields
are sent and the supplier remains the source of booking truth.
Booking.com requires at least one adult per room before its bounded parameter
link is prepared. For a user-confirmed party with more rooms than adults, the
Trip.com generic official search remains available without transmitting guest
or room counts; every condition must be re-entered and verified there. A one-item
first/last-day Trip draft can be prepared only for an existing user-selected
item with a user-written replacement title. It uses the existing fresh Trip
read and Proposal/diff/explicit-confirm writer; selecting a hotel or opening a
link never changes the confirmed Trip.

Real account, source-publication, supplier, travel-date-route and target-device
evidence remain separate acceptance work. This change adds no server persistence
domain or supplier order action. Rollback removes the consumer UI and local
vault record read path while retaining already confirmed Trip history; it must
not restore deleted local selections or revoked source rights.
