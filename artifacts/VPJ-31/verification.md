# VPJ-31 verification

## Scope and integration

Owner preview/explicit individual field share for one Case recipient, current
source-qualified Brief reads, invalidation, minimal audit and independent
reference-only export/delete. TS integrator branch
`codex/vpj31-traveler-brief-server-20261005` uses fresh origin/main `2b49b94c`
and normally integrates immutable #654 `8675b90c`; no old shared file copies.
Original dirty checkout remains untouched. TS wire `89fe4de6`, HTTP privacy
follow-up `20ea5b46`, authorized registry `0b7caaff`, erased-export guard
`daf784ae`, owner-state wire `6f69963a`; integrated SQL `5de78458`,
Native `03dce7eb` and Ops `fb5c4a4d` retain the exact production source from each
sole owner. Main completed the combined core review and development closure.
Release/target acceptance remains separate.

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

## Final integrated evidence

- Full contract: 1098/1098 PASS, zero skip; full unit: 239/239 PASS, zero skip.
  The earlier registration failures above were repaired without changing asserts.
- Final typecheck/lint/docs check/diff check PASS; integrated Web build PASS.
- Actual owned Auth→Next HTTP→PostgreSQL: final 1/1 PASS, zero skip, cleanup PASS,
  `server/auth-http-final.log`. Default denied RPC ACL, disabled switch and empty
  staff were observed before disposable-only fixture GRANT/enrollment. Native
  credentials/login and ordinary staff cookie verify the actual actor/session.
  Original Case/problem grants alone deny Brief; preview grants nothing. Original
  Profile/Memory writers provide actual values, individually confirmed selection
  supplies the minimal staff Brief, and Memory correction denies old URLs/ops
  until a new preview/explicit share. No Trip/Proposal was written by this flow.
- Final HTTP also observes audit 201→BRIEF_LIMIT while fresh owner_state still
  permits first-preview revision-zero deletion with previews/audit removed. Owner
  cleanup remains available after original revoke and while business is disabled.
  Staff/other owners cannot obtain owner_state. A never-granted Case has actual
  null recipient, no Brief/preview, and cannot create a preview; accepted revoke/
  cancel writers retain recipient, while Case deletion cascades data and denies
  metadata. No null employee or local revision is fabricated for cleanup.
- SQL owner: final fresh replay/rollback + lifecycle 15/15 PASS, original service
  operations 18/18 PASS, SQL contracts 6/6 PASS, targeted metadata/default ACL
  requalification 2/2 PASS. Canonical login/logout/replacement, original source
  writer races, intake/Trip/link/receipt/frontier/consent qualification, recipient
  role withdrawal and actual account cascade are observed. See
  [SQL verification](sql/verification.md); do not conflate the separate counts.
- Native owner: final 17 Brief tests PASS, zero skips; original ServiceOperation
  22 tests from the earlier affected run remain applicable, not rerun or described
  as a final combined 39-test execution. See [native verification](native/verification.md).
- Ops owner: consumer 15/15 PASS and actual browser zh/en, 390×844, signed-out and
  invalid-Case denial with no console warnings/errors. Positive authenticated
  visual field layout/Case link remains browser UNRUN; the actual cookie/SQL
  sharing/read/withdraw contract is verified by the HTTP lane. See
  [Ops evidence](../../tests/contract/service-cases/brief/ops-consumer-evidence.md).

The initial real HTTP run failed at canonical native login before Brief access.
New `session_changed` triggered SQLSTATE 42703 from cross-table OLD record fields;
the sole SQL owner's minimal `ac4784b4` fixed only that trigger. R2 and final real
HTTP pass; `server/auth-http-initial.log` retains the original failure. The old Auth
and original writers/guards were not weakened. The SQL owner's repaired account
delete cascade failure and fixture failures also remain in their evidence.

Only own Next-dev generated AGENTS additions were removed after owned servers
stopped; integrated build restored generated next-env paths. Neither generated
file enters the product diff. Real staff, target/config/GRANT, Production, provider,
fees, core account export enrollment/attachments and human/phone acceptance remain
unrun. Staff rendering has no push: it clears/requalifies on entry/focus/request
and every 10 seconds while visible, never a zero-latency remote-revoke claim.

## Normal main integration

Dependency #654 actually merged as `7a48a018` at 2026-10-05 10:01:13 UTC.
Normal origin/main merge `cf097cd2` preserved all #223 product source, both service
entries, eight journals and existing/new DB lanes. The only inherited differences
from reviewed `303decef` were accepted upstream `trip-deletion.test.mjs` and #224
evidence. No product source changed, so no unchanged local PG/Native/HTTP matrix
was repeated. Working tree and diff checks were clean. Final-head formal review
and fresh required CI must be checked against the pushed candidate separately.
