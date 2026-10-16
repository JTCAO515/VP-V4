import XCTest
import SwiftUI
import Observation
import Security
@testable import VisePanda

nonisolated final class NativeQACancellationIntegrationTests: XCTestCase {
    @MainActor func testHostedUnknownStopRemainsReadOnlyAndRevocationHidesItInBothLanguages() async throws {
        for chinese in [false, true] {
            let port = HostedStopPort()
            let vault = HostedStopVault()
            let journal = NativeQACancellationJournal(vault: vault, currentScope: { port.scope })
            let target = try XCTUnwrap(port.target)
            let command = try NativeQACancellationPending(target: target)
            try journal.retainCancellation(command, scope: target.scope)
            let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
            let oldWindow = scene.windows.first(where: \.isKeyWindow)
            let window = UIWindow(windowScene: scene)
            let host = UIHostingController(rootView: AnyView(NativeQACancellationView(
                transport: port, persistence: journal, currentTarget: { port.target }, chinese: chinese)
                .environment(\.scenePhase, .active).dynamicTypeSize(.accessibility5)))
            window.frame = scene.coordinateSpace.bounds; window.windowLevel = .alert + 1
            window.rootViewController = host; window.makeKeyAndVisible()
            defer { window.isHidden = true; window.rootViewController = nil; oldWindow?.makeKeyAndVisible() }
            try await Task.sleep(for: .milliseconds(450))
            XCTAssertEqual(port.gets, 1); XCTAssertEqual(port.posts, 0)
            XCTAssertGreaterThan(host.sizeThatFits(in: CGSize(width: window.bounds.width, height: 10000)).height, 100)
            capture(window, name: "unknown-\(chinese ? "zh" : "en")-max")
            XCTAssertEqual(try journal.loadCancellation(target: target)?.command, command)
            XCTAssertNil(try journal.loadCancellation(target: target)?.receipt)
            port.scope = nil
            try await Task.sleep(for: .milliseconds(450))
            XCTAssertLessThanOrEqual(host.sizeThatFits(in: CGSize(width: window.bounds.width, height: 10000)).height,
                                     host.view.safeAreaInsets.top + host.view.safeAreaInsets.bottom + 1,
                                     "Only the host safe-area insets remain after scope revocation")
            capture(window, name: "revoked-\(chinese ? "zh" : "en")-max")
            XCTAssertEqual(port.gets, 1); XCTAssertEqual(port.posts, 0)
            // Temporary invisibility never erases immutable cancellation custody.
            XCTAssertNotNil(vault.bytes)
        }
    }
    @MainActor private func capture(_ window: UIWindow, name: String) {
        window.layoutIfNeeded()
        let image = UIGraphicsImageRenderer(bounds: window.bounds).image { _ in
            window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
        }
        let attachment = XCTAttachment(image: image)
        attachment.name = "qa-stop-" + name; attachment.lifetime = .keepAlways; add(attachment)
    }
}

@MainActor @Observable private final class HostedStopPort: NativeQATransport {
    var scope: NativeDataScope? = .init(endpoint: "https://synthetic.invalid", subject: "11111111-1111-4111-8111-111111111111", mobileEpoch: 1, generation: 1)
    var gets = 0
    var posts = 0
    var target: NativeQACancellationTarget? {
        scope.map { .init(scope: $0, sessionID: "22222222-2222-4222-8222-222222222222", requestID: "33333333-3333-4333-8333-333333333333", canRequestStop: true) }
    }
    func request(_ command: NativeQARequest, scope: NativeDataScope) async throws -> NativeQAHTTPResponse {
        guard self.scope == scope else { throw NativeQACancellationError.stale }
        switch command {
        case .readCancellation(let session, let request):
            gets += 1
            return .init(status: 200, body: try JSONSerialization.data(withJSONObject: [
                "version": "qa-cancellation/1", "sessionId": session, "requestId": request,
                "state": "not_observed", "ack": "unknown"]))
        case .requestCancellation: posts += 1; throw NativeQACancellationError.invalidResponse
        default: XCTFail("Cancellation View must not call generation transport"); throw NativeQAError.invalidResponse
        }
    }
    func loadPending(scope: NativeDataScope) throws -> NativeQAPending? { XCTFail("No generation read"); return nil }
    func retainPending(_ pending: NativeQAPending, scope: NativeDataScope) throws { XCTFail("No generation write") }
    func clearPending(_ pending: NativeQAPending, scope: NativeDataScope) throws { XCTFail("No generation acknowledgement") }
}
@MainActor private final class HostedStopVault: NativeCredentialVault {
    var bytes: Data?
    func read(service: String, owner: String) -> (OSStatus, Data?) { bytes.map { (errSecSuccess, $0) } ?? (errSecItemNotFound, nil) }
    func write(_ data: Data, service: String, owner: String) -> OSStatus { bytes = data; return errSecSuccess }
    func remove(service: String, owner: String) -> OSStatus { XCTFail("No cleanup is authorized by hiding a view"); return errSecInteractionNotAllowed }
}
