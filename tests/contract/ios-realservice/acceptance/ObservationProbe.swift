import Foundation

@main private struct ObservationProbe {
    @MainActor static func main() throws {
        var checks = 0
        func check(_ value: Bool) { precondition(value); checks += 1 }
        let scope = NativeDataScope(endpoint: "http://127.0.0.1:1", subject: "00000000-0000-4000-8000-000000000001", mobileEpoch: 1, generation: 2)
        let policyBytes = Data("""
        {"id":"00000000-0000-4000-8000-000000000002","noticeHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","noticeZh":"合成","noticeEn":"Synthetic","provider":"synthetic","recipient":"synthetic","consentState":"accepted","contextMode":"qa_session_history_v1","maxTurns":8}
        """.utf8)
        let policy = try JSONDecoder().decode(NativeQAPolicy.self, from: policyBytes)
        let command = try NativeQAPending(scope: scope, sessionID: "00000000-0000-4000-8000-000000000003", policy: policy, text: "PRIVATE_SYNTHETIC_PROMPT_e\u{0301}")
        let disabled = NativeQAAcceptanceObservation(runID: nil)
        disabled.record(.submit(command), scope: scope)
        check(!disabled.enabled); check(disabled.snapshot == nil)
        let probe = NativeQAAcceptanceObservation(runID: UUID().uuidString)
        probe.record(.policy, scope: scope); check(probe.snapshot == nil)
        probe.record(.submit(command), scope: scope)
        check(probe.readable(scope: scope))
        let encoded = probe.encoded(scope: scope)!
        check(!encoded.contains("PRIVATE_SYNTHETIC_PROMPT"))
        check(!encoded.contains("accessToken")); check(!encoded.contains("refreshToken"))
        check(probe.snapshot?.requestID == command.requestID)
        check(probe.snapshot?.originalBodySHA256.count == 64)
        check(probe.snapshot?.phase == "PREPARED_NOT_SUBMITTED")
        check(!probe.readable(scope: nil))
        check(!probe.readable(scope: .init(endpoint: scope.endpoint, subject: scope.subject, mobileEpoch: 2, generation: 2)))
        check(!probe.readable(scope: .init(endpoint: scope.endpoint, subject: scope.subject, mobileEpoch: 1, generation: 3)))
        probe.clear(); check(probe.snapshot == nil)
        print("PASS: \(checks) synthetic observation assertions; no network, credentials or persistence")
    }
}
