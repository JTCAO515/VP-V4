#!/bin/sh
set -eu
root=$(git rev-parse --show-toplevel)
work=$(mktemp -d /tmp/ios-chat-composer-check.XXXXXX)
trap 'rm -rf "$work"' EXIT
frontend="$root/ios/VisePanda/VisePanda/Features/Frontend"
composer="$frontend/ChatComposer"
dependency=fedd8de8a70f6f014d41d3c3176dc6a9e6e47f71
xcrun swiftc "$composer/NativeMuseChatComposerPolicy.swift" "$root/tests/contract/ios-chat-muse-composer/PolicyChecks.swift" -o "$work/policy-check"
"$work/policy-check"
sdk=$(xcrun --sdk iphonesimulator --show-sdk-path)
for variant in baseline main-dependency; do
    state="$frontend/NativeFrontendState.swift"
    if [ "$variant" = main-dependency ]; then
        git show "$dependency:ios/VisePanda/VisePanda/Features/Frontend/NativeFrontendState.swift" > "$work/NativeFrontendState.swift"
        state="$work/NativeFrontendState.swift"
    fi
    xcrun swiftc -typecheck -swift-version 6 -strict-concurrency=complete \
        -sdk "$sdk" -target arm64-apple-ios17.0-simulator -module-cache-path "$work/cache" \
        "$root/ios/VisePanda/VisePanda/Navigation/AppTab.swift" "$state" \
        "$composer/NativeMuseChatComposerPolicy.swift" "$composer/NativeMuseChatComposerView.swift"
    printf '%s\n' "PASS: iOS SDK typecheck, actual AppTab + $variant NativeFrontendState (iOS 17, Swift 6 strict concurrency)"
done
xcrun swiftc -frontend -parse "$composer/NativeMuseChatComposerPolicy.swift" "$composer/NativeMuseChatComposerView.swift"
printf '%s\n' 'PASS: Swift parse'
git diff --check
printf '%s\n' 'PASS: git diff --check'
