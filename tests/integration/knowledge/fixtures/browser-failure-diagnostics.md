# Private-source browser failure diagnostics

`browserFailureDiagnostics` is test-only instrumentation for the existing Ops
browser subtest. It keeps every original console-error/pageerror event in `errors`
as a safe category string; the original `assert.deepEqual(errors,[])` is unchanged.
HTTP400–599 and failed requests add diagnostic observations only: they neither
filter existing errors nor independently change the test's pass condition.

The subtest marks fixed phases (author login/form, submit, reviewer login/review,
desktop/mobile/RTL). Only an existing failure emits `browser-failure/1` through
`node:test` diagnostic output, then the exact original error is rethrown even if
report emission fails. Success emits nothing. Records are capped at32 with a
separate dropped-event count; error collection and the original assertion are
not capped, retried, softened or swallowed.

The report allowlists HTTP methods, integer status, phase and error-name classes.
It never reads headers/cookies, bodies, raw console/pageerror text or stacks.
URL parsing removes userinfo/query/fragment. Same-origin known Ops/auth routes,
favicon and restricted `_next/static` asset paths can be located; unknown/dynamic,
encoded, oversized or credential-looking paths are redacted. External resources
show only scope category/method/status, never host/path/full URL. Unknown error
names/phases use fixed categories. Do not expand this into general telemetry.

Validation uses synthetic EventEmitter events: resource404 can be located while
secret path/query/fragment/userinfo/Authorization/raw messages remain absent;
all original error events still fail the same assertion, and success is quiet.
No provider, real account, target write or complete DB/browser replay is implied.
Applicable CI still runs the existing real Ops browser subtest; no filters or
runtime/product fixes are introduced by this change.

To reproduce the pure tests:
`node --test tests/unit/browser-failure-diagnostics.test.mjs`.

Local checks (2026-10-02): focused4/4 and full unit158/158 PASS, lint/typecheck/docs/diff and module syntax PASS. Actual Ops browser/DB replay is left to applicable CI; no unchanged full local DB suite was rerun. Revert this test/helper delta to roll back; runtime/schema/permissions remain unchanged.
