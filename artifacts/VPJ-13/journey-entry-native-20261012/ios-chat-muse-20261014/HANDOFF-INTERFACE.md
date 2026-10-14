# Chat-only Muse visual delta

Original59d92cc3 branch retained. New branch codex/ios-chat-muse-20261014 created without reset or merge. fedd8de8 exact single-file patch cherry-picks cleanly asba30a739, but its prior945a confirmation/reset changes are absent in this original de0 interface. Main was notified. No shared State was overwritten/repaired. Main must cherry-pick ONLY the Chat leaf commit below onto its own fedd/945a base, not ba30 or old branch history. Original5 untracked and ignored candidates untouched.

## Public leaf interface

NativeFrontendChatView(state: state, onOpenExpression: { ... }, onOpenPlace: { ... }, avatarImage: Image("MuseChatAvatarOriginal"), avatarScale: 1.6, avatarVerticalOffset: 0.39, onShowAssistant: { ... })

Optional callback arguments remain in the original declaration order. Main owns surrounding NavigationStack/Chat-only navigation-bar hiding,4Tab root, asset catalog, assistant presentation and PBX. No own shell, tab, state store or asset mutation.

Source files: NativeFrontendChatView.swift; existing NativeFrontendChatSheet.swift; new NativeMuseChatHeader.swift (includes referral). Integrate sole composer NativeMuseChatComposerView(state:onAttach:onExpression:onPlace:onVoice:) and sole sidebar NativeMuseChatSidebarView(state:onClose:) from their owners; never register test stubs. Current owner received Main's completed signatures but per latest instruction does not start another SDK/App check.

## Actual UI

White full background may extend to the top; message scroll viewport preserves system status safety, with94pt initial content rest so first/latest content isn't permanently below the floating controls. Scroll contents can pass beneath3 separate translucent controls; no opaque full-width navigation background, large title/tagline, first-visit suggestion card or welcome body. Fresh shared state messages=[]; history/draft/context/pending are exactly Main's per-session fields. Blank state is blank except minimal sample boundary, not a giant empty card. Existing loading/failed/cancelled panel is used only when explicitly selected.

Left double-line button opens the injected sidebar in a leading overlay with full scrim tap-to-close and state selection closes the drawer. Keyboard resigns before drawer/header navigation; composer retains its own focus/keyboard behavior. Middle original Image button opens Main assistant callback; brand VisePanda stays fixed independent of assistantName. Right gift opens referral sheet: body Color.systemBackground only, title and Close; no invitations/reward/mock-success backend or body footer.

Actual original and reference JPEGs were viewed. Original supplied hash matchesa2bfdd... and reference0856ac... (full pins in source-pins.json). Avatar draws the original Image only, scaled within56pt circle; vertical offset is fraction*side, horizontal adjustment -0.05*side; no derived crop bitmap, PandaMark, whole-body thumbnail or redraw. nil Image is a clearly unfilled circle with accessibility missing-original label. Main calibrates actual crop screenshot using1.6/0.39. Reference5tabs/FatPanda are explicitly NOT copied; approved4Tab/VisePanda prevail.

Existing material/journey callbacks, sample-plan/sample-shanghai links, visible flag diff→confirm/cancel and closed tool return behavior are preserved. No service/model/Trip/Memory/telemetry, no real E2 import, no data/fees/permissions/production/API. No source touched PR697's frozen branch or shared root/PBX/State/assets/other leaf beyond the authorized state patch cherry-pick.

## Verification / ownership

Full Swift syntax parse and source diff PASS. Earlier in-flight SDK macro command completed exit0 using exact fedd state and explicitly empty signature stubs; it is not actual composer/sidebar integration or image/UI evidence. Current referral footer deletion is syntax-only verified. Main instructed no further SDK/typecheck/App/resource commands from this owner; tests now update old welcome counts to0 and add per-session context/draft/pending/history/missing-journey guard expectations for Main's actual interface, but are deliberately UNRUN here. No previous assertion was weakened. Main handles actual SDK/state/fullApp/UI/safe-area/long-scroll/keyboard and source integration.

No new device/container/port acquired. Prior own temporary SDK cache/artifacts retained; Main simulator8F6 and all root resources untouched. Original exclusive Chat scope retained for same-task review fixes; do not infer whole-file or State release. No broad dependency PR opened against old main; Main indicated a new target branch for coherent integration.
