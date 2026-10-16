import Foundation

/// A current, protected message selection. Fresh stop eligibility is not a new consent grant.
struct NativeQACancellationTarget: Equatable {
    let scope: NativeDataScope
    let sessionID: String
    let requestID: String
    let canRequestStop: Bool
    var valid: Bool { NativeQAWire.uuid(sessionID) && NativeQAWire.uuid(requestID) }
    func sameRequest(as other: Self) -> Bool {
        scope == other.scope && sessionID.lowercased() == other.sessionID.lowercased() && requestID.lowercased() == other.requestID.lowercased()
    }
}

/// The server has no separate cancel UUID: identity is the original session/request tuple.
/// No prompt, generation journal, token, financial data or retry authority is stored here.
struct NativeQACancellationPending: Codable, Equatable {
    let schemaVersion: Int
    let endpoint: String
    let subject: String
    let mobileEpoch: Int
    let sessionID: String
    let requestID: String
    let body: Data
    init(target: NativeQACancellationTarget) throws {
        guard target.valid else { throw NativeQACancellationError.invalidResponse }
        schemaVersion = 1; endpoint = target.scope.endpoint; subject = target.scope.subject
        mobileEpoch = target.scope.mobileEpoch
        sessionID = target.sessionID.lowercased(); requestID = target.requestID.lowercased()
        body = Data("{}".utf8)
        guard valid else { throw NativeQACancellationError.invalidResponse }
    }
    var valid: Bool {
        schemaVersion == 1 && !endpoint.isEmpty && endpoint.utf8.count <= 2048 && NativeQAWire.uuid(subject) && mobileEpoch > 0 && mobileEpoch <= 9_007_199_254_740_991
        && NativeQAWire.uuid(sessionID) && NativeQAWire.uuid(requestID)
        && sessionID == sessionID.lowercased() && requestID == requestID.lowercased() && body == Data("{}".utf8)
    }
    func matches(_ target: NativeQACancellationTarget) -> Bool {
        valid && target.valid && endpoint == target.scope.endpoint && subject == target.scope.subject
        && mobileEpoch == target.scope.mobileEpoch && sessionID == target.sessionID.lowercased() && requestID == target.requestID.lowercased()
    }
}

struct NativeQACancellationReceipt: Codable, Equatable {
    enum State: String, Codable { case pending, cancelled, terminal, notObserved = "not_observed" }
    enum Ack: String, Codable { case observed, unknown }
    let version: String
    let sessionId: String
    let requestId: String
    let state: State
    let ack: Ack
    var observed: Bool { state == .cancelled || state == .terminal }
    func matches(_ command: NativeQACancellationPending) -> Bool {
        version == "qa-cancellation/1" && NativeQAWire.uuid(sessionId) && NativeQAWire.uuid(requestId)
        && sessionId == command.sessionID && requestId == command.requestID
        && ack == (observed ? .observed : .unknown)
    }
    static func decode(_ response: NativeQAHTTPResponse, command: NativeQACancellationPending) throws -> Self {
        // A transport identity denial is never a stop/admission receipt, even with foreign HTML/JSON.
        if response.status == 401 || response.status == 403 {
            throw NativeQACancellationError.server(code: response.status == 401 ? "UNAUTHENTICATED" : "FORBIDDEN", ack: "unknown")
        }
        guard command.valid, response.body.count <= 4096,
              let object = try JSONSerialization.jsonObject(with: response.body) as? [String: Any],
              object["version"] as? String == "qa-cancellation/1",
              object["sessionId"] as? String == command.sessionID,
              object["requestId"] as? String == command.requestID else { throw NativeQACancellationError.invalidResponse }
        if !(200..<300).contains(response.status) {
            guard Set(object.keys) == ["version", "sessionId", "requestId", "error"],
                  let error = object["error"] as? [String: Any], Set(error.keys) == ["code", "ack"],
                  let code = error["code"] as? String, ["INVALID_INPUT", "UNAUTHENTICATED", "FORBIDDEN", "PROVIDER_UNAVAILABLE"].contains(code),
                  let ack = error["ack"] as? String, ["unknown", "not_submitted"].contains(ack) else { throw NativeQACancellationError.invalidResponse }
            throw NativeQACancellationError.server(code: code, ack: ack)
        }
        guard Set(object.keys) == ["version", "sessionId", "requestId", "state", "ack"] else { throw NativeQACancellationError.invalidResponse }
        let receipt = try JSONDecoder().decode(Self.self, from: response.body)
        guard receipt.matches(command) else { throw NativeQACancellationError.invalidResponse }
        return receipt
    }
}

/// Finishing seals a cancellation-only tombstone; it must not erase the immutable command.
/// Keeping the tuple prevents stale UI/reopen from making another stop POST after observation.
struct NativeQACancellationRecord: Codable, Equatable {
    static let maximumRecordsPerActor = 32
    static let maximumRecordBytes = 4096
    let command: NativeQACancellationPending
    let receipt: NativeQACancellationReceipt?
    var valid: Bool { command.valid && (receipt.map { $0.observed && $0.matches(command) } ?? true) }
}

@MainActor
protocol NativeQACancellationPersistence {
    /// Exact endpoint/subject/epoch/session/request key only. Missing != stopped or not submitted.
    func loadCancellation(target: NativeQACancellationTarget) throws -> NativeQACancellationRecord?
    /// Atomic retain/CAS + physical readback; never overwrite a different command/tuple.
    /// Bound all epochs for this endpoint+subject to maximumRecordsPerActor and each
    /// encoded record to maximumRecordBytes. At capacity reject a new tuple; never
    /// evict unknown OR observed tombstones, age-reset them, or retry a POST.
    /// Implement the capacity check atomically with retain in the original vault owner.
    func retainCancellation(_ command: NativeQACancellationPending, scope: NativeDataScope) throws
    /// Only a validated observed receipt may seal this exact command, with physical readback.
    /// Never clears or acknowledges NativeQA generation pending, refunds or changes budget state.
    func finishCancellation(_ command: NativeQACancellationPending, receipt: NativeQACancellationReceipt, scope: NativeDataScope) throws
}
// Explicit logout/revocation/deletion cleanup belongs to the existing journal/identity owner.
// Transient offline/background/locked storage must preserve these metadata-only records.

enum NativeQACancellationError: Error {
    case invalidResponse, stale, storageUnavailable
    case server(code: String, ack: String)
}
