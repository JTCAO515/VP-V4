import XCTest
@testable import VisePanda

final class NativeEntryResumeTests: XCTestCase {
    func testOpaqueLinksAndConfiguredDomainsOnly() {
        let id = UUID().uuidString.lowercased()
        guard case .entry = NativeEntryResumeLink.parse(URL(string: "visepanda://resume/\(id)")!, associatedHosts: []) else { return XCTFail("valid pointer") }
        for link in ["visepanda://resume/\(id)?owner=x", "visepanda://resume/\(id)#data", "visepanda://u@resume/\(id)", "visepanda://resume/\(id)/", "https://unconfigured.example/resume/\(id)"] {
            XCTAssertEqual(NativeEntryResumeLink.parse(URL(string: link)!, associatedHosts: []), .unavailable)
        }
        XCTAssertEqual(NativeEntryResumeLink.parse(URL(string: "visepanda://trip")!, associatedHosts: []), .unrelated)
        XCTAssertEqual(NativeEntryResumeLink.configuredHosts("good.example,*.bad.example,host/path,user@host"), ["good.example"])
    }
    func testLoginCannotRetargetBoundMaterialOrExtendTTL() {
        let now = Date(timeIntervalSince1970: 1_000)
        let a = NativeEntryResumeState.Identity(endpoint: "http://localhost", owner: "A", epoch: 1, generation: 1)
        let b = NativeEntryResumeState.Identity(endpoint: "http://localhost", owner: "B", epoch: 1, generation: 1)
        let id = UUID()
        var state = NativeEntryResumeState()
        state.receive(id, identity: nil, now: now)
        state.authenticate(a, now: now)
        XCTAssertTrue(state.bind(a, entryExpiry: now.addingTimeInterval(30), now: now))
        XCTAssertEqual(state.current(a, now: now)?.entryID, id)
        XCTAssertTrue(state.bind(a, entryExpiry: now.addingTimeInterval(100), now: now))
        XCTAssertEqual(state.intent?.expiresAt, now.addingTimeInterval(30))
        state.authenticate(b, now: now)
        XCTAssertNil(state.intent)
        XCTAssertEqual(state.failure, .accountChanged)
    }
    func testExpiryAndCleanupFencePreventReplay() {
        let now = Date(timeIntervalSince1970: 1_000)
        let a = NativeEntryResumeState.Identity(endpoint: "http://localhost", owner: "A", epoch: 1, generation: 1)
        var state = NativeEntryResumeState()
        state.receive(UUID(), identity: a, now: now)
        state.authenticate(a, now: now.addingTimeInterval(901))
        XCTAssertEqual(state.failure, .expired)
        state.clear(cleanupSucceeded: false)
        state.receive(UUID(), identity: a, now: now)
        XCTAssertNil(state.intent)
        XCTAssertEqual(state.failure, .cleanupRequired)
    }
}
