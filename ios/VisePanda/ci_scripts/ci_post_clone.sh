#!/bin/sh
set -eu

# Xcode Cloud starts this script in ci_scripts, next to VisePanda.xcodeproj.
# Device builds link the pinned SDK and copy its AMap.bundle from .local/amap.
repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/../../.." && pwd)
cd "$repo_root"

if ! command -v node >/dev/null 2>&1; then
  brew install node
fi
node scripts/maps/install-ios-sdk.mjs

sdk_root=ios/VisePanda/.local/amap
for required in \
  "$sdk_root/MAMapKit.framework/AMap.bundle" \
  "$sdk_root/AMapFoundationKit.framework"; do
  if [ ! -e "$required" ]; then
    echo "Missing pinned AMap iOS SDK resource: $required" >&2
    exit 1
  fi
done
