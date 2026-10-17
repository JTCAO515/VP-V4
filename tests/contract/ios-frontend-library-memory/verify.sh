#!/bin/bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
source_root=ios/VisePanda/VisePanda
sources=("$source_root/Navigation/AppTab.swift" "$source_root/Features/Frontend/NativeFrontendState.swift")
feature_sources=("$source_root"/Features/Frontend/LibraryMemory/*.swift)
xcrun swiftc -parse "${feature_sources[@]}"
xcrun swiftc -typecheck -swift-version 6 -sdk "$(xcrun --sdk iphonesimulator --show-sdk-path)" -target arm64-apple-ios17.0-simulator "${sources[@]}" "${feature_sources[@]}"
contract_binary=$(mktemp /tmp/ios-library-memory-contract.XXXXXX)
trap 'rm -f "$contract_binary"' EXIT
xcrun swiftc -swift-version 6 -target arm64-apple-macos14.0 "${sources[@]}" "$source_root/Features/Frontend/LibraryMemory/NativeFrontendLibraryActions.swift" tests/contract/ios-frontend-library-memory/StateContract.swift -o "$contract_binary"
"$contract_binary"
git diff --check
