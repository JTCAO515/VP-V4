# Trip Place Reference v1

V4-11 projects only owner-scoped `TripPlaceReference` records. A canonical reference carries one exact opaque Canonical POI UUID backed by the service-controlled `canonical_pois` registry; a user reference carries only the user-confirmed label and is never title-resolved into a POI. Both preserve `recheck_required` rather than disappearing when freshness is unavailable.

This Issue intentionally exposes no authenticated direct insert/update/delete route. A later accepted Proposal/Place owner must create references through its own constrained transaction; this read surface cannot turn arbitrary client input into a canonical identity.

The Canvas may show a labelled schematic when no licensed map provider is configured. It must not show geography, route, ETA, provider data or an inferred location. Only a canonical reference can enter Ask with `tripId=<UUID>&poiId=<UUID>`; before displaying scope, Ask re-reads that owner Trip’s recorded references and requires an exact match. This does not submit a prompt or create a Trip change.

Rollback: hide the Place View/read route. Do not delete owner references or convert user labels into canonical IDs.
