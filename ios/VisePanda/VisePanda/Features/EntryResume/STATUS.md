# Receiver status, 2026-10-05

Branch vpj55-native-entry-resume-20261005, fresh base 70a19fd, frozen F1 a44e1977 merged normally; no F1 production copy or duplicate extraction writer. Own first source d6272dd, caller chain 7a16d380; subsequent initial-login exception/current-scope cleanup delta being completed.

Actual chain: AppShell onOpenURL/onContinueUserActivity → NativeEntryResumeLink strict UUID pointer → session-owned NativeEntryResumeCoordinator → NativeEntryResumeView explicit current-account claim → original NativeTripStore.list/select/current canEdit fences → original NativeTripView re-reads owned Trip → optional initialPDFURL → original NativePDFIntakeStore.load → original field correction/preview/Proposal/confirm. No raw PDF in URL/log/network and no automatic Trip choice.

PASS: actual Link/State Swift module, 3 macOS XCTest cases, zero failures/skip (original test runner overlay/link failures retained as harness setup failures, assertions unchanged); direct standalone link and state negative checks; Swift syntax; project plist syntax; diff formatting after inherited line cleanup. These checks are not iOS UI/extension/system entitlement/target evidence.

Remaining producer dependency: consume committed source-fixed Core + extension. Producer added actual locked unclaimedReceipt/eraseAll(preservingUnclaimedID:) after Main relay; consumer initial-login chooses exception only with no credential/stored owner/signout/journal cleanup owners and validated unclaimed receipt. Need unclaimed metadata-only listing to select original anonymous material in signed-out manual inbox; precise request in WIRE, Main relay required.

Remaining shared precise review: target/source/Info scaffold per producer WIRE Main approval (currently only Main/Test Sources lease granted); one shell.shareInbox en/zh string key; no live capability/build IDs/domain/entitlement values. Build-for-testing generic Simulator compiles only; no use of F1 exclusive 802 device.

UNRUN: real AppGroup membership, AASA/associateddomains, device short delivery, installed/uninstalled routing, provider/Storage/target. Code currently default-unconfigured visibly directs to Files. Whole #236 not claimed Closed and no PR opened before whole F2 fixed.

Intermediate actual iOS unsigned generic app build PASS: `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer python3 scripts/ios/ci.py --build-only --output /tmp/vpj55-f2-app-build`. Actual consumer code + sole producer Core were compiled through a temporary read-only symlink to producer's uncommitted source (no duplicate writer/copy); this validates the AppShell/Session/Trip/PDF integration compilation but is not final source-fixed dependency or extension target acceptance. Temporary symlink is not committed and must be removed before normal producer merge. Logs /tmp/vpj55-f2-app-build/{build.log,commands.jsonl}.
