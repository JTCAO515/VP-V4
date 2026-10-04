// swift-tools-version: 6.4
import PackageDescription
let settings:[SwiftSetting] = [.defaultIsolation(MainActor.self), .enableUpcomingFeature("NonisolatedNonsendingByDefault")]
let package = Package(name: "RecoverySourceChecks", platforms: [.macOS(.v14)], products: [], targets: [.target(name:"VisePanda",swiftSettings:settings), .testTarget(name:"VisePandaTests", dependencies:["VisePanda"],swiftSettings:settings)], swiftLanguageModes:[.v6])
