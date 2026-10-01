# VP result visibility and lifetime — 2026-10-02

Base: `906017da4ec0fcf89317a3c5f76e6bdac353c40b`, including merged task-directed reopening #581 and audit fixes #582/#585. Related to #562/#564. No full issue acceptance is claimed.

## Defect and behavior

A completed VP result stayed in selectedResult indefinitely, and leaving VP for Memory or backgrounding the app did not clear it. Returning after a correction could render the old comparison without re-reading its basis. The VP read now has a 30-second deadline from request start, scoped to the current actor/epoch and request generation. Expiry hides content and offers the existing Refresh action; Refresh resolves the same selected Task again even when its cached body is absent. A slow or late response cannot renew an expired window.

Inactive/background transitions clear the result and fence outstanding reads immediately. Returning re-reads the conversation/task projection and, only when that Task is still completed in current authorized history, resolves the exact Task reference and revision again through #581. A missing task stays unknown, and no global/latest fallback is added. Waiting-task polling now pauses while inactive/backgrounded. Composer state and server work are retained; no new writer, execution, Memory grant or provider request was added. Withdrawal and failed/changed scopes also clear the read generation.

## Checks and limits

- PASS: final source native build and AssistantResultIdentityTests/AssistantTaskProjectionTests **4/4**, 0 failed/0 skipped, on the isolated iPhone 17 Pro iOS26.5 (`99CF3071-CFCD-46D4-80EF-D20076E33D2C`). Covers request-start deadline, inactive window, clearing/late generation, account epoch, exact Task identity and current conversation task projection.
- Final bundle: `/Users/jtsm5p/Library/Developer/XcodeBuildMCP/workspaces/Codex-64a03d9ff053/result-bundles/test_sim_2026-10-01T16-14-30-194Z_pid36637_516e95e8.xcresult`.
- PASS: earlier native pass **5/5** included the same four tests plus signed-out zh/en four-Tab routes/fallback. After that run, manual refresh was refined to resolve the selected completed Task even when its cache is absent and to avoid a duplicate activation read. The final source was rebuilt and its four affected unit tests rerun; the unchanged signed-out shell path evidence was reused. First bundle: `/Users/jtsm5p/Library/Developer/XcodeBuildMCP/workspaces/Codex-64a03d9ff053/result-bundles/test_sim_2026-10-01T16-10-37-932Z_pid36637_c79c2b3e.xcresult`.
- PASS: docs/lint/typecheck/diff checks and contract suite 698/698.
- UNRUN: authenticated Staging/real provider result changes, physical VoiceOver/device return and complete Memory correction-to-new-result experience. The fence regression is synthetic unit evidence, and the shell route test is signed-out local UI evidence; neither is a human observation or complete E4/E5 acceptance.

Rollback: revert this native read-lifecycle change. No migration or user data is changed; accepted server tasks and exact readers remain. Keep remaining #562/#564 acceptance open.
