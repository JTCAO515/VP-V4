# VPJ-23 H3 native accommodation comparison slice

The confirmed native Trip is the only source for the suggested date span. The
client takes the earliest and latest valid Trip days, suggests checkout on the
following day, and labels this as a window to confirm, not a booked stay. An
unconfirmed Trip, invalid date, or span over 90 nights yields no suggestion.
The view checks the active owner scope, Trip ID, version and confirmation state
before displaying the comparison.

The current Trip snapshot has no structured occupancy, bed, budget, lodging
intention, or exact place and route IDs. The #199 native preference projection
currently covers travel pace only. H3 therefore asks for the missing stay
requirements on this screen and keeps them in local view state. It does not
copy management records, save a new preference, modify Trip, or send these
fields to a provider. Already booked, not needed and later states suppress the
comparison while selected; this choice is not yet persisted across visits.

The user selects a first or last saved Trip item, supplies a public place name
and search city, and confirms an AMap search result for that destination. The
Trip item title and private notes are never sent as provider query text. Two distinct area
reference points are selected the same way. The native client consumes the
existing owner-scoped #363 place search and #364 route comparison endpoints.
Only a pair of complete, current three-mode route responses whose provider IDs
match the selected points and share an observed mode can show planning duration.
A failure for either area leaves both routes as gaps. The route observation is for
departure now, expires after five minutes, and is never presented as a
forecast for the Trip date. Missing, failed or expired routes show a gap.
The item title alone is never interpreted as a verified entrance or route.

Optional hotel names are user-entered notes, not verifiable hotel candidates.
Area order is user order, with no ranking or commission input. There is no
cached or live hotel inventory or quote on this screen. Budget is labelled
with currency, room count and per-night or whole-stay basis as the user's
limit, never a supplier price. The existing VPJ-22 official-link handoff
remains a separate action.

Full H3 acceptance still needs authorized structured lodging input, verified
hotel candidates, routes applicable to the Trip date, and target-device checks.
This slice adds no export/delete data module or
production data mutation; rollback is a code revert of the comparison entry
and view, leaving confirmed Trip and user data intact.
