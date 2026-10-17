#if NATIVE_QA_ACCEPTANCE
import Foundation
import CryptoKit
import Observation

/// Opt-in test-build observer. No secret, text body, credential, network or persistence access.
/// It records original command digests at the existing scoped transport seam, before IO.
@MainActor @Observable
final class NativeQAAcceptanceObservation {
    struct Snapshot: Encodable {
        let schema = "nativeqa-app-observation/1"
        let phase = "PREPARED_NOT_SUBMITTED"
        let runID: String
        let endpoint: String
        let subject: String
        let mobileEpoch: Int
        let presentationGeneration: Int
        let sessionID: String
        let requestID: String
        let policyID: String
        let noticeHash: String
        let originalBodySHA256: String
        let inputUTF8SHA256: String
    }
    private let runID: String?
    private(set) var snapshot: Snapshot?
    init(runID: String? = ProcessInfo.processInfo.environment["VP_NATIVE_QA_ACCEPTANCE_RUN_ID"]) {
        self.runID = runID.flatMap { UUID(uuidString: $0) != nil ? $0 : nil }
    }
    var enabled: Bool { runID != nil }
    func record(_ request: NativeQARequest, scope: NativeDataScope) {
        guard let runID, case .submit(let command) = request, command.matches(scope), let input = command.originalText else { return }
        snapshot = .init(runID: runID, endpoint: scope.endpoint, subject: scope.subject, mobileEpoch: scope.mobileEpoch,
                         presentationGeneration: scope.generation, sessionID: command.sessionID, requestID: command.requestID,
                         policyID: command.policyID, noticeHash: command.noticeHash,
                         originalBodySHA256: Self.hash(command.body), inputUTF8SHA256: Self.hash(Data(input.utf8)))
    }
    func readable(scope: NativeDataScope?) -> Bool {
        guard let value = snapshot, let scope, enabled else { return false }
        return value.endpoint == scope.endpoint && value.subject == scope.subject && value.mobileEpoch == scope.mobileEpoch
            && value.presentationGeneration == scope.generation
    }
    func encoded(scope: NativeDataScope?) -> String? {
        guard readable(scope: scope), let snapshot, let bytes = try? JSONEncoder().encode(snapshot) else { return nil }
        return String(data: bytes, encoding: .utf8)
    }
    func clear() { snapshot = nil }
    private static func hash(_ value: Data) -> String {
        SHA256.hash(data: value).map { String(format: "%02x", $0) }.joined()
    }
}
#endif
