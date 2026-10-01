# VPJ-83 runtime navigation mode crash — 2026-10-02

Independent bugfix branch `codex/vpj83-shell-switch-20261002`, initially clean at main `808870766fda33a7f5335a5a13e2fc0af4d0f885`. Goal-entry branch remains clean and is not stacked on this runtime change. Main approved AppShell/TabRoot host identity and the minimum readonly NativeAssistant→AskView→TabRoot pending callback; Library methods, fixtures, permissions, NativeSession and domain writers are unchanged.

## Observed failure

Library owner's actual local Auth/session succeeded, then legacy→More→four-tab→Library crashed the **app**, not the test runner. Original report `~/Library/Logs/DiagnosticReports/VisePanda-2026-10-02-061849.ips` and `/tmp/vpj82-paged-library-ui-proof5/tests.xcresult` are retained by that owner. Exception: SIGABRT / NSInternalInconsistencyException, `UINavigationBar.layoutSubviews`: a visible bar's `Explore` top item belonged to a different navigation bar. This is not a Translation, backend or permission failure.

The same TabView host previously replaced its entire five-/four-tab NavigationStack set, allowing UIKit navigation item/controller reuse across the two collections. Unlike #588's single-tab root jump, clearing one router cannot fix this whole-collection replacement. New host identity includes actor scope, mode and a generation rotated only when actor/mode actually changes. Within one mode the same tabs/stacks/routers remain stable; #588 entryReset still resets only that router path.

## State and unknown-write safety

AppSettings/NativeSession and persisted task/receipt/result sources are outside this short-lived graph; switching neither clears credentials nor cancels accepted work. Temporary page history and unsent drafts already belonged to the replaced tab set; the menu now explains their reset before the explicit switch.

Uncertain view-owned intake/planning/Trip mutations must not be silently dropped. Readonly callback reports busy or any pending immutable mutation. ShellSwitchState holds tab-specific locks qualified by captured actor **and host generation**. Ordinary tab/sheet disappearance never releases a lock. Only that current source's explicit false state or actor replacement clears it; old-host/old-actor callbacks cannot mutate a new lock. Switch is disabled and its action rechecks the guard; Open VP remains available for resolving pending work. No automatic retry/send/cancel or global persistent session store was added. AppShell destruction discards this navigation-only state; a new actor/host starts isolated.

## Actual checks

- PASS owned disposable Supabase/Auth/HTTP, iPhone SE iOS17.5 actual UDID `3A81AB84-9493-46EB-A932-0F56A28EE339`, signed-in legacy→four→Library→Journeys/Trip→Library/Journeys path retention→old root-entry reset→legacy fallback, same session identity retained, then explicit sign-out clears actor.
- PASS same local run creates one synthetic intake using the original writer, deliberately loses its POST receipt and fails readback. VP pending→Library keeps mode disabled; returning through the normal VP entry and **explicitly retrying** clears it only after readback. Two POSTs are object-equivalent immutable/idempotent requests; no automatic resend. `pending-summary.json` records only safe counts, never credentials or bodies.
- PASS 3/3 scoped native guard/identity tests: intake/planning/Trip pending and busy lock, different tab false cannot unlock VP, explicit source false releases, old actor/host cannot clear/set new locks; host identity changes for actor/mode. An initial test filter selected 0 tests and is not counted; corrected own class/filter produced 3/3.
- Initial local UI harness lacked an explicit disposable environment, then a composer selector used TextField despite the vertical composer being represented as another accessibility type. Corrected environment/semantic selector, retaining assertions. No failed result was called PASS. The original Library crash is separate red evidence.

The fresh local runner owns unique stack/output directories, checks fixed ports and local Docker, suppresses credential-bearing CLI output, injects only synthetic local profile into a mode0600 xctestrun then removes it, and cleans only its stack. Existing fixture helper was reused unchanged. `next dev` generated AGENTS/next-env churn was restored after cleanup, not committed. Native compile is part of the scoped build/test. Repository checks and final CI are appended below.

UNRUN: actual Staging/Production, real provider/device/VoiceOver/full accessibility and overall #564 acceptance. Parent stays OPEN. Revert this navigation-only change to roll back; persisted accepted work and original domain consumers remain. Goal→VP handoff is prepared as a separate later slice and not implemented here.

Final safe counts: `proof6` actual Auth UI 1/1 with no skip/failure and immutable request object equality; native guard suite 3/3. Lint/docs/diff pass. Rebased without conflicts onto main `7ba0cad59a2c7c6837f83f174da5e515c34cbe65`; upstream changed Web basis/map worker only, none of the affected native or reused fixture sources, so matching scoped evidence is reused rather than repeating the local Auth stack. Current-head required CI and independent review remain merge gates. The goal-entry branch remains untouched at its earlier base.
