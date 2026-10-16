import XCTest
import SwiftUI
import Observation
@testable import VisePanda

/// Actual hosted production views; every service response is synthetic and stays in memory.
nonisolated final class NativeQAIntegrationTests: XCTestCase {
    @MainActor func testServiceComposerKeyboardAndObservableRevocationInBothLanguages() async throws {
        for chinese in [false, true] {
            let port = QAIntegrationPort()
            let window = try makeWindow(NativeQAServiceView(transport: port, chinese: chinese)
                .dynamicTypeSize(.accessibility5))
            defer { window.isHidden = true; window.rootViewController = nil }
            try await settle()
            XCTAssertGreaterThan(port.reads, 0)
            let field = try XCTUnwrap(descendants(window).first { $0 is UITextField || $0 is UITextView })
            XCTAssertGreaterThan(field.bounds.height, 0)
            capture(window, name: "service-\(chinese ? "zh" : "en")-max")
            if let scroll = descendants(window).compactMap({ $0 as? UIScrollView }).first(where: { $0.contentSize.height > $0.bounds.height }) {
                XCTAssertLessThanOrEqual(scroll.contentSize.width, scroll.bounds.width + 1)
                scroll.setContentOffset(CGPoint(x: 0, y: max(0, scroll.contentSize.height - scroll.bounds.height)), animated: false)
                try await settle()
                capture(window, name: "messages-\(chinese ? "zh" : "en")-max")
            } else { XCTFail("Long maximum-type content needs a vertical reading surface") }
            XCTAssertTrue(field.becomeFirstResponder())
            try await settle()
            XCTAssertTrue(field.isFirstResponder)
            capture(window, name: "keyboard-\(chinese ? "zh" : "en")-max")
            port.scope = nil
            try await settle()
            XCTAssertFalse(descendants(window).contains { $0 is UITextField || $0 is UITextView },
                           "Observable scope revocation removes the composer without polling")
            capture(window, name: "revoked-\(chinese ? "zh" : "en")-max")
            XCTAssertEqual(port.posts, 0)
        }
    }

    @MainActor func testHistoryObservableRevocationInBothLanguages() async throws {
        for chinese in [false, true] {
            let port = QAIntegrationPort()
            let store = NativeQAStore(transport: port)
            await store.activate(true)
            let expected = try XCTUnwrap(port.scope)
            let source = NativeQAHistorySource(currentScope: { store.hasReadableProjection ? store.scope : nil },
                expectedScope: { expected }, read: {
                    guard store.hasReadableProjection, let scope = store.scope else { return nil }
                    return .init(scope: scope, sessions: store.sessions, selectedID: store.selectedID,
                                 isLoading: store.busy, canSelect: true, canCreate: true)
                }, onSelect: { _ in XCTFail("No synthetic selection requested") }, onCreate: { XCTFail("No creation requested") })
            let window = try makeWindow(NavigationStack { NativeQAHistoryView(source: source, chinese: chinese) }
                .dynamicTypeSize(.accessibility5))
            defer { window.isHidden = true; window.rootViewController = nil }
            try await settle()
            XCTAssertTrue(descendants(window).contains { $0 is UITextField || $0 is UITextView })
            capture(window, name: "history-\(chinese ? "zh" : "en")-max")
            port.scope = nil
            try await settle()
            XCTAssertFalse(descendants(window).contains { $0 is UITextField || $0 is UITextView },
                           "Observable scope revocation tears down the private search subtree")
            capture(window, name: "history-revoked-\(chinese ? "zh" : "en")-max")
            XCTAssertNil(source.readable())
            XCTAssertEqual(port.posts, 0)
        }
    }

    @MainActor private func makeWindow<V: View>(_ root: V) throws -> UIWindow {
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = scene.coordinateSpace.bounds
        window.windowLevel = .alert + 1
        window.rootViewController = UIHostingController(rootView: root.environment(\.scenePhase, .active))
        window.makeKeyAndVisible()
        return window
    }
    @MainActor private func settle() async throws { try await Task.sleep(for: .milliseconds(450)) }
    @MainActor private func descendants(_ view: UIView) -> [UIView] { [view] + view.subviews.flatMap(descendants) }
    @MainActor private func capture(_ window: UIWindow, name: String) {
        window.layoutIfNeeded()
        let image = UIGraphicsImageRenderer(bounds: window.bounds).image { _ in
            window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
        }
        let attachment = XCTAttachment(image: image)
        attachment.name = "qa-integration-" + name; attachment.lifetime = .keepAlways; add(attachment)
    }
}

@MainActor @Observable private final class QAIntegrationPort: NativeQATransport {
    var scope: NativeDataScope? = .init(endpoint: "https://synthetic.invalid", subject: "00000000-0000-4000-8000-000000000001", mobileEpoch: 1, generation: 0)
    let sessionID = "00000000-0000-4000-8000-000000000002"
    let policyID = "00000000-0000-4000-8000-000000000003"
    var reads = 0
    var posts = 0
    var pending: NativeQAPending?
    var requestID = ""
    init() {
        let policy = NativeQAPolicy(id: policyID, noticeHash: String(repeating: "a", count: 64),
            noticeZh: "合成服务说明", noticeEn: "Synthetic service notice", provider: "synthetic", recipient: "synthetic",
            consentState: .accepted, contextMode: "qa_session_history_v1", maxTurns: 8)
        pending = try? .init(scope: scope!, sessionID: sessionID, policy: policy, text: "Synthetic question / 合成问题")
        requestID = pending?.requestID ?? ""
    }
    func loadPending(scope: NativeDataScope) throws -> NativeQAPending? { pending }
    func retainPending(_ pending: NativeQAPending, scope: NativeDataScope) throws { XCTFail("No write authorized by this fixture") }
    func clearPending(_ pending: NativeQAPending, scope: NativeDataScope) throws { self.pending = nil }
    func request(_ request: NativeQARequest, scope: NativeDataScope) async throws -> NativeQAHTTPResponse {
        reads += 1
        let session: [String: Any] = ["id": sessionID, "label": "Synthetic session / 合成会话", "createdAt": "2026-10-16T00:00:00Z", "updatedAt": "2026-10-16T00:00:00Z"]
        let policy: [String: Any] = ["id": policyID, "noticeHash": String(repeating: "a", count: 64), "noticeZh": "合成服务说明", "noticeEn": "Synthetic service notice", "provider": "synthetic", "recipient": "synthetic", "consentState": "accepted", "contextMode": "qa_session_history_v1", "maxTurns": 8]
        let message: [String: Any] = ["requestId": requestID, "turnId": requestID, "sessionId": sessionID, "input": "Synthetic question / 合成问题", "text": "Synthetic persisted answer / 合成已保存回答", "status": "answered", "createdAt": "2026-10-16T00:00:00Z"]
        var value: [String: Any]
        switch request {
        case .policy: value = ["policy": policy]
        case .sessions: value = ["sessions": [session]]
        case .recover: value = ["message": message]
        case .history: value = ["session": session, "messages": [message], "policy": policy, "historyLimit": 20]
        default: posts += 1; throw NativeQAError.invalidResponse
        }
        value["version"] = "qa-agent/1"
        return .init(status: 200, body: try JSONSerialization.data(withJSONObject: value))
    }
}
