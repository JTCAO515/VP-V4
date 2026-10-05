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
