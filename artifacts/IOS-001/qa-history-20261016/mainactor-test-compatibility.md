# Project MainActor-default XCTest compatibility correction

Main reported the actual combined App test compile failure at `NativeQAHistoryPresentationTests.swift:17`, log `test_sim_2026-10-16T08-46-33-995Z_pid2127_5ca95ce5.log`. The original standalone macOS 7/7 PASS did not cover the project's MainActor default and is not App compile evidence.

Changed only the owned test source: `nonisolated final class ...: XCTestCase`, explicit `@MainActor` file-private DTO helpers and all seven `@MainActor ... async` test methods, matching NativeQAConsumerTests. Removed redundant assumeIsolated wrappers. Production and UI sources remain unchanged. Normalized source comparison confirmed the same seven test bodies and assertions after stripping only actor/async annotations, wrappers, whitespace and braces. No assertion is removed or relaxed.

PASS: installed iPhoneOS27 SDK, arm64 iOS17, Swift6, `-default-isolation MainActor`, original NativeQAContract and history presentation source, original isolated NativeDataScope declaration, actual iOS XCTest framework. `mainactor-tests-typecheck.log` is empty with exit0.

Command from this WT:

```sh
xcrun swiftc -typecheck -swift-version 6 -default-isolation MainActor -target arm64-apple-ios17.0 -sdk /Applications/Xcode.app/Contents/Developer/Platforms/iPhoneOS.platform/Developer/SDKs/iPhoneOS27.0.sdk -F /Applications/Xcode.app/Contents/Developer/Platforms/iPhoneOS.platform/Developer/Library/Frameworks -I /Applications/Xcode.app/Contents/Developer/Platforms/iPhoneOS.platform/Developer/usr/lib artifacts/IOS-001/qa-history-20261016/ScopeDependency.swift ios/VisePanda/VisePanda/Features/RealServiceEntry/NativeQA/NativeQAContract.swift ios/VisePanda/VisePanda/Features/RealServiceEntry/NativeQAUI/History/NativeQAHistoryPresentation.swift ios/VisePanda/VisePandaTests/NativeQAHistoryPresentationTests.swift
```

UNRUN here: actual project combined App compile/test, simulator and UI. Main owns these. This targeted typecheck covers the reported default-actor mismatch without claiming an App build. The original seven synthetic behavior tests are not rerun as a matrix; their inputs/assertions remain unchanged. No new test or permission is added.
