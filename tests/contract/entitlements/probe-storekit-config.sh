#!/bin/sh
set -eu
# Override per command; never change global xcode-select or another task's simulator.
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
probe_dir=$(mktemp -d)
trap 'rm -rf "$probe_dir"' EXIT
bundle="$probe_dir/VPJ33StoreKitProbe.app"
mkdir -p "$bundle/Contents/MacOS"
cat > "$bundle/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>dev.visepanda.vpj33-storekit-probe</string>
<key>CFBundleExecutable</key><string>vpj33-storekit-probe</string>
<key>CFBundlePackageType</key><string>APPL</string>
</dict></plist>
PLIST
frameworks="$DEVELOPER_DIR/Platforms/MacOSX.platform/Developer/Library/Frameworks"
xcrun swiftc -parse-as-library -F "$frameworks" -Xlinker -rpath -Xlinker "$frameworks" \
  tests/contract/entitlements/storekit-config-probe.swift -o "$bundle/Contents/MacOS/vpj33-storekit-probe"
cat > "$probe_dir/entitlements.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict><key>com.apple.security.get-task-allow</key><true/></dict></plist>
PLIST
codesign --sign - --entitlements "$probe_dir/entitlements.plist" "$bundle"
"$bundle/Contents/MacOS/vpj33-storekit-probe" \
  docs/commercial/journey-pass-development/reference.storekit \
  docs/commercial/journey-pass-development/alternative.storekit
