"""Offline checks of the actual Composer source; no simulator or provider IO."""
from pathlib import Path
import subprocess

evidence = Path(__file__).resolve().parent
root = evidence.parents[2]
scratch = evidence / ".scratch"
source = root / "ios/VisePanda/VisePanda/Features/RealServiceEntry/NativeQAUI/Composer"
tests = root / "ios/VisePanda/VisePandaTests/NativeQAComposerTests.swift"
for relative, actual in [
    ("Sources/VisePanda/NativeQAComposerAccess.swift", source / "NativeQAComposerAccess.swift"),
    ("Tests/VisePandaTests/NativeQAComposerTests.swift", tests),
]:
    link = scratch / relative
    link.parent.mkdir(parents=True, exist_ok=True)
    if not link.exists():
        link.symlink_to(actual)
(scratch / "Package.swift").write_text('''// swift-tools-version: 6.0
import PackageDescription
let package = Package(name: "ComposerChecks", platforms: [.macOS(.v14)], targets: [
    .target(name: "VisePanda"),
    .testTarget(name: "VisePandaTests", dependencies: ["VisePanda"])
])
''')
with (evidence / "p2-replay.log").open("w") as log:
    subprocess.run(["swift", "test", "--package-path", str(scratch)], stdout=log, stderr=subprocess.STDOUT, check=True)
sdk = subprocess.check_output(["xcrun", "--sdk", "iphonesimulator", "--show-sdk-path"], text=True).strip()
with (evidence / "p2-ios17-replay.log").open("w") as log:
    subprocess.run([
        "xcrun", "swiftc", "-typecheck", "-swift-version", "6",
        "-target", "arm64-apple-ios17.0-simulator", "-sdk", sdk,
        str(root / "ios/VisePanda/VisePanda/DesignSystem/VisePandaTheme.swift"),
        str(source / "NativeQAComposerAccess.swift"), str(source / "NativeQAComposer.swift"),
        str(evidence / "CompletionCallsite.swift"),
    ], stdout=log, stderr=subprocess.STDOUT, check=True)
print("PASS: synthetic binding/action tests and actual iOS17 Swift6 source + completion callsite typecheck")
