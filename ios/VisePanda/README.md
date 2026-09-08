# VisePanda iOS

VPJ-01 repository foundation, audited from the untouched local IOS-01 source.
Native SwiftUI / Swift 6 / iOS 17 minimum. Each tab owns a NavigationStack.
Trip, Explore, Ask, Tools, Profile remain stable; Ask opens by default; Today lives in Trip.

The release picker offers zh-Hans/en. Legacy es/ru/ar resources and explicit launch overrides
remain compatible; an active legacy selection keeps its picker label until switching to zh/en.
Arabic still uses RTL. The Web locale migration is separate.
All screens are development preview: no account, AI, network, Trip write, booking or payment.
Draft text and language selection are session-only. Sending remains disabled.

The bundled icon is an upscaled local design asset for Simulator use only. Original resolution,
rights and Store submission approval remain release prerequisites.

## Build and test

Use the installed Xcode without changing global xcode-select:

```bash
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
xcodebuild build -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda \
  -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO
xcrun simctl list devices available
# Substitute an actual available simulator UDID.
xcodebuild test -project ios/VisePanda/VisePanda.xcodeproj -scheme VisePanda \
  -destination 'platform=iOS Simulator,id=<UDID>' CODE_SIGNING_ALLOWED=NO
```

A nonpersistent `-VisePandaLocale en` launch argument selects QA language; default is Chinese.
See [scope and compatibility](../../docs/contracts/vpj-01.md) and
[verification](../../artifacts/VPJ-01/verification.md). No signing or production action is included.
