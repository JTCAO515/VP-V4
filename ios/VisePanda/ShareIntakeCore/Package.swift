// swift-tools-version: 6.0
import PackageDescription

// Owned synthetic-container tests; no app capability, signing, Simulator, or external dependency.
let package = Package(
    name: "ShareIntakeCore",
    platforms: [.macOS(.v14)],
    products: [.library(name: "ShareIntakeCore", targets: ["ShareIntakeCore"])],
    targets: [
        .target(name: "ShareIntakeCore", path: ".", exclude: ["Tests", "WIRE.md"]),
        .testTarget(name: "ShareIntakeCoreTests", dependencies: ["ShareIntakeCore"], path: "Tests")
    ]
)
