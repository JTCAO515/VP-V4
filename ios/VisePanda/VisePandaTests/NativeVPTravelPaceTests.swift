import XCTest
import Security
import SwiftUI
import UIKit
@testable import VisePanda

@MainActor private final class VPPaceMemoryVault: NativeCredentialVault {
    var bytes: Data?
    func write(_ data: Data, service: String, owner: String) -> OSStatus { bytes = data; return errSecSuccess }
    func read(service: String, owner: String) -> (OSStatus, Data?) { bytes == nil ? (errSecItemNotFound, nil) : (errSecSuccess, bytes) }
    func remove(service: String, owner: String) -> OSStatus { bytes = nil; return errSecSuccess }
}
nonisolated final class NativeVPTravelPaceTests: XCTestCase {
    @MainActor func testActualVPCurrentPaceLongTermSaveUndoPauseAndWithdrawStaySeparate() async throws {
        let env = ProcessInfo.processInfo.environment
        guard env["VP_NATIVE_VP_PACE"] == "1" else { throw XCTSkip("UNRUN: explicit owned local VP pace Auth fixture required") }
        let api = try XCTUnwrap(env["VP_NATIVE_VP_PACE_API"]), conversation = try XCTUnwrap(env["VP_NATIVE_VP_PACE_CONVERSATION"])
        let goal = try XCTUnwrap(env["VP_NATIVE_VP_PACE_GOAL"]), policy = try XCTUnwrap(env["VP_NATIVE_VP_PACE_POLICY"]), trip = try XCTUnwrap(env["VP_NATIVE_VP_PACE_TRIP"])
        guard URL(string: api)?.host == "127.0.0.1", URL(string: api)?.port == 63251 else { throw NativeDataError.invalidResponse }
        let session = NativeSession(arguments: ["-VisePandaNativeAPI", api, "-VisePandaAssistantConversation"], defaults: try XCTUnwrap(UserDefaults(suiteName: "vp-pace-test-"+UUID().uuidString)), bundleConfiguration: [:], vault: VPPaceMemoryVault())
        await session.login(email: try XCTUnwrap(env["VP_NATIVE_VP_PACE_EMAIL"]), password: "VPJ07-Local-Synthetic-Only-195!")
        let scope = try XCTUnwrap(session.dataScope)
        func selection() async throws -> NativeTravelIntakeSelection {
            let b = try NativeTravelIntakeBasis.decode(await session.travelIntakeRequest(conversationID: conversation, goalID: goal))
            return .init(scope: scope, conversationID: conversation, goalID: goal, goalVersion: b.goalVersion, parentMessageID: b.messageId, policyID: policy)
        }
        var selected = try await selection(); let store = NativeVPTravelPaceStore()
        await store.load(using: session, selected: { selected })
        XCTAssertEqual(store.saved.snapshot?.state, "unset"); XCTAssertEqual(store.currentExplicitPace, .balanced)
        let original = try XCTUnwrap(store.current.basis?.intake)
        store.choice = .relaxed; var accepted = false
        store.applyThisTime(using: session, chinese: false, selected: { selected }, accepted: { accepted = true })
        while store.current.state == .submitting { await Task.yield() }
        XCTAssertTrue(accepted); XCTAssertEqual(store.current.basis?.intake.pace, "relaxed")
        XCTAssertEqual(store.current.basis?.intake.city, original.city); XCTAssertEqual(store.current.basis?.intake.interests, original.interests)
        XCTAssertEqual(store.current.basis?.intake.mobilityConstraints, original.mobilityConstraints); XCTAssertEqual(store.saved.snapshot?.revision, 0)
        selected = try await selection(); await store.load(using: session, selected: { selected })
        store.choice = .packed; store.consent = true; await store.saveLongTerm(using: session)
        XCTAssertEqual(store.saved.snapshot?.state, "explicit"); XCTAssertEqual(store.saved.snapshot?.travelPace, .packed)
        XCTAssertFalse(store.saveReadbackChanged); XCTAssertNotNil(store.saved.toast); XCTAssertEqual(store.currentExplicitPace, .relaxed)
        let saved = try XCTUnwrap(store.saved.snapshot); await store.previewSavedForTrip(trip, using: session)
        XCTAssertEqual(store.localProjection?.source, "profile"); XCTAssertEqual(store.localProjection?.travelPace, .packed)
        XCTAssertEqual(store.localProjection?.sourceRevision, saved.revision); XCTAssertEqual(store.localProjection?.sourceOperationId, saved.operationId)
        await store.changeSaved("undo", using: session)
        XCTAssertEqual(store.saved.snapshot?.state, "unset"); XCTAssertNil(store.saved.toast); XCTAssertEqual(store.savedNotice, "undone")
        XCTAssertNil(store.localProjection); XCTAssertEqual(store.currentExplicitPace, .relaxed)
        store.choice = .relaxed; await store.saveLongTerm(using: session)
        await store.changeSaved("pause", using: session); XCTAssertEqual(store.saved.snapshot?.state, "paused"); XCTAssertNil(store.localProjection)
        await store.changeSaved("revoke", using: session); XCTAssertEqual(store.saved.snapshot?.state, "revoked"); XCTAssertNil(store.saved.snapshot?.travelPace)
        XCTAssertEqual(store.currentExplicitPace, .relaxed)
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.first as? UIWindowScene)
        let previous = scene.windows.first(where: { $0.isKeyWindow }); let window = UIWindow(windowScene: scene)
        let host = UIHostingController(rootView: NativeVPTravelPaceView(session: session, chinese: false, active: true, selection: selected,
            currentSelection: { selected }, accepted: {}, linkedTripID: trip, onPendingChange: { _, _ in }, artifactID: nil, artifactRevision: nil))
        window.rootViewController = host; window.makeKeyAndVisible()
        for _ in 0..<8 { host.view.layoutIfNeeded(); try await Task.sleep(for: .milliseconds(50)) }
        let picture = UIGraphicsImageRenderer(bounds: window.bounds).image { _ in window.drawHierarchy(in: window.bounds, afterScreenUpdates: true) }
        let capture = XCTAttachment(image: picture); capture.name = "LOCAL-AUTH-rendered-VP-current-vs-revoked-pace"; capture.lifetime = .keepAlways; add(capture)
        window.isHidden = true; previous?.makeKeyAndVisible()
        store.bind(scope: nil, selection: nil); XCTAssertNil(store.saved.snapshot); XCTAssertNil(store.saved.toast); XCTAssertNil(store.current.basis)
    }
}
