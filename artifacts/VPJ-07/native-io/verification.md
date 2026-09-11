# Native Ask request lifetime

Related to #195; S2 independent preparation on main7bf22fb while S1 PR324 remains separate.

Observed defect: an ordinary synthetic verified JWT followed by a session RPC503 produced HTTP401.
The original regression failed401!=503; see red.json. A client can interpret this as session loss.

The existing native request scope now bounds credential verification, session authority, strict
32KiB/5-second body parsing and Ask RPCs within one10-second lifetime. Network/protocol failure or
cancellation is503; explicit credential/session rejection remains401. No automatic submit retry,
policy/recipient change, migration or remote activation is added. Exact retry IDs/body and SQL
idempotency stay authoritative; an already dispatched write is not assumed rolled back.

Validation:
- Directed HTTP checks10pass/0fail/0skip (eight new and two existing).
- Lint/typecheck passed; full security109pass/0fail/1explicit unrelated environment skip.
- Actual disposable local Supabase/Auth/PostgREST/native HTTP/worker integration1pass/0fail/0skip,
 29.3 seconds in the test; launcher exits0 after exact owned stack removal. Controlled model only.
- Independent auth/data review Critical0/Important0; three-file content-set SHA256
 9f0efdd22b9d48c3b65ec01bf3e40979e3ec937f6db8d7d6c5bf5fc834b17d34. No runtime changes after review.
- Required CI is tracked on the PR; do not infer its result from local checks.

 Real provider/remote/physical-device
acceptance remains unrun. No Swift or visible UI changed; no repeated native build required locally.
