# VPJ-59 trusted budget stop increment

Related to #194. Baseline: main 26669d9 (PR309). This increment provides a trusted
server/operator stop operation for the existing ledger, without configuring a worker,
provider, credentials, active policy or remote environment.

Changed paths: budget RPC/stop consumer, a new CLI-created append-only migration,
existing cost integration/contract tests, and VPJ-59 contract/evidence. No text/native
client, observability, flags, shared handoff or historical migration changes.

Acceptance:
- Atomic stop serializes against reserve/dispatch/finish with the existing scope lock.
- Only unsent reserved work is released. Dispatched becomes pending; pending, settled,
  full unknown holds, concurrency slots and overrun freezes survive.
- Repeated stop and lost-ack retry are safe. Owner mismatch and ordinary roles cannot stop.
- Already authorized provider calls cannot be retracted; legitimate usage still settles.
- No automatic restart, zero-cost reconciliation, new data permission or commercial quota.

Validation results are recorded in stop-runtime-commands.jsonl. The disposable budget
PostgreSQL fixture has no network or published port and removes its owned container.
Full Turn/text tests replay all application migrations separately. These are actual SQL
and controlled transport tests, not supplier invoices, paid-provider or deployment proof.

#194 remains open. Deployed trusted worker/operator identity and real remote/runtime
acceptance, provider/data qualifications and unresolved Ask/ServiceTask semantics are
not completed by this slice. No native or visible Web changes: browser/device reruns
are not applicable to this backend-only increment. Remote DB changes and paid calls
were not run; no authority for them is inferred.
