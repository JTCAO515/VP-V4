#!/bin/sh
set -eu
root=$(git rev-parse --show-toplevel)
work=$(mktemp -d /tmp/ios-assistant-check.XXXXXX)
trap 'rm -rf "$work"' EXIT
source_dir="$root/ios/VisePanda/VisePanda/Features/Frontend"
python3 "$root/tests/contract/ios-frontend-assistant/locale-source-check.py"
xcrun swiftc "$source_dir/Assistant/NativeFrontendAssistantPresentation.swift" "$root/tests/contract/ios-frontend-assistant/AssistantPresentationChecks.swift" -o "$work/check"
"$work/check"
xcrun swiftc -typecheck -swift-version 6 -sdk "$(xcrun --sdk iphonesimulator --show-sdk-path)" -target arm64-apple-ios17.0-simulator -module-cache-path "$work/cache" "$root/ios/VisePanda/VisePanda/Navigation/AppTab.swift" "$source_dir/NativeFrontendState.swift" "$source_dir/Assistant/NativeFrontendAssistantPresentation.swift" "$source_dir/Assistant/NativeFrontendAssistantDetail.swift"
printf '%s\n' 'PASS: iOS Simulator SDK typecheck with actual shared frontend state and AppTab'
