#!/bin/sh
set -eu
# Per-process toolchain only. Local macOS probe; never uses the shared simulator.
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
probe_dir=$(mktemp -d)
trap 'rm -rf "$probe_dir"' EXIT
bundle="$probe_dir/MonthlyDevelopmentProbe.app"
mkdir -p "$bundle/Contents/MacOS"
cat > "$bundle/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>dev.visepanda.subscription-configuration-probe</string>
<key>CFBundleExecutable</key><string>monthly-probe</string>
<key>CFBundlePackageType</key><string>APPL</string>
</dict></plist>
PLIST
frameworks="$DEVELOPER_DIR/Platforms/MacOSX.platform/Developer/Library/Frameworks"
xcrun swiftc -parse-as-library -F "$frameworks" -Xlinker -rpath -Xlinker "$frameworks" \
  tests/contract/subscription-development/storekit-probe.swift -o "$bundle/Contents/MacOS/monthly-probe"
cat > "$probe_dir/entitlements.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>com.apple.security.get-task-allow</key><true/></dict></plist>
PLIST
codesign --sign - --entitlements "$probe_dir/entitlements.plist" "$bundle"
# Xcode 27 soft-links XCTest at session creation; scope its lookup to this process.
DYLD_FRAMEWORK_PATH="$frameworks" "$bundle/Contents/MacOS/monthly-probe" docs/commercial/subscription-development/monthly.storekit
