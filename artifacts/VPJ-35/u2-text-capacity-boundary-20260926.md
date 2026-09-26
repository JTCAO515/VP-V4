# VPJ-35 U2 text capacity boundary

Base: `0fff80e8b1b0fd0fb1ccffffd5c71fd92f06e1c9` (merged #552). Scope: database guard and adversarial tests only. The existing Trip confirmation writer and receipt keep their behavior; this PR does not admit or settle a Trip ServiceTask.

## Result

The U1 ledger now rejects an insert or state update unless the referenced owner/task is a `text_answer` ServiceTask in a thread without a Trip. A task with any capacity row cannot be relabeled to another result type or moved to another owner/thread. Capacity writes lock the thread and task rows in U1 admission order, so concurrent relabel/rebind updates cannot read past an uncommitted reservation. The guards apply inside the same database transaction as U1 admission and settlement. A normal Trip confirmation remains free of a ServiceTask capacity row, even when the current-version receipt exists.

## Why U2 remains open

The current native Trip proposal endpoint accepts manual changes, and its confirm request contains no verified ServiceTask identity. The ServiceTask intake rejects Trip threads and has no `trip_modification` result type. No trustworthy agent-origin Proposal binding, Trip task admission or consented Trip dispatch exists. Consequently, this PR intentionally adds no Trip charging path. A later U2 implementation must create that provenance at admission and settle only inside the atomic confirm/Patch transaction; a receipt read after confirmation is insufficient because a newer Trip version can supersede it.

## Checks and limits

| Check | Result |
| --- | --- |
| `node --check` on both edited integration tests | PASS |
| `pnpm docs:check` | PASS |
| `git diff --check` | PASS |
| `pnpm test:integration:db --lane postgres` | PASS: main coordinator ran the final locking revision in an isolated database; 81 migrations, 128/128 tests including both two-session races, 0 fail/skip. My sandbox has no Docker socket access. |
| `pnpm test:integration:db --lane supabase-rls` | PASS: main coordinator ran the same revision with local GoTrue/RLS/Trip RPC; 81 migrations, 18/18 tests, 0 fail/skip. |
| Shared Staging, provider-generated Trip goal, iPhone, Sandbox purchase, Production | UNRUN; none is claimed by this repository-only guard. |

Rollback: keep the append-only migration applied, disable the development capacity setting while correcting code, then use a new migration to replace the three guards if the accepted Trip admission/settlement contract needs a different scope. Do not delete historical capacity rows.
