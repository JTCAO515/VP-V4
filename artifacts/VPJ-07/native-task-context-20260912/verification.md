# Native task context — 2026-09-12

## Scope and version

Native runtime is `64b4651263361d84097ec2d24723b0a1516a3e70` (implementation
`68d850e` plus main's retained Staging evidence). UI assertion source is `ef775ea`; native runtime is unchanged. The later test-environment
change `8dec367` allows four synthetic attempts per task to exercise the four-Turn
contract. No remote scope, policy or budget was changed.

An installed `VP_NATIVE_TASK_CONTEXT=task_history_v1` selects v3. Empty build
settings preserve v1; invalid values fail closed. The local test flag only works
with a validated loopback destination. The compiled default plist has empty
native-environment, Staging-origin and task-context values.

## Review

Independent final runtime review: Critical0 / Important0. Two recovery defects
found during review were fixed: an obsolete pending request now has an explicit
old-policy withdrawal path, and withdrawing the current policy cannot discard
another policy's uncertain pending request. The final legacy-compatibility change
was reviewed separately without repeating unaffected review work.

## Local verification

The first diagnostic run built and ad-hoc signed successfully. Its four-Turn test
encountered the fixture's existing three-attempt budget: five controlled HTTP calls
were observed across the earlier legacy cases and the context case, and the fourth
context Turn did not produce the expected clarification within the test window.
The relevant state tests passed. The remaining broad UI diagnostic run was stopped
when final review changes were ready; it is not final-version acceptance.

The final related run uses actual disposable local Auth/SQL/native HTTP and a
controlled local model. Its setup initially inherited the three-attempt fixture;
before any text, task or attempt existed, a locked transaction verified all four
fresh scopes and set their task attempt capacity to four, matching `8dec367`.
A separate receipt records zero prior text/task/attempt rows. Existing pins were
not modified. The test selection is NativeAskStateTests, NativeAskIntegrationTests
and NativeAskUITests; required CI remains separate.

Final core run: NativeAskIntegrationTests2/2 and NativeAskStateTests6/6 passed.
This includes actual four-Turn restoration, technical-failure repair, cancellation,
exact mode boundary, lost receipt and stale-policy withdrawal behavior. The four UI
cases failed at the shared login status assertion: the current Profile view says
“会话有效 / Session active”, while the tests still expected the older “本机会话有效 /
Local session active”. Login and profile HTTP calls succeeded. The assertions were
synchronized (Ask `8d5baee`, adjacent Identity `ef775ea`); runtime remains unchanged.
Only NativeAskUITests is being rerun against a fresh matching four-attempt fixture.

Final UI run at `ef775ea`: NativeAskUITests4/4 passed, zero failures/skips on
an owned iPhone17 Pro Simulator/iOS26.5. Both languages passed consent/send/relaunch;
task-context cases additionally restored clarification intent, sent a follow-up
and explicitly started a new question. Ad-hoc build/signature verification passed.
The runner removed its owned Simulator, synthetic accounts and disposable stack.

The final evidence is the unchanged core8 plus corrected UI4, not a claim that the
initial12-test run passed. Raw summaries and exact commands are retained in
[core-summary.json](core-summary.json), [ui-summary.json](ui-summary.json),
[core-commands.jsonl](core-commands.jsonl), [ui-commands.jsonl](ui-commands.jsonl)
and [fixture correction receipt](core-fixture-capacity-correction.json).
Screenshots show local synthetic data: [English](task-context-en.png),
[Chinese](task-context-zh.png). Required PR CI remains separate.

## Acceptance limits

Local controlled-provider tests do not establish model semantics. Both retained
real Qwen fixed-case failures remain in
[Staging evidence](../task-context-staging-20260912/verification.md). A later [remote native read/relaunch observation](../native-staging-read-20260912/verification.md)
verifies retained real answers only. Native-submitted real clarification continuation,
persistent unattended worker operation and full #195/S2 acceptance remain open. The accepted contract keeps pending retry state in memory only;
relaunch coverage is for already server-accepted history, not cross-process
uncertain-submit deduplication. Physical-phone validation remains deferred at JT's request.

Rollback disables the installed context flag and the corresponding Staging worker;
retained task links, consent and cost records are not rewritten or replayed as new
goals. No production activation or distribution signing is part of this slice.
