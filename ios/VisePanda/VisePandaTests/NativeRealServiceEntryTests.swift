import XCTest
@testable import VisePanda

nonisolated final class NativeRealServiceEntryTests: XCTestCase {
    private static func installed(_ origin: String, environment: String = "staging") -> [String: String] {
        ["VisePandaNativeEnvironment": environment, "VisePandaStagingAPIOrigin": origin]
    }

    @MainActor
    func testExactQAOriginRequiresInstalledConfiguration() {
        for origin in ["https://qatesting.go2china.space", "https://qatesting.go2china.space/"] {
            XCTAssertEqual(
                NativeSession.resolveEndpoint(arguments: [], bundleConfiguration: Self.installed(origin))?.absoluteString,
                "https://qatesting.go2china.space", origin
            )
        }
    }

    @MainActor
    func testQARejectsChangedAuthorityOrURLComponents() {
        for origin in [
            "http://qatesting.go2china.space",
            "https://qatesting.go2china.space.attacker.test",
            "https://other.go2china.space",
            "https://user@qatesting.go2china.space",
            "https://user:placeholder@qatesting.go2china.space",
            "https://qatesting.go2china.space/path",
            "https://qatesting.go2china.space?query=1",
            "https://qatesting.go2china.space#fragment",
            "https://qatesting.go2china.space:443"
        ] {
            XCTAssertNil(NativeSession.resolveEndpoint(arguments: [], bundleConfiguration: Self.installed(origin)), origin)
        }
    }

    @MainActor
    func testQARejectsMissingOrNonstagingEnvironment() {
        let origin = "https://qatesting.go2china.space"
        XCTAssertNil(NativeSession.resolveEndpoint(arguments: [], bundleConfiguration: ["VisePandaStagingAPIOrigin": origin]))
        for environment in ["", "production", "qa"] {
            XCTAssertNil(NativeSession.resolveEndpoint(arguments: [], bundleConfiguration: Self.installed(origin, environment: environment)), environment)
        }
    }

    @MainActor
    func testRemoteLaunchArgumentCannotSupplyOrOverrideInstalledEndpoint() {
        let remoteArguments = ["-VisePandaNativeAPI", "https://qatesting.go2china.space"]
        XCTAssertNil(NativeSession.resolveEndpoint(arguments: remoteArguments, bundleConfiguration: [:]))
        XCTAssertEqual(
            NativeSession.resolveEndpoint(arguments: remoteArguments, bundleConfiguration: Self.installed("https://staging.go2china.space"))?.absoluteString,
            "https://staging.go2china.space"
        )
    }

    @MainActor
    func testIncompleteOrInvalidInstalledConfigurationCannotFallBackToLoopback() {
        let loopbackArguments = ["-VisePandaNativeAPI", "http://127.0.0.1:3999"]
        XCTAssertNil(NativeSession.resolveEndpoint(arguments: loopbackArguments, bundleConfiguration: ["VisePandaNativeEnvironment": "staging"]))
        XCTAssertNil(NativeSession.resolveEndpoint(arguments: loopbackArguments, bundleConfiguration: Self.installed("https://qatesting.go2china.space.attacker.test")))
    }

    @MainActor
    func testExistingStagingAndExactPreviewOriginsRemainAccepted() {
        for origin in ["https://staging.go2china.space", "https://vp-v4-abc123-jtcao515s-projects.vercel.app"] {
            XCTAssertEqual(NativeSession.resolveEndpoint(arguments: [], bundleConfiguration: Self.installed(origin))?.absoluteString, origin)
        }
        XCTAssertNil(NativeSession.resolveEndpoint(arguments: [], bundleConfiguration: Self.installed("https://vp-v4-abc123-jtcao515s-projects.vercel.app.attacker.test")))
    }

    @MainActor
    func testExistingLoopbackLaunchOriginsRemainAcceptedWithoutInstalledEnvironment() {
        for origin in ["http://localhost:3999", "http://127.0.0.1:3999"] {
            XCTAssertEqual(NativeSession.resolveEndpoint(arguments: ["-VisePandaNativeAPI", origin], bundleConfiguration: [:])?.absoluteString, origin)
        }
    }

    @MainActor
    func testLaunchOriginStillRejectsRemoteOrDecoratedLoopbackDestinations() {
        for origin in [
            "http://qatesting.go2china.space",
            "http://127.0.0.1.attacker.test:3999",
            "http://user@localhost:3999",
            "http://localhost:3999/path",
            "http://localhost:3999?query=1",
            "http://localhost:3999#fragment"
        ] {
            XCTAssertNil(NativeSession.resolveEndpoint(arguments: ["-VisePandaNativeAPI", origin], bundleConfiguration: [:]), origin)
        }
    }
}
