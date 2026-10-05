# VPJ-31 verification

## Scope and integration

Owner preview/explicit individual field share for one Case recipient, current
source-qualified Brief reads, invalidation, minimal audit and independent
reference-only export/delete. TS integrator branch
`codex/vpj31-traveler-brief-server-20261005` uses fresh origin/main `2b49b94c`
and normally integrates immutable #654 `8675b90c`; no old shared file copies.
Original dirty checkout remains untouched. TS wire `89fe4de6`, HTTP privacy
follow-up `20ea5b46`, authorized registry `0b7caaff`, erased-export guard
`daf784ae`. SQL/native/Ops integration and whole scoped acceptance are pending.

## Observed checks before joint integration

- HTTP/adversarial contract: 12/12 PASS, zero skip, including fresh preview
  qualification, exact original UTF-8 bytes, source/grant/session change before
  delivery, wrong actor/recipient, default deny, unknown ACK/abandonment and
  independent export ownership/source lease. These use injected RPC fixtures.
- Full contract suite on initial fixed wire: 1079/1079 PASS, zero skip.
- Security: 322 PASS, 1 SKIP, outcome INCOMPLETE. The existing AI-14 real owner
  RLS/rollback test requires an explicit disposable identity target. No target
  result is claimed from this generic run.
- Unit before registry registration: 237 PASS, 2 FAIL. Both failures were the
  unregistered new HTTP test and CI's resulting fail-closed all-lane selection.
  After the actual file/runner registration, the two affected governance files
  ran 18/18 PASS, zero skip, with assertions unchanged. This is focused repair
  evidence, not a claim that the first full unit run passed.
- Lint: PASS, 655 files; typecheck PASS; Web build PASS; static 22/22 PASS;
  docs:check PASS; git diff --check PASS.
- DB registry --list: classified new mandatory HTTP runner at port base 64900;
  those ports were observed free. Existing 64800/64600/64460 entries preserved.
- db:verify: database baseline present, all explicit connection probes
  not-configured, no Production connection attempted. No live DB proof.

Local ignored raw logs are under `artifacts/VPJ-31/server/`; the initial failures
and incomplete security run remain recorded. Actual SQL replay, concurrent
source lifecycle, real local Auth/HTTP, Native and Ops results will be appended
after their immutable owner submissions and affected joint checks.
