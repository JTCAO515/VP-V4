# VPJ-12 remaining acceptance

- A real selected simulator screenshot now reaches Vision and displays source
  lines. A real authenticated account's private inbox→TripProposal→explicit
  confirmation→both-client reload has not yet been observed end-to-end.
- Inbox isolation, duplicate, expiry and deletion are native unit-tested; an
  actual account-switch/relaunch/locked-device cycle remains UNRUN. Logical
  TTL denies access after 24 hours, but iOS cannot guarantee background
  physical deletion while the app never launches; expired files are purged on
  next Trip access/import.
- The requested complete file-protection option is implemented, but the
  Simulator returns no protection attribute. Physical-device enforcement is
  UNRUN because JTs17 was unavailable at the last device check.
- Server-side/private cross-device media storage and supplier verification are
  not part of this on-device path. The local review is not a booking or
  supplier confirmation.
- Full native simulator regression on a preceding candidate passed 78/78 active
  tests, with 26 environment-gated tests skipped. Subsequent scoped fixes have
  focused passing tests; required exact-head remote PR CI remains pending. The
  earlier local `NativeTripStateTests` synthetic-login failures were reproduced
  on the unchanged #470 base and are retained as historical failures; the
  later full run on this head passed its active cases.
