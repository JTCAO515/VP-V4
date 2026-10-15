#!/bin/sh
set -eu
root=$(git rev-parse --show-toplevel)
work=$(mktemp -d /tmp/ios-chat-composer-locale.XXXXXX)
trap 'rm -rf "$work"' EXIT
composer="$root/ios/VisePanda/VisePanda/Features/Frontend/ChatComposer"
tests="$root/tests/contract/ios-chat-muse-composer"
for check in PolicyChecks LocaleChecks; do
    xcrun swiftc "$composer/NativeMuseChatComposerPolicy.swift" "$tests/$check.swift" -o "$work/$check"
    "$work/$check"
done
xcrun swiftc -typecheck -swift-version 6 -strict-concurrency=complete \
    -sdk "$(xcrun --sdk iphonesimulator --show-sdk-path)" -target arm64-apple-ios17.0-simulator \
    -module-cache-path "$work/cache" "$composer/NativeMuseChatComposerPolicy.swift"
printf '%s\n' 'PASS: actual iOS SDK typecheck for locale/policy source (iOS 17, Swift 6 strict concurrency)'
xcrun swiftc -frontend -parse "$composer/NativeMuseChatComposerPolicy.swift" "$composer/NativeMuseChatComposerView.swift"
printf '%s\n' 'PASS: Swift parse for composer view and locale/policy source'
python3 "$tests/locale-source-check.py"
git diff --check
printf '%s\n' 'PASS: git diff --check'
