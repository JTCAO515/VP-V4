# IOS-CHAT-MUSE-20261014 — connected local chat visual update

Related to IOS-001/#203 and #187. JT approved implementation at 2026-10-14T10:01Z (Sentinel_1de3567fc58481919ba98c6b17e8db4c). Previous frontend PR697 remains merged only to the QA integration branch, a584d1d4, not production main. This change uses a separate branch and preserves original owner worktrees/leases.

## Delivered behavior

- Chat uses a full white scrolling canvas with three separate floating translucent controls: double-line sidebar, original panda face/headgear + fixed VisePanda name, gift entry. No large title/tagline, full-width navigation bar, welcome paragraph or suggestion card.
- Exact uploaded IMG_4852.jpeg bytes are in MuseChatAvatarOriginal.imageset: SHA256 a2bfdd463df05335d052c4485bfa613a422ef67a575aaacb2b886efd436cf29e. Source1206x1371/269167bytes. Circular crop is a runtime Image scale/offset, not a generated replacement or edited source bitmap. Actual screenshot shows face and headgear, not full body.
- Reference IMG_5369.jpeg was actually viewed; its FatPanda/five tabs are not copied. Approved VisePanda/four tabs remain.
- New conversation is quiet and empty. Sidebar switches explicit local history; drafts, messages, context and pending confirmations remain per local conversation. No real Session, storage, model or network authority is introduced.
- Capsule placeholder is exactly 开始聊天. Plus contains attachment/expression/place, empty input shows voice, nonempty input shows guarded send; keyboard Done and send/tool dismissal work. Existing sample tool explanations and result/diff-confirm/cancel remain.
- Gift opens a blank body with title/Close, no referral backend or fake reward. Avatar opens existing assistant detail; existing persona/Memory/activity/permission capabilities remain.
- A small top fade protects the system status region; messages still pass under independent floating controls. No opaque full navigation-bar strip.

## Actual validation

Owned new iPhone17/iOS26.5 simulator8F6CA72C-73C0-45C0-8606-0543B1F725BD; old delivery simulatorE944 untouched. Main owns profile v10-ios-chat-muse-20261014 and dedicated DerivedData /Users/jtsm5p/Documents/Codex/2026-10-13/v10-main/ios-chat-muse-derived-data-20261014.

PASS: full App build/install/launch54.6s (six pre-existing warnings), then affected top-region repair build26.8s. Last log /Users/jtsm5p/Library/Developer/XcodeBuildMCP/workspaces/Documents-2025647e2650/logs/build_run_sim_2026-10-14T13-07-04-138Z_pid3685_6a01b417.log. Bundle space.go2china.VisePanda, actual normal launch restored after testing.

PASS actual UI: quiet new chat, history selection and new-chat return; original cropped avatar and fixed name; assistant entry; gift blank/Close; empty voice explanation/Close; focused input becomes send, send produces local result and dismisses keyboard; explicit keyboard Done; plus expression/place reachable and return; all four tabs roundtrip. Input automation under the active Pinyin keyboard transformed the requested ASCII sequence; actual resulting text is recorded, not claimed verbatim.

PASS actual long scroll:32 explicit local fixture messages using -V10MuseLongChat; observed1→32 then32→1, all three floating controls retained. First/status-overlap screenshot was retained, then a local status fade was added. Final system time/battery and first/latest resting messages are readable. Long data is DEBUG-only, never normal welcome content or a real service history.

PASS:23 actual shared-state chat contract assertions, Main quiet/new/history/draft/context/pending/unknown-ID/reset checks, composer11 input cases, actual SDK typechecks for composer/sidebar, Swift parse, docs/diff. First CLI invocation omitted -parse-as-library for main.swift; command invocation failed, corrected invocation passed without source/test changes. Original owner completed an in-flight signature-stub SDK check; Main full App is separate evidence.

Screens01-quiet-chat.jpg,02-sidebar.jpg,03-referral-blank.jpg,04-keyboard-input.jpg,05-long-top.jpg,06-long-bottom.jpg (original status overlap),07-status-region-protected.jpg (first fade),08-long-bottom-final.jpg,09-long-top-return.jpg. runtime-snapshots.json contains the semantic traces. Continuous unedited local recordings: /Users/jtsm5p/Documents/Codex/2026-10-13/v10-main/ios-chat-muse-flow-20261014.mp4 and ios-chat-muse-scroll-final-20261014.mp4. Earlier scroll-first recording retained.

## Limits

Real Auth/provider/persistent Session/voice/attachment upload/referral/payment/Trip/Memory writes, physical device/VoiceOver and release are UNRUN. Source/history/fixture/simulator/production remain separate. Original5 dirty and ignored candidates remain with Chat owner; no forced stop or permission/identity/tool bypass. Full App uses Main's exact state, not the original owner's older State baseline or test signature stubs. Final head review and applicable remote CI are required before normal merge.

## Formal review correction

Original b2 review: Standards P3 duplicated DEBUG/Release nav/fade configuration (no hard violation); Spec P2 removed direct associated-journey return. Both reports remain at Main private muse-b2-{standards,spec}-review.md. Original Chat owner restored only an explicit current-context Journey/material-ID link in76617bc8; Main integrated647f9e8f, retaining stale/missing context guards and quiet new-page behavior. Main unified the shared nav/status modifier outside the build-condition branch, preserving both original callback variants.

Affected full App build/install/launch PASS27.2s. Actual normal new chat has no journey link; explicit sample-history context displays 查看关联旅程, clicking opens the same sample-shanghai journey/day page. Evidence10-journey-return-repaired.jpg and review-repair-snapshots.json. No work-status/welcome card reintroduced. Original approval/model-capacity failures are not relabeled; original owner source/worktree/leases preserved.
