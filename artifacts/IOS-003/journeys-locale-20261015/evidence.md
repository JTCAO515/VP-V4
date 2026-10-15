# IOS-003 Journeys locale repair — 2026-10-15

Isolated WT/branch `ios003-journeys-locale-20261015` / `codex/ios003-journeys-locale-20261015`, base accepted QA `a76799149cec460e742ab101a8b8190512b24464`. Original canonical WT/head6b50 and its evidence/resources remain untouched. The abbreviated a767 was ambiguous; resolved full commit was used for normal worktree creation, no reset/old-branch merge.

Only existing `Features/Frontend/Journeys/NativeFrontendJourneysView.swift` and exclusive locale checks/evidence changed. Owner retains this original Journeys lease, with no successor/release or overlapping tool. No Root/route/PBX/shared state/helper/Ask/canonical/Reader/backend/SQL edits. Sol6.1/medium requested; effective fields not exposed.

All seven leaf views now use the inherited selected Locale and the actual accepted PR714 NativeLibraryMemoryCopy helper. Eighty-six fixed UI pairs cover list, navigation, missing/empty states, confirmation labels, state menu, detail/day/place entry, schematic disclaimer, route mode display/constraints, checklist actions, explanation and booking-status sheets. Route picker tags remain original stable values. NativeFrontendStatePanel calls remain for Main's serial shared-panel locale fix; this branch does not copy that component.

Dynamic journey titles/subtitles/day titles remain direct payload reads. Schematic sample marker content (城市漫步/江景/休息) and day-focus sample prose remain unchanged, as requested; English fixed UI may therefore surround original Chinese sample content. No Trip, Proposal, navigation identity, confirmation state or checklist scope semantics changed.

## Verification

- PASS: `python3 tests/contract/ios003-place-ui/locale/verify.py`: executes the actual PR714 helper for every one of the 86 fixed pairs across zh-Hans, zh-Hant, en-US, ar, ru and und (516 selections). Chinese family maps to Chinese, all other/legacy locales to English exactly as PR714.
- PASS: the same check reverses only the paired copy/title adapters and verifies the entire original business/action/ID/binding/payload token stream equals QAa767. Explicit payload expressions and original sample content remain present unchanged.
- PASS: existing `python3 tests/contract/ios003-place-ui/journeys.test.py`, 2 tests executing shared state cross-page IDs/cancellation/reset and leaf isolation; unchanged checks reused.
- PASS: changed source Swift parse, diff inspection, `git diff --check`.
- PASS: actual changed Journeys source, original shared state/AppTab, actual PR714 helper and original place presentation typechecked against iOS17 Simulator SDK in Swift6/MainActor for DEBUG and release. No new source registration required.
- UNRUN here: complete App/simulator English/Chinese flow and screenshots. Main owns the unified simulator acceptance. No canonical/backend/provider/device matrix repeated.

## Shared integration seam (not applied)

The existing DEBUG NativePlaceActionsSampleExperience factory still initializes its local language to Chinese, regardless of inherited Locale. The exact DEBUG-only before/patch/after candidate is preserved verbatim below, preserving the no-argument API and manual language selection, using inherited locale until a local override, and resetting the existing child on app-locale change as it already resets on manual language change. Main applied it as `8a36585`; runtime verification remains in Main’s unified scope. Production PlaceActions/canonical/pending interfaces are untouched by this proposal. The Journeys caller stays on its original API.

Related to #209/#506, not completion or closure of their broader real functionality. No self-merge. Shared-panel and place factory candidates plus actual UI verification are Main's integration responsibility.

## Applied candidate archive (report only)

Main applied the exact candidate as `8a36585`. The following four original files are embedded byte-for-byte; only their report storage location changed. Standalone candidate files are removed to keep this evidence prose-only without changing CI selection rules.

### before.fragment.swift

SHA256: `c7101127b99c4a145e88758762416e9a746414bea7fee65a1233f98241b94724`

```swift
struct NativePlaceActionsSampleExperience: View {
    @State private var chinese = true
    init() {}
    var body: some View {
        VStack(spacing: 0) {
            Picker("Sample language / 样例语言", selection: $chinese) {
                Text("中文").tag(true)
                Text("English").tag(false)
            }.pickerStyle(.segmented).padding()
                .accessibilityIdentifier("place.sample.language")
            NativePlaceActionsSample(chinese: chinese).id(chinese)
        }
    }
}

```

### after.fragment.swift

SHA256: `67fe1c5dd0cd851d0d2ce42369020ec29db0b1af8674046e07c0632415ec5d83`

```swift
struct NativePlaceActionsSampleExperience: View {
    @Environment(\.locale) private var locale
    @State private var chineseOverride: Bool?
    private var chinese: Bool { chineseOverride ?? (locale.language.languageCode?.identifier == "zh") }
    init() {}
    var body: some View {
        VStack(spacing: 0) {
            Picker("Sample language / 样例语言", selection: Binding(get: { chinese }, set: { chineseOverride = $0 })) {
                Text("中文").tag(true)
                Text("English").tag(false)
            }.pickerStyle(.segmented).padding()
                .accessibilityIdentifier("place.sample.language")
            NativePlaceActionsSample(chinese: chinese).id(chinese)
        }.onChange(of: locale.identifier) { _, _ in chineseOverride = nil }
    }
}

```

### NativePlaceActionsView.swift.patch

SHA256: `1ae225f5c9e1057bb98dca6cfc121292779057c6bd169df0060809781745b364`

Lossless JSON-string encoding preserves the original diff context line containing one space without adding Markdown trailing whitespace. Decode the JSON value to extract the original UTF-8 patch bytes.

```json
"--- a/ios/VisePanda/VisePanda/Features/PlaceActions/NativePlaceActionsView.swift\n+++ b/ios/VisePanda/VisePanda/Features/PlaceActions/NativePlaceActionsView.swift\n@@ -350,17 +350,19 @@\n /// Main may mount this leaf directly: NativePlaceActionsSampleExperience().\n /// This entry uses the production presentation panels with synthetic callbacks only.\n struct NativePlaceActionsSampleExperience: View {\n-    @State private var chinese = true\n+    @Environment(\\.locale) private var locale\n+    @State private var chineseOverride: Bool?\n+    private var chinese: Bool { chineseOverride ?? (locale.language.languageCode?.identifier == \"zh\") }\n     init() {}\n     var body: some View {\n         VStack(spacing: 0) {\n-            Picker(\"Sample language / 样例语言\", selection: $chinese) {\n+            Picker(\"Sample language / 样例语言\", selection: Binding(get: { chinese }, set: { chineseOverride = $0 })) {\n                 Text(\"中文\").tag(true)\n                 Text(\"English\").tag(false)\n             }.pickerStyle(.segmented).padding()\n                 .accessibilityIdentifier(\"place.sample.language\")\n             NativePlaceActionsSample(chinese: chinese).id(chinese)\n-        }\n+        }.onChange(of: locale.identifier) { _, _ in chineseOverride = nil }\n     }\n }\n \n"
```

### manifest.json

SHA256: `35ba2d5bc1e6b19d9c3c793395df38518520d9919904b79a8cba0b0809093536`

```json
{
  "path": "ios/VisePanda/VisePanda/Features/PlaceActions/NativePlaceActionsView.swift",
  "scope": "DEBUG NativePlaceActionsSampleExperience locale default only",
  "beforeSHA256": "745476f1fd604c76f679cd679c8525c1b6fcfa443a13821a77e77ec6840b873c",
  "afterSHA256": "fb1442559bd1cd12d88c2a6c4b10e09038dfdbdf6fdd2ea59a2b25c0112f626e",
  "applied": false
}
```
