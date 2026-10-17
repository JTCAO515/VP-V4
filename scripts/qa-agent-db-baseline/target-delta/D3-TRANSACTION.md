# Controlled transaction source

`d3_transaction.py` compiles one request for the existing official Supabase `execute_sql` tool. It never connects, submits a request, reads credentials, accepts a DSN, changes accounts, or installs a new execution framework. The candidate is fixed to D2 `a3347896`; the compiler and proof have their own source commit.

Modes:

| Mode | Output / effect if separately submitted |
| --- | --- |
| default `dry-run` | Offline summary only; no SQL execution |
| `inspect --emit` | Fixed-project read-only metadata classification request; no application rows |
| `rollback --emit` | Real DDL/GRANT under locks, complete assertions, then ROLLBACK; this still needs a target write scope |
| `apply --emit` | Complete guarded transaction ending COMMIT and after-commit assertion/receipt |
| `safe-stop --emit` | Exact after-state precondition, revoke only the 18 new functions' client grants, COMMIT, assert retained structural state; no data or object deletion |

The last three modes require explicit `--writer`, `--approval-reference`, `--concurrency-reference`, `--window-start`, `--window-end`, `--run-id`. The target/link and original DB owner are fixed constants, not operator-selectable DSNs. Times require an offset and a bounded interval; the database checks its own clock before and after the transaction. References must point to actual externally verified instructions and arrangements, not invented values. The flags, JSON, run UUID and compiler validation **do not create or prove authorization**. No target write scope currently exists, so this delivery emits no actual apply/rollback/safe-stop request.

Write-action request files include their run ID and use exclusive creation. A duplicate cannot replace the original bytes. This is an output artifact, not a submission ledger: the compiler neither submits nor knows whether an operator already submitted it. Preserve the official tool result alongside it; never regenerate a pending operation to bypass unknown-result handling.

Only after the exact action has external authorization may its operator generate the request, review its fixed tool arguments/query, and submit it once using the existing tool. Do not paste SQL fragments separately, delete guards, substitute another target, or use a command-line account/DSN fallback. Use a fresh run ID for a genuinely new authorized action; never turn an unknown outcome into a new attempt automatically.

## Actual transaction path

1. BEGIN; local statement timeout 15s, lock timeout 2s, idle-in-transaction timeout 30s.
2. Check postgres/current database/PG major, actual execution interval and a transaction advisory lock for this fixed project/delta.
3. ACCESS EXCLUSIVE locks on work, text_policies, service_task_turns and text_content, bounding concurrent writes to changed tables/trigger inputs. The advisory lock protects cooperating executors only; these locks do not prove that every old worker, cached function call or other deployment is drained. An actual external no-conflicting-writer arrangement is mandatory and currently unproven.
4. Fresh scoped before comparison: D0 objects, extra worker/trigger/schema/role metadata, required object absence, owners/ACL and work column slots must exactly equal the fixed profile.
5. Execute the reviewed cumulative D2 delta; no business RPC, runtime control or user-data seed is in this body.
6. Exact expected after comparison, execution-interval recheck, then COMMIT or ROLLBACK as explicitly selected.
7. Assert the corresponding state again and return phase/run ID/target/candidate digest. An error here can be **after COMMIT**; never report every error as rollback.

Work's `relnatts=10` and no dropped slots were verified through a separate narrow read-only catalog query. This closes the column-ordinal gap: PostgreSQL retains dropped slots, so visible-column count is insufficient. Local targetlike fixtures retain a dropped slot from construction and use a correspondingly explicit synthetic profile. Real CLI modes cannot accept a synthetic profile override.

The fresh snapshot also checks the 4×4 transitive MEMBER/USAGE reachability matrix for postgres/anon/authenticated/service_role. The observed ordinary roles cannot inherit each other's or postgres privileges; postgres can reach the other three. A changed role membership refuses just like a changed ACL. This supplements role flags and scoped effective function/schema privileges without inspecting passwords or user records.

## Outcomes and recovery

`outcome()` accepts only a matching COMMIT_RETURNED receipt, operation, run ID, target and candidate digest as an acknowledged commit. Missing/mismatched response or any uncertainty remains COMMIT_OUTCOME_UNKNOWN. It returns no automatic write/retry/inverse command.

Use the separately generated read-only inspection request:

- BEFORE_OBSERVED: observed original metadata, **not proof that an earlier in-flight transaction cannot still commit**. Stop and reconcile original tool/backend/writer completion before any newly authorized attempt.
- AFTER_OBSERVED: exact effects observed, not a durable receipt proving which attempt produced them. Preserve bytes and do not replay. Reconcile the original operation and proceed only within externally confirmed scope.
- MIXED_OR_DRIFT: stop; use the same limited catalog scope to diagnose. Do not overwrite the drift or infer a rollback.
- Observation error/unavailable: keep UNKNOWN and stop; no equivalent-account retry.

There is no new database receipt table, backup window, restore ledger or approval token. The run ID correlates the request/response, not a durable database journal. Before-commit server failures leave the transaction aborted; the tool/connection must end it, with the idle timeout as a bound. On a connection/response failure the operator must use unknown-result handling regardless of optimistic client assumptions.

Safe STOP is a separately authorized action after reconciliation, not an automatic unknown-result remedy. It retains all columns, constraints, functions and postchange records; original worker isolation and task guard stay in place. It revokes only new QA entrypoint permissions. If the exact after-state no longer matches, it refuses rather than issuing a blind inverse. Runtime workers/traffic still need the external stop/drain arrangement.

## Validation limits

`d3_verify.py` exercises actual local PostgreSQL DDL/COMMIT/ROLLBACK with a synthetic profile, drift/missing objects/role/permission failures, a second cooperating writer, after-check failure, discarded acknowledgment classification and explicit safe STOP retaining postchange records. Discarding a received local acknowledgment models lost response; it is not a real transport outage. No full 8/38 behavior matrix is repeated.

All target identity, managed Auth, actual rows, runtime provider/heartbeat/fees, deployment quiescence and user/device acceptance retain their separate evidence/authorization boundaries. `targetReady=true` is never emitted and would not authorize execution anyway.
