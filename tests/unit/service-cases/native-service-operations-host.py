#!/usr/bin/env python3
"""Run real service feature Swift tests on macOS. No iOS/UI/Auth/Keychain runtime claim.

The actor/error/vault declarations are extracted unchanged from NativeSession.
Tests inject an in-memory vault; NativeSession transport and logout run only in iOS CI.
"""
from pathlib import Path
import subprocess
import tempfile

repo = Path(__file__).resolve().parents[3]
with tempfile.TemporaryDirectory(prefix="vpj32-native-host-") as temp:
    root = Path(temp)
    sources = root / "Sources/VisePanda"
    tests = root / "Tests/VisePandaTests"
    sources.mkdir(parents=True)
    tests.mkdir(parents=True)
    (root / "Package.swift").write_text('''// swift-tools-version: 6.0
import PackageDescription
let package = Package(name: "VisePanda", platforms: [.macOS(.v14)], products: [.library(name: "VisePanda", targets: ["VisePanda"])], targets: [.target(name: "VisePanda"), .testTarget(name: "VisePandaTests", dependencies: ["VisePanda"])], swiftLanguageModes: [.v5])
''')
    session = (repo / "ios/VisePanda/VisePanda/App/NativeSession.swift").read_text()
    boundary = session[session.index("struct NativeDataScope:"):]
    (sources / "Boundary.swift").write_text("import Foundation\nimport Security\n" + boundary)
    feature = repo / "ios/VisePanda/VisePanda/Features/ServiceOperations"
    for source in feature.glob("*.swift"):
        if source.name == "NativeServiceOperationsView.swift":
            continue
        (sources / source.name).symlink_to(source)
    (tests / "NativeServiceOperationTests.swift").symlink_to(repo / "ios/VisePanda/VisePandaTests/NativeServiceOperationTests.swift")
    result = subprocess.run(["swift", "test", "--package-path", str(root)], check=False)
    raise SystemExit(result.returncode)
