#!/bin/zsh
set -eu
cd "${0:A:h}/../../.."
# Invoke from the repository, not Documents. No simulator or service is touched.
repo="$(git rev-parse --show-toplevel)"
cd "$repo"
proof=artifacts/IOS-001/qa-history-20261016
feature=ios/VisePanda/VisePanda/Features/RealServiceEntry
sdk="$(xcrun --sdk iphoneos --show-sdk-path)"
dev=/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer
xcrun swiftc -typecheck -swift-version 6 -target arm64-apple-ios17.0 -sdk "$sdk" "$proof/ScopeDependency.swift" "$feature/NativeQA/NativeQAContract.swift" ios/VisePanda/VisePanda/DesignSystem/VisePandaTheme.swift "$feature"/NativeQAUI/History/*.swift > "$proof/typecheck.log" 2>&1
binary="$(mktemp -u /tmp/qa-history-check.XXXXXX)"
trap 'rm -f "$binary"' EXIT
xcrun swiftc -swift-version 6 -F "$dev/Library/Frameworks" -I "$dev/usr/lib" -L "$dev/usr/lib" "$proof/ScopeDependency.swift" "$feature/NativeQA/NativeQAContract.swift" "$feature/NativeQAUI/History/NativeQAHistoryPresentation.swift" ios/VisePanda/VisePandaTests/NativeQAHistoryPresentationTests.swift "$proof/main.swift" -Xlinker -rpath -Xlinker "$dev/Library/Frameworks" -Xlinker -rpath -Xlinker "$dev/usr/lib" -o "$binary" > "$proof/behavior-build.log" 2>&1
"$binary" > "$proof/behavior.log" 2>&1
git diff --check
