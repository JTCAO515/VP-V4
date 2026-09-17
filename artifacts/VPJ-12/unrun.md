# VPJ-12 remaining acceptance

- A real selected screenshot's OCR lines and correction were not exercised on
  the simulator; the UI route and deterministic comparison were exercised.
- No private inbox, persistent TTL/deletion, owner-scoped media storage, external
  OCR provider, or end-to-end duplicate import evidence exists in this slice.
- Corrected fields do not yet create an actual TripProposal/TripPatch or join a
  saved Trip. The local review is not a booking or supplier confirmation.
- Full native regression remains incomplete: three existing synthetic-login
  `NativeTripStateTests` fail on both this branch and the unchanged #470 base.
