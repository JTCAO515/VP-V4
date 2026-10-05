# VPJ-61 #240 — explicit end/archive and next-Trip lifecycle

A1/A2 source integrates ordinary-actor typed APIs, Native per-preference review,
three drafts/one Active capacity, explicit legacy reconciliation, original-byte
operation recovery/decline/abandon, archive preservation and data-rights hooks.
No dates complete a Trip. Current viewer and account Active remain separate.

The new lifecycle/export RPCs are default-denied in the migration. Tests first
verify this ACL and HTTP unavailability, then explicitly grant only the new
ordinary lifecycle RPC inside the uniquely owned disposable test database. This
qualifies prepared code; it is not target ACL/schema activation or a release.
No service-role fallback exists in the product API. Archived-result reference
replacements retain their existing ACL and exact-reader qualification.

## Actual validation

| Check | Result and scope |
| --- | --- |
| TypeScript unit suite | PASS 239/239, zero skips |
| TypeScript contract suite | PASS 1022/1022, zero skips |
| TypeScript security suite | 322 PASS, 0 FAIL, one existing AI-14 skip because its explicit disposable target was not configured; suite INCOMPLETE |
| New lifecycle/HTTP/export contracts | PASS 13/13, zero skips |
| Archived reference/Web regressions | PASS 4/4, zero skips; original reference remains current-only, archive proof is Trip-only and strict true, wrong identity/withdrawal/changed actor rejected |
| Auth/Native/Web HTTP r1 | PASS 1/1, zero skips, original-byte receipts/declines/abandon/capacity/Memory/empty-next-Trip/session fences |
| Auth/Native/Web HTTP r2 | PASS 1/1, zero skips; includes real stored original-publisher artifact, archive → exact v1/v2/Web history, source withdrawal → unavailable |
| Owned HTTP resources | PASS both uniquely named disposable stacks stopped/removed; no external provider/model/budget requests |
| Native lifecycle cases | PASS 6/6 on original owner Simulator, zero skips |
| Native archived reader cases | PASS one v1 Trip exact-reader case and one v2 reference proof case on original owner Simulator, zero skips; reused unchanged lifecycle six |
| Existing archive/five-result/core-export PG regressions | PASS 13/13, zero skips |
| Lifecycle SQL suite and final archive refinement | Full 10/10 before final candidate refinement; focused final archive parent+case 2 PASS with eight unchanged explicit skips reused; see SQL evidence |
| Combined Native build-for-testing | PASS after integration with #651 notifications and #652 translation; no phone claim |
| Next.js production build | PASS on combined TS/Native source; no deployment claim |
| Lint/typecheck/docs/diff | PASS |
| DB lane classifier | PASS final integration path, both new cases registered; original classifier and zero-skip rules retained |
| db:verify | Baseline present; user/ops/worker runtime probes UNRUN/not configured, no Production connection |

SQL-owner evidence and source version are in
[SQL verification](../trip-lifecycle-sql-20261005/pg.txt) and
[SQL contract](../../../docs/contracts/vpj-61-lifecycle-sql-v1.md).
Final SQL source `452ce42e` is integrated. Before its final candidate refinement,
the full lifecycle PG suite passed 10/10 with zero skips. The final refinement was
then tested by the focused archive case: parent + case PASS (2), eight unchanged
cases explicitly skipped and reused from the full run. The committed mandatory
suite retains all cases and requires zero skips under its existing lane switch.
These are separate results, not a fabricated final full-matrix PASS.

Existing archive, five-result and core-export PostgreSQL regressions also passed
13/13 with zero skips. The complete owned development source is ready for Main
review, one PR and actual required CI; target acceptance is still separate.

See [commands](commands.jsonl), [r1 Auth/HTTP](auth-http-r1.txt),
[r2 Auth/HTTP](auth-http-r2.txt), and [Native evidence](../native-lifecycle-20261005/verification.md).
R2 uses the accepted synthetic original-publisher fixture: it records local policy
metadata and completed task output, without sending a model/provider request.
This does not prove semantic model output or external service delivery.

## Source and execution boundaries

Trip archive calls the original `archive_trip_v1`; inserted archive and original
Trip creation share owner-serialized capacity triggers. New transitions lock the
actual owner/session and expected revision/head/Active. Applied and declined
receipts are immutable; same-op different bytes conflict, and abandon fences a
late original POST. Unknown/denied transport outcomes retain the Native journal.

Keep records only this archive's choice of existing qualified Memory references.
It does not copy preferences or manufacture consent; skip does not revoke a
previous global preference. New Trip insertion uses the original empty-snapshot
producer, without old dates/items/temporary constraints or unconsented Memory.

Archived read proof is emitted only by Trip reference readers after original
exact artifact authorization. The second body read must match artifact/revision/
Trip and historical-readable/current-false qualification. Current execution,
publication, proposal and decision gates are unchanged. #224 currently has no
Trip-bound service status authority, so `serviceStatus:unavailable` is truthful;
archive preserves the actual source rows and does not cancel a service.

The new export handler requires explicit v2 live-lease enrollment, closed pages
and final matching source traversal proof. Existing completed export artifacts
are unchanged; unenrolled lifecycle coverage is partial. Source traversal is not
an assembled/downloaded artifact. Trip/Memory erase hooks remove original bytes,
receipts and source edges and leave only a non-replayable minimal tombstone.

## Retained failures and unrun work

SQL-owner evidence retains initial syntax/precedence/trim and fixture failures.
Registering a preparation-path test failed the original classifier; Main required
the sole SQL owner to move it to integration, without changing that classifier.
Its original lack of a gate would have started Docker in generic Quality without
its pinned image. The existing `VP_ARCHIVE_DB_TEST` switch now separates explicit
generic UNRUN from mandatory zero-skip PostgreSQL execution.

Target ACL/schema/deployment, real human-service status/delivery, full export
artifact assembly/delivery, target Pass-expiry readback, real-user rights actions,
physical-device/accessibility, provider/fees and user acceptance are UNRUN.
No applied migration or original dirty checkout was modified. Local qualification
and source/CI evidence do not authorize those external actions.


## First remote CI failure and repair

The first exact-head CI at `eadb8b72` failed PostgreSQL and Native HTTP. PostgreSQL
isolated step was 430 tests: 418 PASS, 12 FAIL, zero skips. All 12 failures were
`LEGACY_RECONCILIATION_REQUIRED` in three unchanged Memory/deletion suites. The
BEFORE ROW check had mistaken an earlier new row in the same bulk INSERT for old
legacy data before AFTER ROW registration ran. This was a real core defect; Main
reopened #240. It was not dismissed as a fixture-only failure or retried blindly.

SQL source `509f5fed` keeps owner prelocks and actual-row registration, then
validates final owner-wide legacy/capacity after the whole INSERT statement via
its server-created transition table. Valid two/three-row inserts work; four rows,
foreign ownership/RLS, true legacy and concurrent two-plus-two overflow roll back
atomically. No role/GUC bypass, deferred FK or synthetic Active is introduced.
The owner ran the complete repaired lifecycle PG suite 11/11, zero skips, and the
three CI-failing original suites with unchanged source/assertions 12/12, zero skips.
See [bulk evidence](../trip-lifecycle-sql-20261005/bulk-insert.txt) and
[first PostgreSQL failure](ci-postgres-first-fail.txt).

Native HTTP had four separate failures: two old archived-empty assertions and two
independent fixture sequences creating more than three drafts for one actor.
The Main-leased four-file repair preserves capacity and all ordinary currentness/
action assertions. Each completed browser fixture is explicitly archived through
the original RPC with its exact confirmed head/receipt. Each proposal-negative
fixture is erased only after every original assertion, scoped to its owned Trip
and captured goal link in the disposable database. Archived-positive assertions
now require exact identity/current-false/historical qualification and original
source withdrawal still rejects reading. This is not a product capacity relaxation.

The first local cleanup attempt failed the canonical link FK restriction; that
failure is retained. Exact owned-link cleanup was added after all assertions,
then only the affected runner was rerun. Final local affected results: proposal
13/13, native/Web/browser same-Trip 2/2, native text/results 8/8; all zero skips.
The original four locale/viewport browser assertions and source/owner/session
negatives remain. All owned stacks were stopped/removed. See [first Native HTTP
failure](ci-native-http-first-fail.txt), [local cleanup failure](ci-fix-proposal-http-first-fail.txt),
[proposal](ci-fix-proposal-http-pass.txt), [same-Trip/browser](ci-fix-same-trip-http-pass.txt),
and [text/results](ci-fix-text-http-pass.txt).

The old remote failures remain FAIL. The repaired head requires its own formal
review and actual CI; no earlier success is relabeled as its remote CI result.
