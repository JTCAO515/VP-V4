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

Configured consumers implement identity, same-Trip reads/writes and bounded Ask;
capability still depends on the actual backend, session, consent and worker. Refer
to [current handoff](../../docs/handoff.json) for version-specific observed results
and UNRUN items. This is not complete native, Store, booking or payment acceptance.

The bundled icon and wordmark use the operator-confirmed heart logo; see
[the current source and runtime export notes](../../assets/brand/vise-panda/official-heart-20260913/README.md).
[Asset provenance and permitted surfaces](../../docs/licenses/asset-rights-ledger.json) remain
authoritative; replacement approval does not establish signed Store or complete app acceptance.

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
