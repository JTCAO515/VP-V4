# Native shell and VP state closeout — 2026-10-03

Native scope after A9e, v6c3 and five-result73. #564 owned code is complete under Main/JT development-closure instructions; Main owns Issue closure and integration. #562 remains missing its generic Memory native command consumer until the original backend owner freezes that wire.

- Journeys goal details read the exact selected Conversation and verify goal/version, then read/paginate its existing Task history. Each status comes from its authoritative Turn record. Current completed tasks resolve the task-bound artifact reference and open the same five-result reader/decision UI. No second Goal, Trip, Task or Result writer exists here.
- NativeSession retains only actor/epoch/generation-bound Conversation/Goal and selected/browsed artifact pointers across shell remounts. Returning to VP reads the exact Conversation, verifies the selected source artifact's exact version/currentness and does not substitute latest. Browsed pointers only open a fresh exact detail read; browsing never silently adopts a source. Actor clearing drops pointers. This transient navigation state is not a persisted content cache and makes no process-termination persistence claim.
- VP maps real current data to first use, exploring, task in progress, result available and no new progress. It claims neither Online nor invented progress/success. Composer and Task history remain independently owned.

PASS: Xcode build on the original owned Simulator and derived data, /tmp/vpj81-closeout-final-build.log; git diff --check. No redundant existing test suite or device/human matrix was added or rerun. Two intermediate compilation failures (UUID key type and assignments inside ViewBuilder) were repaired before final build.

UNRUN: interactive shell-switch/goal pagination/device/accessibility/human and final backend union Auth flow. These are verification facts, not an additional development state. No merge, release or target acceptance claim.

#562 remaining owned function: generic Native Memory adapter/view connecting the backend's fixed Bearer list/closed command contract to explicit this-time vs long-term save, canonical same-profile correction and exact revision Undo receipt plus current readback. Existing #199 Web same-origin APIs cannot be used as a native Bearer substitute. Existing create Undo alone cannot claim summary-update Undo. Original backend owner has Main-authorized additive 130000 command/CAS implementation; no guessed endpoint or fake Save is included here.
