# Cancelled grounded work read repair — local verified, Staging pending

Related to #206 / #264. Baseline PR357 merged at a352c7e.

An actual SIM evaluation lost its original mobile session after native login.
Normal expired-lease claiming cancelled its work, but public Turn/event history
remained accepted; consumers kept waiting. The observed cancelled Turn is
73ea2ef0-5aca-4993-b3c1-8662cc48fdaf (synthetic Staging task).

## Change

Append one migration replacing only read_grounded_turn. Same-owner unfinished
work cancelled/failed/quarantined projects cancelled/failed/failed while existing
public terminal or completed grounded answers win. Read authorization and empty
result fields remain unchanged. SSE allows only that empty unfinished terminal
projection without a persisted terminal event, preserves event/cursor history
and stops heartbeat. No worker, budget, consent, Trip or provider changes.

## Verification

- PASS: database integration15/15; actual native session SQL login replacement,
  normal claim cancellation, initial/acknowledged SSE cursors, list/read status,
  owner/session/policy/hidden/consent denial, unchanged Turn/events/work/content/
  grounded/budget records, migration transaction rollback and exact RPC ACL.
  SQL fixture auth claims are not GoTrue or real device acceptance.
- PASS: contracts274/274; focused SSE3/3; lint266 files and typecheck.
- Security:146 PASS,1 SKIP: existing AI14 disposable identity target absent.
- PASS: independent critical-contract/migration review0 Critical/0 Important.
- PASS: Staging44 encrypted backup and network-isolated restore;6users/3Trips,
  data/schema digests preserved and temporary container removed.
- Initial test implementation mistakes (withdraw RPC name; budget key name)
  corrected. Existing lease-expiry test failed before entering its lock wait
  under load; test lease now5s, statement timeout15s, expiry wait10s. It still
  requires observed blocking, actual expiry and denied completion. Failure logs
  retained; final full database suite passes.

## Remaining / rollout and rollback

Migration45 is not applied to Staging. Exact candidate Preview, real old cancelled
record API/SSE/Native/Web and completed source/date regression remain UNRUN.
Apply only after the reviewed candidate is frozen and scoped backup/restore
checks pass. Preserve current policy/consent and default-disabled reader/Ops.
Rollback by closing the scoped entry and using an appended function repair;
never rewrite applied migration, public history, attempts or completed answers.
No Production release or full S2 acceptance is claimed.
