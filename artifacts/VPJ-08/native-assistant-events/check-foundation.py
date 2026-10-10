from pathlib import Path
import shutil, subprocess, tempfile, sys

repo = Path(__file__).resolve().parents[3]
with tempfile.TemporaryDirectory(prefix="vpj08-native-events-") as directory:
    root = Path(directory)
    source = root / "Sources/VisePanda"
    tests = root / "Tests/VisePandaTests"
    source.mkdir(parents=True)
    tests.mkdir(parents=True)
    (root / "Package.swift").write_text('''// swift-tools-version: 6.0
import PackageDescription
let package = Package(name: "AssistantEventsChecks", platforms: [.macOS(.v14)], targets: [.target(name: "VisePanda"), .testTarget(name: "VisePandaTests", dependencies: ["VisePanda"])], swiftLanguageModes: [.v5])
''')
    for file in (repo / "ios/VisePanda/VisePanda/Features/AssistantEvents").glob("*.swift"):
        shutil.copy(file, source / file.name)
    shutil.copy(Path(__file__).with_name("compile-support.swift"), source / "CompileSupport.swift")
    shutil.copy(repo / "ios/VisePanda/VisePandaTests/NativeAssistantEventsTests.swift", tests / "NativeAssistantEventsTests.swift")
    result = subprocess.run(["swift", "test", "--package-path", str(root), *sys.argv[1:]])
    raise SystemExit(result.returncode)
