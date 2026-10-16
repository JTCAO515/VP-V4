# IOS-001 explicit real-service disconnected state

New source: `ios/VisePanda/VisePanda/Features/RealServiceEntry/NativeRealServiceDisconnectedView.swift`.

Interface: `NativeRealServiceDisconnectedView(chinese: Bool)`; no environment service, state, store, transport, journal, action or credential/configuration fields. zh/en copy explicitly states the real service is not connected and asks users to update when the test service is ready. It uses existing VP spacing, dynamic semantic fonts and theme colors. Multiline title/body grow vertically inside a ScrollView; no fixed height, font shrink or Dynamic Type cap. Decorative symbol is hidden from accessibility; title is a header.

Accessibility identifiers: `native.real-service.disconnected`, `native.real-service.disconnected.title`, `native.real-service.disconnected.message`.

Main owns the hook: only explicit `-V10RealServiceFrontend` AND `!settings.nativeSession.enabled` AND VP/Ask root. An enabled session keeps original real Ask/Login consumers; other default/legacy/sample entries remain unchanged. Root/PBX/old Ask files were not edited by this change.

PASS: new source Swift syntax parse; actual new source plus unchanged VisePandaTheme.swift typechecked together with Swift 6 against iPhoneOS SDK targeting arm64 iOS17, using a disposable private module cache. No App build, simulator, device or shared DerivedData used. PASS: diff whitespace check.

UNRUN: Main PBX registration/Root hook, full App build, zh/en rendered AX/maximum Dynamic Type, real target and physical device. Source layout provisions are not rendered UI acceptance.
