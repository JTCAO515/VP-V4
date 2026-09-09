import XCTest
@testable import VisePanda

nonisolated final class NativeSessionIntegrationTests: XCTestCase {
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
    func testRemoteAndMissingConfigurationRemainUnavailable() {
        XCTAssertFalse(NativeSession(arguments: []).enabled)
        XCTAssertFalse(NativeSession(arguments: ["-VisePandaNativeAPI", "https://example.com"]).enabled)
    }
}
