# Native Staging history and language persistence — 2026-09-12

## Real remote read

An owned iPhone 17 Pro Simulator/iOS 26.5 ran native PR332 at `8ce9e7e` against
`staging.go2china.space`, freshly resolved to the same ready Preview/API `b542ead`.
The signed app contained the explicit Staging origin and `task_history_v1` flag.
Two existing synthetic accounts signed in through the ordinary native UI; no
credentials were copied into this evidence. No provider worker was started and no
Ask input, consent change, budget change or migration was submitted.

English and Chinese each displayed three existing real Qwen answers. The latest
bounded-thinking answer matched its retained API result and Turn identifier exactly.
Both complete answer sets survived process termination/relaunch. The owner sets
were disjoint after switching accounts, and sign-out removed all displayed answers.
The full current policy notice was present in both locales. Screenshots were
visually inspected: [English](en-before-relaunch.png), [Chinese](zh-before-relaunch.png).
Read [receipt](verification.json) and [deployment check](deployment.json).
Both synthetic accounts were signed out; their original scopes and records remain.
The physical-phone account was not used.

AXe through MCP inherited CommandLineTools and could not inspect the Simulator.
The bundled AXe CLI with command-scoped DEVELOPER_DIR then provided actual UI
hierarchies and taps; no global Xcode selection changed. Initial boot/launch and
an obsolete English sign-out selector were tool diagnostics, not successful checks.

## Observed language defect and fix

The English picker changed the screen but was lost on process relaunch: AppSettings
kept selection only in memory. This initial failure remains in the read receipt.
Runtime `b561bf9087468e99c181b15525b641aef79491ff` saves subsequent picker selections in a device-local UserDefaults
key and restores valid saved values on launch. Existing explicit locale launch
arguments still take precedence without overwriting the saved preference; missing
or invalid saved values retain the Chinese default. No account/profile data is sent.

Actual affected native tests: 9 passed, zero failures/skips; see
[summary](locale-tests-summary.json). On the newly built app, English and Chinese
picker choices each survived a real process termination/relaunch. An explicit
Arabic launch retained RTL tab order and did not replace saved Chinese on the next
ordinary launch. The owned Simulator was removed. Existing local Ask core8/UI4
results remain scoped to their recorded source; required final PR CI is separate.

## Limits

This proves the native consumer can read retained real remote answers, not that a
native-submitted clarification/follow-up was accepted by the real model. The frozen
clarification-first cases still fail; persistent unattended recovery and full S2
remain open. Physical-phone verification stays deferred. Latest remote read source
and local language-fix source are intentionally separate above.

No production setting or main branch was changed. PR332 and PR333 remain unmerged
because main currently auto-deploys Production; the prepared production build guard
awaits JT's specific approval. This record grants no release authority.
