#!/bin/zsh
set -eu
artifact_dir="${0:A:h}"
repo_dir="$(git -C "$artifact_dir" rev-parse --show-toplevel)"
python3 - "$repo_dir" "$artifact_dir" <<'PY'
from pathlib import Path
import sys
repo, artifact = map(Path, sys.argv[1:])
session = (repo/'ios/VisePanda/VisePanda/App/NativeSession.swift').read_text()
scope = session[session.index('struct NativeDataScope:'):session.index('\nenum NativeDataError:')]
protocol = session[session.index('@MainActor\nprotocol NativeCredentialVault'):session.index('\nstruct NativeKeychainVault:')]
support = (artifact/'CompileSupport.swift').read_text()
assert scope in support and protocol in support, 'Standalone boundaries drifted; verify original declarations before rerunning'
root = artifact/'Harness'
(root/'Sources/VisePanda').mkdir(parents=True, exist_ok=True)
(root/'Tests/VisePandaTests').mkdir(parents=True, exist_ok=True)
(root/'Package.swift').write_text('''// swift-tools-version: 6.0
import PackageDescription
let isolation: [SwiftSetting] = [.unsafeFlags(["-default-isolation", "MainActor"])]
let package = Package(name: "RecoveryHarness", platforms: [.macOS(.v14)], targets: [
    .target(name: "VisePanda", swiftSettings: isolation),
    .testTarget(name: "VisePandaTests", dependencies: ["VisePanda"], swiftSettings: isolation)
])
''')
files = list((repo/'ios/VisePanda/VisePanda/Features/Translation').glob('NativeTranslationRecovery*.swift'))
for source in files + [artifact/'CompileSupport.swift']:
    target = root/'Sources/VisePanda'/source.name
    if target.is_symlink(): target.unlink()
    assert not target.exists(), 'Refusing to overwrite a non-symlink harness source'
    target.symlink_to(source)
source = repo/'ios/VisePanda/VisePandaTests/NativeTranslationRecoveryJournalTests.swift'
target = root/'Tests/VisePandaTests'/source.name
if target.is_symlink(): target.unlink()
assert not target.exists(), 'Refusing to overwrite a non-symlink harness test'
target.symlink_to(source)
PY
swift test --package-path "$artifact_dir/Harness"
