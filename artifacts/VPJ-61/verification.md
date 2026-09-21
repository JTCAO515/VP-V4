# VPJ-61 verification — 2026-09-22

Base: main `5f95d16`; branch `codex/240-trip-archive`. GitHub #240 verified OPEN,
no assignee/comments/duplicate open PR at start. Shared Trip consumer files were
coordinated with #363; #216 has no conflicting changes. No project registration,
shared DTO wire, global handoff, memory, provider or commerce changes.

Implemented: explicit version-bound native archive confirmation, read/POST API,
owner/mobile-isolated immutable archive receipt and atomic audit, archived content
write guard, read/share preservation, fresh-Trip outline reset. See the
[contract](../../docs/contracts/vpj-61.md).

PASS: TypeScript typecheck; source lint; archive/native HTTP contracts 9/9; docs
check; diff check; unsigned iOS Simulator build. A SQL test loaded the full current
migration history into a uniquely owned PostgreSQL container with no network/ports:
owner denial, direct-write denial, concurrent/repeated archive, injected audit
failure rollback, unchanged Trip/snapshots/unfinished Turn, fresh empty Trip and
idempotency misuse passed. Expanded real ServiceTask/association/queue retention passed using the existing
submit_service_task_turn producer. Native state tests passed 8/8. Final Store source, including the read-only-recovery guard, passed all 10
native state and screenshot recovery tests on the dedicated simulator.

Independent read-only review identified a native state recovery bug: a failed
archive read could clear a known archive and reopen editing. Fixed by preserving
the matching receipt and disabling edits while archive state is unavailable.
The native test includes this regression. No other definite security/data defect
was reported; this review is not PR approval or target-environment acceptance.

Initial failures retained: database test bootstrap lacked `USAGE` on its synthetic
`auth` schema; corrected test fixture only. Default xcode-select pointed at Command
Line Tools; reran with explicit DEVELOPER_DIR. First Swift build exposed an
inconsistent switch-expression return in new copy; fixed and build passed.

Existing required CI remains mandatory and will run on the PR. No merge/closure
is authorized. Source start-to-acceptance remains open; no invented cycle-time or
user-acceptance claim.

Expanded SQL mobile-revocation setup initially attempted a duplicate mobile_accounts insert,
because the real text producer had already created it. Corrected only that fixture
to update the existing account; all earlier archive invariants had passed.

The final SQL run passed including replaced-mobile-session read/replay refusal,
an archived Trip's late proposal confirmation rejection, and preserved original
content. One rerun hit the shared test helper's 5-second statement timeout while
validating an existing timezone; this was host resource contention, not an archive
assertion. The test now permits 30 seconds for SQL statements, with identical
inputs and assertions; no runtime timeout/policy was changed.

ServiceTask evidence scope: the existing submit_service_task_turn contract requires
its thread trip_id=null. The test proves real, existing tasks and queue state are
unaffected. Separately, a Trip-linked unfinished Turn is preserved. This does not
prove the not-yet-integrated #224 Trip-linked human-service lifecycle.

Live dependency observation: #192 CLOSED, #224 OPEN. #199 query initially timed
out; source interfaces still do not supply this slice's per-preference selection.
