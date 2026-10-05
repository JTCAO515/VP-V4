# F2 shared inbox v1 — single producer / read-only app dependency

Owner: extension task `01a10bb9-14b8-7b00-aeb2-6c593a2230b4`, branch `vpj55-share-inbox-20261005`, based on `70a19fd023cb0d55108beb57d7d1062fe682d9ba`.
App consumer / sole F2 integrator: `01a10bb9-1677-75c3-bf5b-72f527c024a3`.

## Exact call chain

System Share Extension principal class `ShareViewController` → exactly one PDF `NSItemProvider` → `loadFileRepresentation` → synchronous `ShareIntakeDelivery` inside callback lifetime → `ShareIntakeInbox.receive(fileAt:)` → bounded 20,000,000 bytes, 1–10 page CGPDF header/count check (no text extraction) → protected staging source + receipt → atomic folder move → completion UI. No raw content, filename, URL, account identity, token, or error description is logged or placed in a link. No extension-to-app launch workaround.

The system provider supplies no trustworthy owner. Every received file starts in `unclaimed`; no automatic login assignment. The app shows metadata only and requires an explicit material selection and account/Trip confirmation. After immediate current-session validation, call `claim(receipt, namespace: NativePDFWire.namespace(currentScope), userConfirmed: true)` synchronously. Namespace is the existing F1 hash of account + endpoint + epoch. Receipt ID/digest/creation/expiry/identity never change on claim; TTL is not restarted. Bound records never transfer to a different namespace.

`available(namespace:)` returns only unclaimed metadata + that exact namespace's receipts. `read`/`sourceURL` reject unclaimed and mismatched records, stale receipts, expiration, symlinks, changed identity, byte count or digest. `sourceURL` exists to feed the frozen F1 `NativePDFIntakeStore.load(_:using:)`; it grants no Trip authority. The app must revalidate its current scope/generation after suspension, the original receipt/expiry/hash before use, and must not extend the original expiry when F1 makes its own copy. F1 remains the sole full validation, extraction, field correction, dedupe, Proposal and original confirm chain. Existing unknown-ACK journal semantics remain unchanged.

Integration check for the receiver: the F1 store currently constructs server `command.expiresAt` from its new local `NativePDFInbox.Receipt.expiresAt`. A UI timer capped to the original shared expiry is useful but does not itself cap that persisted/server command expiry. Ensure the receiving F1 copy's receipt expiry is no later than the original shared expiry before preview/submission, not just the view timer. This owner does not edit F1 or create a second parser/Trip writer.

Lifecycle: explicit dismiss/cancel calls `delete(receipt, namespace: receipt.ownerNamespace)`; successful F1 copy may delete only after its protected validated copy is actually durable. Logout/account switch/endpoint switch/epoch invalidation/account deletion call `eraseAll()` synchronously before new intake; a cleanup error fences intake. Deletion also removes unclaimed records. TTL purge runs before producer and listing; maximum 8 visible entries bounds retained data. A persistent cross-process `flock` outside the erasable root serializes app/extension writes. No active owner state or credentials are published to the extension.

Initial-login exception requested by Main: `unclaimedReceipt(id:now:)` synchronously verifies one anonymous entry's metadata, TTL, file identity and content hash, returns metadata only. When the app has neither credentials nor a stored owner and has an explicitly selected, verified anonymous entry, its original pre-login clear may call `eraseAll(preservingUnclaimedID: selectedID, now:)`. Under the same lock this revalidates and preserves only that original unclaimed entry, deletes all owned namespaces and every other pending record, and verifies the retained inventory. Missing/expired/owned/changed IDs throw; no ownership assignment, file copy or renewed TTL occurs. Signout, account/endpoint/epoch change, denial, privacy deletion always pass nil (the default). The receiver owns the initial-login authorization precondition.

Manual signed-out inbox selection: `unclaimed(now:) -> [Receipt]` runs lock + TTL purge, validates metadata/TTL/file identity/hash of every returned anonymous entry (at most 8), and returns only anonymous metadata, never owned rows or their count. The app can show PDF page count/date, select one ID before initial login, validate it via `unclaimedReceipt`, and preserve that exact original pending intent. It cannot read unclaimed bytes, auto-assign a user or silently import. The extension's Done UI explicitly tells the user to open the app manually.

`ShareIntakeInbox.configured(bundle:)` reads `VPShareIntakeAppGroupIdentifier`; empty/missing/unexpanded/invalid values or a nil normal container API result throw `.unavailable`. There is no guessed group ID or app-sandbox fallback. Injection `init(container:lifetime:)` is only for owned synthetic test containers. Actual App Group membership / entitlements / provisioning remain UNRUN and unenabled.

## Proposed exact source-target connection for Main review

No project, main-app plist, Session, Route, AppShell, or F1 file is changed by this owner.

Integrator owns these hunks after Main's precise lease:

1. Add file reference and an app `PBXBuildFile` for `ShareIntakeCore/ShareIntakeInbox.swift` to main app sources. Add references for the extension principal source `ShareIntakeExtension/ShareViewController.swift`, the shared producer `ShareIntakeCore/ShareIntakeDelivery.swift`, proposed `ShareIntakeExtension/Info.plist`, and both `en.lproj/Localizable.strings` and `zh-Hans.lproj/Localizable.strings` as a localized variant resource. Add separate core inbox + delivery `PBXBuildFile` entries to extension sources (same file references, no duplicated Swift code). The main app needs only the inbox file; the delivery file stays in the shared core directory to allow actual NSItemProvider synthetic lifecycle tests without copying production source.
2. A new `PBXNativeTarget` named `ShareIntakeExtension`, product type `com.apple.product-type.app-extension`, sources above, only localized resources, empty frameworks phase (Swift SDK links UIKit/UniformTypeIdentifiers/CoreGraphics/CryptoKit/Foundation). No third-party libraries, AMap, scripts, package dependencies, entitlements or capabilities.
3. Debug/Release build configurations: `APPLICATION_EXTENSION_API_ONLY=YES`, `SKIP_INSTALL=YES`, `IPHONEOS_DEPLOYMENT_TARGET=17.0`, `SWIFT_VERSION=6.0`, strict concurrency complete, `GENERATE_INFOPLIST_FILE=NO`, `INFOPLIST_FILE=ShareIntakeExtension/Info.plist`, `PRODUCT_NAME=$(TARGET_NAME)`, bundle suffix `.ShareIntakeExtension` under the existing app bundle, `CURRENT_PROJECT_VERSION=1`, `MARKETING_VERSION=0.1.0`, inherited target device family. No development team, signing identity, credentials, App Group / associated-domain values, scheme activation or provisioning changes.
4. Add extension product to Products and target to project. To make it reachable from installed app builds, add app target dependency/container proxy and `PBXCopyFilesBuildPhase` `dstSubfolderSpec=13`, product build file attributes `RemoveHeadersOnCopy`; this is unsigned source embedding only, not an entitlement/account activation. Main must approve this exact source scaffold first. Target-device and Share-sheet observation remain UNRUN.
5. Main app and extension configuration keys, if wired, default to an empty build setting. Never supply a real `group.*` value. Missing configuration is the explicit manual Files fallback, not a capability claim.

Proposed Info source (integrator writes after Main review):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleDisplayName</key><string>VisePanda</string>
  <key>CFBundleExecutable</key><string>$(EXECUTABLE_NAME)</string>
  <key>CFBundleIdentifier</key><string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
  <key>CFBundleName</key><string>$(PRODUCT_NAME)</string>
  <key>CFBundlePackageType</key><string>XPC!</string>
  <key>CFBundleShortVersionString</key><string>$(MARKETING_VERSION)</string>
  <key>CFBundleVersion</key><string>$(CURRENT_PROJECT_VERSION)</string>
  <key>VPShareIntakeAppGroupIdentifier</key><string>$(VP_SHARE_INTAKE_APP_GROUP_IDENTIFIER)</string>
  <key>NSExtension</key><dict>
    <key>NSExtensionPointIdentifier</key><string>com.apple.share-services</string>
    <key>NSExtensionPrincipalClass</key><string>$(PRODUCT_MODULE_NAME).ShareViewController</string>
    <key>NSExtensionAttributes</key><dict>
      <key>NSExtensionActivationRule</key>
      <string>extensionItems.@count == 1 AND SUBQUERY(extensionItems, $item, $item.attachments.@count == 1 AND SUBQUERY($item.attachments, $attachment, ANY $attachment.registeredTypeIdentifiers UTI-CONFORMS-TO "com.adobe.pdf").@count == 1).@count == 1</string>
    </dict>
  </dict>
</dict></plist>
```

No target setting/Info source embedding was applied by the extension owner. Integrator must report exact build + source wiring evidence separately from configured App Group/device capability.

## Verification facts (owned synthetic container only)

- 2026-10-05 macOS direct `NSItemProvider.registerFileRepresentation` → actual production `ShareIntakeDelivery.start` → core atomic producer: success/original preservation, cancellation, and provider error cases PASS. These are real item-provider API tests with generated local PDFs, not an installed Share-sheet observation.
- Core synthetic suite covers explicit claim, cross-namespace reads/claims/deletes, original TTL, page/byte/format/encryption rejection, cancellation, duplicates without overwrite, 8-entry bound, hash/identity replacement, symlinks, initial-login single-entry preservation + invalid/expired/changed/owned ID rejection, killed producer staging cleanup, and concurrent producers.
- First iOS source compile FAIL: button local `cancel` shadowed the Objective-C selector; renamed to `cancelButton`. Corrected iOS SDK compile PASS, Swift 6 complete strict concurrency, MainActor default isolation and `-application-extension` enabled.
- First 13-case core run FAIL: preserving pending compared URLs with different directory flags and removed its selected entry; changed to exact validated UUID folder-name comparison. Corrected 13-case run PASS. Final owned suite including anonymous-listing hash validation: 3 actual NSItemProvider cases + 16 core cases, 19 PASS, 0 skip (2026-10-05 19:21 Asia/Shanghai).
- Localized strings plist lint PASS; staged diff check PASS. No main-app/project/F1 files modified.
- UNRUN: assembled app/appex xcodebuild and its App entry/F1 end-to-end chain (sole receiver/integrator owns wiring and final tests), actual App Group entitlements and provisioning, installed Share sheet, Universal Links/domain services, physical device, target/provider/account data. No Simulator boot, target entitlement, real group ID, signing credential, domain service, database, provider or Storage action performed.

Runnable core command from this directory: `swift test --scratch-path /tmp/vpj55-share-inbox-tests-20261005`.

Runnable iOS source compile from repo root: `xcrun swiftc -typecheck -swift-version 6 -strict-concurrency=complete -default-isolation MainActor -application-extension ios/VisePanda/ShareIntakeCore/ShareIntakeInbox.swift ios/VisePanda/ShareIntakeCore/ShareIntakeDelivery.swift ios/VisePanda/ShareIntakeExtension/ShareViewController.swift -target arm64-apple-ios17.0-simulator -sdk "$(xcrun --sdk iphonesimulator --show-sdk-path)"`.
