# VisePanda iOS

VPJ-01 repository foundation, audited from the untouched local IOS-01 source.
Native SwiftUI / Swift 6 / iOS 17 minimum. Each tab owns a NavigationStack.
Trip, Explore, Ask, Tools, Profile remain stable; Ask opens by default; Today lives in Trip.

The release picker offers zh-Hans/en. Legacy es/ru/ar resources and explicit launch overrides
remain compatible; an active legacy selection keeps its picker label until switching to zh/en.
Arabic still uses RTL. The Web locale migration is separate.
Without an enabled endpoint, screens remain development previews. The accepted
`NativeSession` also supports a loopback `-VisePandaNativeAPI` for local integration,
and an installed Staging build configuration (`VisePandaNativeEnvironment=staging`,
`VisePandaStagingAPIOrigin`) restricted to the allowed first-party hosts. Remote
endpoints cannot be selected through launch arguments. `VisePandaNativeTaskContext`
selects the installed Ask mode; local tests can use `-VisePandaGroundedMode`.

Configured consumers implement identity, same-Trip reads/writes, bounded Ask,
place search/input tips/address observations, screenshot review and relative-day outlines;
capability still depends on the actual backend, session, consent and worker. Refer
to [current handoff](../../docs/handoff.json) for version-specific observed results
and UNRUN items. This is not complete native, Store, booking or payment acceptance.

The bundled icon and wordmark use the operator-confirmed heart logo; see
[the current source and runtime export notes](../../assets/brand/vise-panda/official-heart-20260913/README.md).
[Asset provenance and permitted surfaces](../../docs/licenses/asset-rights-ledger.json) remain
authoritative; replacement approval does not establish signed Store or complete app acceptance.

## Current development

The [2026-09-22 status snapshot](../../docs/program/2026-09-05/CURRENT-STATUS-2026-09-22.md)
links merged features and open work. The relative-day outline is bounded to four cities,
2–7 days and food/walking directions; it requires a date before the existing proposal
confirmation path saves it. It is not a grounded executable itinerary. Place input has
one shared invalidation path for query/city/provider/account/tab changes so late search,
suggestion and address responses cannot restore obsolete selections. The AMap iOS SDK device lane and Web JS SDK consumer are wired under #363;
real rendering and provider/app-domain acceptance remain separate. See
[map configuration and SDK install](../../docs/runbooks/place-search-maps.md).
Run `node scripts/maps/install-ios-sdk.mjs` before device builds. Simulator builds
retain the address fallback.

## Build and test

Use the installed Xcode without changing global xcode-select:

```bash
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda \
  -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO
xcrun simctl list devices available
# Substitute an actual available simulator UDID.
xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda \
  -destination 'platform=iOS Simulator,id=<UDID>' CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-
```

A nonpersistent `-VisePandaLocale en` launch argument selects QA language; default is Chinese.
See [scope and compatibility](../../docs/contracts/vpj-01.md) and
[verification](../../artifacts/VPJ-01/verification.md). Tests use a local ad-hoc signature for
Keychain access; no Apple signing credentials, provisioning update or production action is included.

## Reading-text accessibility

Scrollable foundation copy uses `VPReadableText` where native text measurement is
needed for consistent iOS17 and current-OS audits. It retains full Dynamic Type,
locale changes and RTL. SwiftUI and UIKit consume the same dynamic UIColor tokens;
do not round-trip these tokens through `UIColor(Color(...))` on iOS17.

`AppShellUITests.testMaximumTextFullAccessibilityInBothThemesAndLanguages` keeps
contrast in the full maximum-size audit. `AccessibilityContrastTests` checks the
palette and `ReadableTextLayoutTests` exercises actual rendered locale, size,
bounds and appearance behavior. See [the before/after and negative controls](../../artifacts/VPJ-01/readable-text-20260918/verification.md).

Tools row titles use the same renderer. The [Tools follow-up](../../artifacts/VPJ-01/tools-reading-20260922/verification.md)
retains the original iOS17 clipping failure and passing iOS17.5/26.5 full audits;
physical VoiceOver remains a separate unrun check.
Simulator audits do not establish physical VoiceOver or signed Store acceptance.
