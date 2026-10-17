# Independent service consumer seam

Import `LocalFixture` from this directory (add this directory to Python's module search path). No DSN, target, remote database or shared container argument is accepted.

```python
from local_fixture import LocalFixture
f = LocalFixture()
try:
    f.start()
    f.build_before()                 # fixed known legacy bodies/constraints and D0 application ACL
    f.check()                        # captured local before metadata must still match
    legacy = f.seed('legacy_eligible')
    f.install_local()                # actual cumulative D2 body, only on this owned local container
    qa = f.seed('qa_eligible')
    process, last_line = f.call_sql(
        'select public.claim_turn_work();', role='service_role')
finally:
    assert f.close() == 'PASS'
```

`call_sql(text, *, role=None, actor=None, session=None, anonymous=False, check=True)` returns the existing Fixture pair `(CompletedProcess, last_nonempty_stdout_line)`. Roles are the existing allowlisted `authenticated`, `anon`, `service_role`; ordinary claims use actor/session. `check=False` returns PostgreSQL failures for negative assertions instead of raising. SQL always uses the instance's own fixed local database. The existing fixture lifetime is bounded to 180 seconds; close remains available after that limit. Start a fresh instance for longer independent scenarios, not a target connection.

`seed(scenario)` returns **synthetic** owner/session/epoch/policy/thread/turn/task identifiers, request text, noticeHash, endpoint and the actual SQL admission result. Scenarios:

- `legacy_eligible`: current_input_v1 policy, ordinary original start_text_turn, queued legacy work; valid before or after install. It must remain eligible for the legacy global worker.
- `qa_eligible`: ordinary Native admission after install; legacy global worker must exclude it.
- `qa_invalid_session`: admitted QA with its synthetic Auth session subsequently deleted; standalone cancellation is supported.
- `qa_unknown_budget`: expired lease + pending synthetic budget; session revoked, but claim must return reconciliation_required and preserve the receipt/bytes.
- `event_scope_drift`: creates a throwing local sentinel helper; QA claim must reject P0201 before invoking it. Use a dedicated instance for this scope-drift case.

Each creator owns its nonce/container and closes only that container; consumers must not clean another owner's fixture. `with LocalFixture() as f:` also guarantees cleanup, including a start failure after container creation. No adapter is inserted into production code. The service owner can map `call_sql` into its existing test-only API transport.

This is a **targetlike representative**, not a replica: eight matched legacy routine bodies, three instantiated matching constraints, observed application ACL, known absent objects/columns, actual accepted trigger sources, and explicit synthetic extra structure. Managed Auth remains a synthetic shim; unknown target RLS/extra definitions are not recreated. Do not label API consumption as actual Supabase/Auth/provider/device acceptance.

Important correction: the fresh 7f fixture denied old start_text_turn/start_chat_turn callers, whereas D0 retains grants. This seam restores observed preexisting application ACL locally. The business-guard negative now explicitly checks P0001, not an execute-permission failure. The actual target ACL is never changed by this helper.

The helper uses `candidate()` and `capture_sql()` from `d3_transaction.py`; these only load fixed source and construct text. It does not call that module's real-target request compiler or remove the proposal gate for a remote destination. D3 controlled-target execution is a separate path and validation package.
