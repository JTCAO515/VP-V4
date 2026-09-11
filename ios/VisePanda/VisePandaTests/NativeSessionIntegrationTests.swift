import XCTest
@testable import VisePanda

nonisolated final class NativeSessionIntegrationTests: XCTestCase {
    @MainActor
    func testStagingEndpointIsBuildBoundAndRejectsFallbackOrCredentialDestinations() {
        let host = "vp-v4-syntheticonly-jtcao515s-projects.vercel.app"
        let configured = ["VisePandaNativeEnvironment": "staging", "VisePandaStagingAPIOrigin": "https://" + host]
        let args = ["-VisePandaNativeAPI", "http://127.0.0.1:59731"]
        XCTAssertEqual(NativeSession.resolveEndpoint(arguments: args, bundleConfiguration: configured)?.absoluteString, "https://" + host)
        XCTAssertNil(NativeSession.resolveEndpoint(arguments: ["-VisePandaNativeAPI", "https://" + host], bundleConfiguration: [:]))
        for raw in ["http://" + host, "https://user:secret@" + host, "https://" + host + ":443", "https://" + host + "/path", "https://" + host + "?q=1", "https://" + host + "#fragment", "https://" + host + ".attacker.test", "https://vp-v4.vercel.app"] {
            var invalid = configured
            invalid["VisePandaStagingAPIOrigin"] = raw
            XCTAssertNil(NativeSession.resolveEndpoint(arguments: args, bundleConfiguration: invalid), raw)
        }
        XCTAssertNil(NativeSession.resolveEndpoint(arguments: args, bundleConfiguration: ["VisePandaNativeEnvironment": "staging"]))
        XCTAssertNil(NativeSession.resolveEndpoint(arguments: args, bundleConfiguration: ["VisePandaNativeEnvironment": "production", "VisePandaStagingAPIOrigin": "https://" + host]))
        XCTAssertNotNil(NativeSession.resolveEndpoint(arguments: args, bundleConfiguration: [:]))
    }

    @MainActor
    func testLocalLoginProfileRefreshReplacementLogoutAndAccountIsolation() async throws {
        guard ProcessInfo.processInfo.environment["VP_NATIVE_LOCAL_UI"] == "1" else {
            throw XCTSkip("UNRUN: explicit disposable local identity environment is not configured")
        }
        let email = try XCTUnwrap(ProcessInfo.processInfo.environment["VP_NATIVE_LOCAL_EMAIL"])
        let otherEmail = try XCTUnwrap(ProcessInfo.processInfo.environment["VP_NATIVE_LOCAL_OTHER_EMAIL"])
        let password = "VPJ04-Local-Synthetic-Only-191!"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "vpj04.native.integration.\(UUID().uuidString)"))
        let args = ["-VisePandaNativeAPI", "http://127.0.0.1:59731"]
        let phone = NativeSession(arguments: args, defaults: defaults)
        XCTAssertTrue(phone.enabled)
        await phone.login(email: email, password: password)
        XCTAssertEqual(phone.status, "active", phone.failureCode ?? "none")
        XCTAssertEqual(phone.displayName, "Local Phone Owner A")
        let owner = try XCTUnwrap(phone.subject)
        let epoch = try XCTUnwrap(phone.mobileEpoch)
        await phone.validate()
        XCTAssertEqual(phone.subject, owner)
        XCTAssertEqual(phone.mobileEpoch, epoch)
        // A new coordinator restores the real device Keychain then validates with the local API.
        let restored = NativeSession(arguments: args, defaults: defaults)
        await restored.restore()
        XCTAssertEqual(restored.subject, owner)
        XCTAssertEqual(restored.displayName, "Local Phone Owner A")
        await restored.logout()
        XCTAssertNil(restored.subject)
        await phone.validate()
        XCTAssertEqual(phone.status, "expiredOrReplaced")
        XCTAssertNil(phone.displayName)
        // An explicit account switch must load only the new owner's RLS profile.
        await phone.login(email: otherEmail, password: password)
        XCTAssertEqual(phone.status, "active", phone.failureCode ?? "none")
        XCTAssertNotEqual(phone.subject, owner)
        XCTAssertEqual(phone.displayName, "Local Phone Owner B")
        await phone.logout()
        XCTAssertNil(phone.subject)
        XCTAssertNil(phone.displayName)
    }

    @MainActor
    func testRedirectsNeverForwardCredentialsAndRefreshCanRecover() async throws {
        guard let raw = ProcessInfo.processInfo.environment["VP_NATIVE_REDIRECT_PROBE_URL"],
              let probe = URL(string: raw), probe.host == "127.0.0.1" else {
            throw XCTSkip("UNRUN: controlled loopback redirect probe is not configured")
        }
        struct Counts: Decodable { let secondHops: Int; let redirects: Int }
        for code in [307, 308] {
            func control(_ mode: String) async throws {
                let url = probe.appendingPathComponent("control").appending(queryItems: [URLQueryItem(name: "mode", value: mode), URLQueryItem(name: "code", value: String(code))])
                _ = try await URLSession.shared.data(from: url)
            }
            let defaults = try XCTUnwrap(UserDefaults(suiteName: "vpj04.redirect.\(UUID().uuidString)"))
            let phone = NativeSession(arguments: ["-VisePandaNativeAPI", raw], defaults: defaults)
            try await control("credentials")
            await phone.login(email: "synthetic@example.test", password: "synthetic-redirect-only")
            XCTAssertEqual(phone.status, "retry")
            XCTAssertEqual(phone.failureCode, "http:\(code)")
            XCTAssertNil(phone.subject)
            try await control("normal")
            await phone.login(email: "synthetic@example.test", password: "synthetic-redirect-only")
            XCTAssertEqual(phone.status, "active")
            let owner = try XCTUnwrap(phone.subject)
            try await control("refresh")
            await phone.validate()
            XCTAssertEqual(phone.status, "retry")
            XCTAssertEqual(phone.failureCode, "http:\(code)")
            XCTAssertNil(phone.displayName)
            try await control("normal")
            await phone.validate()
            XCTAssertEqual(phone.status, "active", "The blocked refresh must retain a recoverable credential")
            XCTAssertEqual(phone.subject, owner)
            let (data, _) = try await URLSession.shared.data(from: probe.appendingPathComponent("counts"))
            let counts = try JSONDecoder().decode(Counts.self, from: data)
            XCTAssertEqual(counts.secondHops, 0, "No second request may forward a password, token or body")
            XCTAssertEqual(counts.redirects, code == 307 ? 2 : 4, "Exercise actual URLSession redirect callbacks")
            await phone.logout()
        }
    }

    @MainActor
    func testRemoteAndMissingConfigurationRemainUnavailable() {
        XCTAssertFalse(NativeSession(arguments: []).enabled)
        XCTAssertFalse(NativeSession(arguments: ["-VisePandaNativeAPI", "https://example.com"]).enabled)
    }
}
