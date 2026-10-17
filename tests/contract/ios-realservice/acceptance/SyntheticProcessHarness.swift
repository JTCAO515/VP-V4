import Foundation
import CryptoKit

// SYNTHETIC ONLY. No URLSession, NativeSession credential IO, Keychain, SQL or provider.
private struct Fixture: Codable {
    var schema = "nativeqa-synthetic-process/1"
    var runID: String
    var authenticated = false
    var consented = false
    var sessionID: String?
    var submitted: NativeQAPending?
    var pending: NativeQAPending?
    var historyReads = 0
    var posts = 0
    var trace: [String] = []
}
private enum ProbeFailure: Error { case invalidFixture, assertion }
private func require(_ value: @autoclosure () throws -> Bool) throws { if try !value() { throw ProbeFailure.assertion } }
private func digest(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }

@MainActor private final class SyntheticPort: NativeQATransport {
    let file: URL
    let runID: String
    var fixture: Fixture
    private var admissionRead = false
    let subject = "00000000-0000-4000-8000-000000000001"
    let policyID = "00000000-0000-4000-8000-000000000002"
    let answer = "SYNTHETIC / Not connected to a real Agent. Saved response for process-reopen proof."
    var scope: NativeDataScope? {
        fixture.authenticated ? .init(endpoint: "http://127.0.0.1:1", subject: subject, mobileEpoch: 1,
                                      generation: Int(ProcessInfo.processInfo.processIdentifier)) : nil
    }
    init(file: URL, runID: String, create: Bool) throws {
        self.file = file; self.runID = runID
        if create {
            guard !FileManager.default.fileExists(atPath: file.path) else { throw ProbeFailure.invalidFixture }
            fixture = .init(runID: runID)
            try save()
        } else {
            fixture = try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: file))
            guard fixture.schema == "nativeqa-synthetic-process/1", fixture.runID == runID else { throw ProbeFailure.invalidFixture }
        }
    }
    func save() throws { try JSONEncoder().encode(fixture).write(to: file, options: [.atomic]) }
    func physical() throws -> Fixture {
        let read = try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: file))
        guard read.schema == fixture.schema, read.runID == runID else { throw ProbeFailure.invalidFixture }
        return read
    }
    /// Models only the location of the original Profile/credentials/login handshake.
    /// It does not execute NativeSession or claim ordinary Auth acceptance.
    func modelLogin() throws {
        fixture.trace += ["SYNTHETIC_AUTH_MODEL: POST api/auth/native/v2/credentials", "SYNTHETIC_AUTH_MODEL: POST api/auth/native/v2/login"]
        fixture.authenticated = true; try save()
    }
    var policy: [String: Any] {
        ["id": policyID, "noticeHash": String(repeating: "a", count: 64), "noticeZh": "合成测试说明，未连接真实服务。",
         "noticeEn": "Synthetic notice; not connected to a real service.", "provider": "synthetic", "recipient": "synthetic",
         "consentState": fixture.consented ? "accepted" : "not_accepted", "contextMode": "qa_session_history_v1", "maxTurns": 8]
    }
    func session(_ id: String) -> [String: Any] {
        ["id": id, "label": "SYNTHETIC session", "createdAt": "2026-10-17T00:00:00Z", "updatedAt": "2026-10-17T00:00:00Z"]
    }
    func message(answered: Bool) throws -> [String: Any] {
        guard let pending = fixture.submitted, let input = pending.originalText else { throw ProbeFailure.invalidFixture }
        return ["requestId": pending.requestID, "turnId": pending.requestID, "sessionId": pending.sessionID,
                "input": input, "text": answered ? answer : NSNull(), "status": answered ? "answered" : "pending",
                "createdAt": "2026-10-17T00:00:00Z"]
    }
    func loadPending(scope: NativeDataScope) throws -> NativeQAPending? {
        let pending = try physical().pending
        guard pending.map({ $0.matches(scope) }) ?? true else { throw ProbeFailure.invalidFixture }
        return pending
    }
    func retainPending(_ pending: NativeQAPending, scope: NativeDataScope) throws {
        guard pending.matches(scope), fixture.pending == nil || fixture.pending == pending else { throw ProbeFailure.invalidFixture }
        fixture.pending = pending; try save()
        try require(try physical().pending == pending)
    }
    func clearPending(_ pending: NativeQAPending, scope: NativeDataScope) throws {
        guard admissionRead, pending.matches(scope), try physical().pending == pending else { throw ProbeFailure.invalidFixture }
        fixture.pending = nil; try save()
    }
    func request(_ request: NativeQARequest, scope expected: NativeDataScope) async throws -> NativeQAHTTPResponse {
        guard scope == expected else { throw NativeQAError.stale }
        try Task.checkCancellation()
        fixture.trace.append(request.method + " " + (try request.path))
        let value: [String: Any]
        switch request {
        case .policy: value = ["policy": policy]
        case .consent(let id, let hash):
            guard id == policyID, hash == String(repeating: "a", count: 64) else { throw ProbeFailure.assertion }
            fixture.consented = true; value = ["policy": policy]
        case .sessions: value = ["sessions": fixture.sessionID.map { [session($0)] } ?? []]
        case .createSession:
            guard fixture.sessionID == nil else { throw ProbeFailure.assertion }
            let id = UUID().uuidString.lowercased(); fixture.sessionID = id; value = ["session": session(id)]
        case .submit(let pending):
            guard fixture.consented, pending.matches(expected), fixture.pending == pending,
                  try physical().pending == pending, pending.sessionID == fixture.sessionID else { throw ProbeFailure.assertion }
            fixture.posts += 1; guard fixture.posts == 1 else { throw ProbeFailure.assertion }
            fixture.submitted = pending
            value = ["requestId": pending.requestID, "turnId": pending.requestID, "sessionId": pending.sessionID, "status": "pending", "reused": false]
        case .recover(let id, let requestID):
            guard let command = fixture.submitted, command.sessionID == id, command.requestID == requestID else { throw ProbeFailure.assertion }
            admissionRead = true; value = ["message": try message(answered: false)]
        case .history(let id):
            guard id == fixture.sessionID else { throw ProbeFailure.assertion }
            if fixture.submitted != nil { fixture.historyReads += 1 }
            value = ["session": session(id), "messages": fixture.submitted == nil ? [] : [try message(answered: fixture.historyReads >= 2)],
                     "historyLimit": 20, "policy": policy]
        case .requestCancellation, .readCancellation: throw ProbeFailure.assertion
        }
        try save()
        var body = value; body["version"] = "qa-agent/1"
        return .init(status: 200, body: try JSONSerialization.data(withJSONObject: body))
    }
}

@main private struct SyntheticProcessHarness {
    @MainActor static func main() async throws {
        let args = CommandLine.arguments
        guard args.count == 4, ["first", "reopen"].contains(args[1]), UUID(uuidString: args[3]) != nil else { throw ProbeFailure.invalidFixture }
        let phase = args[1], file = URL(fileURLWithPath: args[2]), runID = args[3]
        let port = try SyntheticPort(file: file, runID: runID, create: phase == "first")
        let store = NativeQAStore(transport: port)
        if phase == "first" {
            await store.activate(true); try require(store.state == .signedOut)
            try port.modelLogin()
            await store.activate(true); try require(store.policy?.consentState == .notAccepted)
            await store.acceptConsent(); try require(store.policy?.consentState == .accepted)
            await store.createSession(); try require(store.selectedID != nil)
            store.draft = "SYNTHETIC exact e\u{0301} input \n"
            await store.send(); try require(store.state == .pending)
            for _ in 0..<3 where store.state == .pending { await store.refresh() }
        } else {
            // A fresh process + Store, same isolated synthetic durable state, no login/submission replay.
            await store.activate(true)
            guard let id = port.fixture.sessionID else { throw ProbeFailure.invalidFixture }
            try require(store.sessions.contains { $0.id == id })
            await store.select(id)
        }
        guard let message = store.messages.first, let command = port.fixture.submitted, let text = message.text else { throw ProbeFailure.assertion }
        try require(store.state == .ready && message.status == .answered)
        try require(message.sessionId == command.sessionID && message.requestId == command.requestID)
        try require(command.matchesOriginalInputBytes(message.input) && text == port.answer && port.fixture.posts == 1)
        let result: [String: Any] = ["schema": "ios-nativeqa-synthetic-phase/1", "synthetic": true, "phase": phase,
            "run_id": runID, "pid": Int(ProcessInfo.processInfo.processIdentifier), "session_id": message.sessionId,
            "request_id": message.requestId, "turn_id": message.turnId, "submission_count": port.fixture.posts,
            "original_body_sha256": digest(command.body), "input_utf8_sha256": digest(Data(message.input.utf8)),
            "answer_utf8_sha256": digest(Data(text.utf8)), "state": "answered", "trace": port.fixture.trace,
            "auth_evidence": "SYNTHETIC_MODEL_ONLY", "vault_evidence": "PRIVATE_TEMP_FILE_TEST_DOUBLE",
            "service_task_id": NSNull(), "service_task_binding": "UNOBSERVABLE_IN_QA_AGENT_1"]
        let bytes = try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
        FileHandle.standardOutput.write(bytes); FileHandle.standardOutput.write(Data("\n".utf8))
    }
}
