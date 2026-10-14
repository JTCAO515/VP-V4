#!/bin/bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
source_root=ios/VisePanda/VisePanda
sources=("$source_root/Navigation/AppTab.swift" "$source_root/Features/Frontend/NativeFrontendState.swift")
sidebar="$source_root/Features/Frontend/ChatSidebar/NativeMuseChatSidebarView.swift"
xcrun swiftc -parse "$sidebar"
xcrun swiftc -typecheck -swift-version 6 -sdk "$(xcrun --sdk iphonesimulator --show-sdk-path)" -target arm64-apple-ios17.0-simulator "${sources[@]}" "$sidebar"
contract_binary=$(mktemp /tmp/ios-chat-sidebar-contract.XXXXXX)
trap 'rm -f "$contract_binary"' EXIT
xcrun swiftc -swift-version 6 -target arm64-apple-macos14.0 "${sources[@]}" tests/contract/ios-chat-muse-sidebar/LocalConversationChecks.swift -o "$contract_binary"
"$contract_binary"
git diff --check
