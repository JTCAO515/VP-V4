# VPJ-28 native consumer coordination

Owner: official Native chat 01a10c0c-ecaa-76b2-a513-316eb826cf8d; worktree/branch vpj28-native-place-guide-20261005, fresh origin/main e2ea9334. Sole Features/PlaceGuide and its tests. Shared callers require Main lease. No target activation.

Actual first product source: NativePlaceGuideProgress.swift, conservative system-speech progress tied to a segment, bounded UTF-16 positions and explicit replay reset. No acoustic listening claim.

Main interface request after actual #217 source read (db936 immutable / PR658): Audio controller only exposes selectFinalTranslation/speak/stopSpeaking. NativeVoiceAudioDriver lacks pause/resume. Please coordinate original owner release and approve a precise extension in existing Audio controller/state/system driver, preserving existing translation one-play-per-ID behavior. Required: explicit guide playback with exact immutable receipt/segment text, pause at word boundary and continue same utterance only after caller freshly validates actor/source/rights/TTL; failure stops and purges selection. Explicit guide replay may start a new playback attempt after fresh same-source validation, without calling Ask. No second driver/recorder and no arbitrary changing IDs to bypass translation guard. Interruption/background never autoplays; cancelled system utterance resumes from conservative UTF-16 progress only through explicit validated Guide action.

Other pending precise leases: Explore selected canonical result NavigationLink (same current Trip selection); Session guide ordinary-auth bounded request plus cleanup; pbx source/test registrations. Producer DTO/path agreement pending TS actual contract; Native will consume its immutable WIRE, not publish semantic sources or infer a generic city sentence as a POI guide. Existing groundedAsk consent/task/cost/operation stays sole generation lane. Initial interests are user-explicit local selection, never inferred Memory.

Cross-chat tool authorization is not inferred from the originating orchestration message. Use this local WIRE and ordinary Main relay for coordination.
