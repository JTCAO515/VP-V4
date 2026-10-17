# IOS-001 头像详情与首次定制切片

Base: de0ce108aab1df832913a2b9103f10977443c6af. Related to #203 / #187; does not close either Issue.

Main integration: present `NativeFrontendAssistantDetail(state: sharedFrontendState)` directly inside the existing sheet. The view owns its NavigationStack and Close button. Main adds the two Assistant Swift files to the App target; no PBX/shared files changed here. Existing PandaMark asset is reused.

Owned UI: assistant identity, current sample work, activity list/detail, permission explanation and local toggle, todo complete/cancel/restore, optional first customization, draft preview/save/cancel, confirmed assistant-only reset. Journey/material/memory links use the injected state and dismiss back to the existing tabs. Reset preserves journeys/materials/memories. Loading/empty/failure/cancel states use the shared NativeFrontendStatePanel and state picker; work/navigation content hides outside ready state.

All values and changes are in-memory presentation samples. Activity is not background execution; permission toggle does not request iOS permission; todo completion is not booking; persona preview does not call AI. Travel preferences remain in Memory. No network, domain store, persistence, credentials or deployment introduced.

## Verification

- PASS: Swift frontend parse of both new sources.
- PASS: `sh tests/contract/ios-frontend-assistant/check.sh`; persona trimming/bounds/unsupported tone, independent editing draft, 3 tone previews, distinct todo states and fresh sample reset; Swift 6 iOS17 Simulator SDK typecheck with actual NativeFrontendState and AppTab. See checks.log.
- PASS: `node scripts/docs-check.mjs`.
- PASS: `git diff --check`; scoped source diff reviewed.
- UNRUN here: full App build/PBX integration, Simulator taps/rendering, Dynamic Type visual layout, VoiceOver, physical device. Main owns full App/simulator integration; no Main DerivedData/simulator used.

Suggested Main tap path: avatar → First customization → edit/preview → Cancel (unchanged) → Save → return to chat (new name); activity → sample material; permissions → allow/disallow; todos → complete/cancel/restore; state picker → empty/loading/cancel/failure/retry; reset → cancel/confirm and check unrelated tabs retained. No real service acceptance inferred.

Local assistant permission/todo/feedback state lives for the sheet lifetime; persona fields live for the injected frontend state lifetime. All are nonpersistent. No shared-interface patch needed.
