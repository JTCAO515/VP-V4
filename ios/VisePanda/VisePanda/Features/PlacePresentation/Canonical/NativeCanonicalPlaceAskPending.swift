import Foundation
import CryptoKit

/// Immutable in-flight request bytes. Recovery never rebuilds or reposts this request.
struct NativeCanonicalPlaceAskPending: Equatable {
    let scope: NativeDataScope
    let body: Data
    let submission: Data
    let operationID: String
    let conversationID: String?
    let messageID: String?
    let scopeKind: String
    let scopeID: String
    let turnID: String?
    let expectation: NativeCanonicalPlaceAskCapture.Expectation
    let root: NativeCanonicalPlaceAskRoot
    var requestDigest: String { SHA256.hash(data: body).map { String(format: "%02x", $0) }.joined() }

    private init(scope: NativeDataScope, originalBody: Data, submission: Data, operationID: String,
                 conversationID: String?, messageID: String?, turnID: String?,
                 expectation: NativeCanonicalPlaceAskCapture.Expectation, root: NativeCanonicalPlaceAskRoot, threadID: String? = nil) {
        self.scope = scope; body = originalBody; self.submission = submission; self.operationID = operationID
        self.conversationID = conversationID; self.messageID = messageID; self.turnID = turnID
        scopeKind = threadID == nil ? "conversation" : "thread"; scopeID = threadID ?? conversationID ?? ""
        self.expectation = expectation; self.root = root
    }

    /// Restores only immutable operation identity; never recreates an eligible navigation capture.
    static func restoring(body: Data, scope: NativeDataScope) throws -> Self {
        let envelope = try NativePlaceActionWire.object(body, maximum: 24_000)
        _ = try NativePlaceActionWire.exact(envelope, ["schemaVersion", "submission", "expectation"])
        guard envelope["schemaVersion"] as? String == "canonical-place-ask/1" else { throw NativeDataError.invalidResponse }
        let expected = try NativePlaceActionWire.exact(envelope["expectation"] as Any,
            ["tripId", "headVersion", "canonicalPoiId", "provider", "providerPoiId", "mappingDigest", "contextDigest", "referenceId", "locale"])
        guard let trip = NativePlaceActionWire.id(expected["tripId"]),
              let head = NativePlaceActionWire.integer(expected["headVersion"]),
              let mapping = NativePlaceActionWire.digest(expected["mappingDigest"]),
              let context = NativePlaceActionWire.digest(expected["contextDigest"]),
              expected["referenceId"] is NSNull || NativePlaceActionWire.id(expected["referenceId"]) != nil,
              let locale = expected["locale"] as? String, ["zh", "en"].contains(locale) else { throw NativeDataError.invalidResponse }
        let identity = try NativePlaceActionWire.selection(["canonicalPoiId": expected["canonicalPoiId"] as Any,
            "provider": expected["provider"] as Any, "providerPoiId": expected["providerPoiId"] as Any])
        let expectation = NativeCanonicalPlaceAskCapture.Expectation(tripId: trip, headVersion: head, selection: identity,
            mappingDigest: mapping, contextDigest: context, referenceId: expected["referenceId"] as? String, locale: locale)
        if let taskBody = envelope["submission"] as? [String: Any], taskBody["threadId"] != nil {
            _ = try NativePlaceActionWire.exact(taskBody, ["threadId", "turnId", "idempotencyKey", "policyId", "locale", "text", "serviceTask"])
            let link = try NativePlaceActionWire.exact(taskBody["serviceTask"] as Any, ["id", "scopeVersion", "relationship", "parentTurnId"])
            guard let thread = NativePlaceActionWire.id(taskBody["threadId"]), let turn = NativePlaceActionWire.id(taskBody["turnId"]),
                  let operation = NativePlaceActionWire.id(taskBody["idempotencyKey"]), let policy = NativePlaceActionWire.id(taskBody["policyId"]),
                  taskBody["locale"] as? String == locale, let text = taskBody["text"] as? String,
                  !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, text.utf16.count <= 4000, !text.contains("\u{0000}"),
                  let task = NativePlaceActionWire.id(link["id"]), task != turn, NativePlaceActionWire.integer(link["scopeVersion"]) == 1,
                  let relationship = link["relationship"] as? String, ["new_goal", "clarification", "repair"].contains(relationship),
                  link["parentTurnId"] is NSNull || NativePlaceActionWire.id(link["parentTurnId"]) != nil,
                  (relationship == "new_goal") == (link["parentTurnId"] is NSNull), (link["parentTurnId"] as? String) != turn
            else { throw NativeDataError.invalidResponse }
            return .init(scope: scope, originalBody: body, submission: try NativePlaceActionWire.bytes(taskBody), operationID: operation,
                conversationID: nil, messageID: nil, turnID: turn, expectation: expectation,
                root: .init(conversationID: nil, goalID: nil, goalVersion: nil, parentMessageID: link["parentTurnId"] as? String,
                    relationship: relationship, locale: locale, policyID: policy), threadID: thread)
        }
        let original = try NativePlaceActionWire.exact(envelope["submission"] as Any,
            ["conversationId", "messageId", "idempotencyKey", "policyId", "locale", "text", "relationship", "goalId", "expectedGoalVersion", "taskId", "parentMessageId", "turnId"])
        guard let conversation = NativePlaceActionWire.id(original["conversationId"]),
              let message = NativePlaceActionWire.id(original["messageId"]),
              let operation = NativePlaceActionWire.id(original["idempotencyKey"]),
              let policy = NativePlaceActionWire.id(original["policyId"]), original["locale"] as? String == locale,
              let text = original["text"] as? String, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              text.utf16.count <= 4000, !text.contains("\u{0000}"),
              let relationship = original["relationship"] as? String,
              ["independent_question", "goal_start", "follow_up", "amendment", "clarification"].contains(relationship)
        else { throw NativeDataError.invalidResponse }
        for name in ["goalId", "taskId", "parentMessageId", "turnId"] {
            guard original[name] is NSNull || NativePlaceActionWire.id(original[name]) != nil else { throw NativeDataError.invalidResponse }
        }
        let version = NativePlaceActionWire.integer(original["expectedGoalVersion"])
        guard original["expectedGoalVersion"] is NSNull || version.map({ $0 > 0 }) == true else { throw NativeDataError.invalidResponse }
        let goal = original["goalId"] as? String, parent = original["parentMessageId"] as? String, turn = original["turnId"] as? String
        switch relationship {
        case "independent_question": guard goal == nil, version == nil, parent == nil, turn != nil else { throw NativeDataError.invalidResponse }
        case "goal_start": guard goal != nil, version == nil, parent == nil, turn == nil else { throw NativeDataError.invalidResponse }
        default: guard goal != nil, version != nil, parent != nil, turn == nil else { throw NativeDataError.invalidResponse }
        }
        return .init(scope: scope, originalBody: body, submission: try NativePlaceActionWire.bytes(original),
            operationID: operation, conversationID: conversation, messageID: message, turnID: turn,
            expectation: .init(tripId: trip, headVersion: head, selection: identity, mappingDigest: mapping,
                contextDigest: context, referenceId: expected["referenceId"] as? String, locale: locale),
            root: .init(conversationID: conversation, goalID: relationship == "goal_start" ? nil : goal,
                goalVersion: version, parentMessageID: parent, relationship: relationship, locale: locale, policyID: policy))
    }

    init(originalTask: NativeTextSubmission, capture: NativeCanonicalPlaceAskCapture) throws {
        guard originalTask.city == nil, originalTask.serviceTask != nil else { throw NativeDataError.invalidResponse }
        let original = try NativePlaceActionWire.object(JSONEncoder().encode(originalTask), maximum: 24_000)
        let bytes = try NativePlaceActionWire.bytes(["schemaVersion": "canonical-place-ask/1", "submission": original, "expectation": capture.expectation.object])
        self = try Self.restoring(body: bytes, scope: capture.scope)
    }

    init(submission: Data, capture: NativeCanonicalPlaceAskCapture, root: NativeCanonicalPlaceAskRoot) throws {
        let original = try NativePlaceActionWire.object(submission, maximum: 24_000)
        _ = try NativePlaceActionWire.exact(original, ["conversationId", "messageId", "idempotencyKey", "policyId", "locale", "text", "relationship", "goalId", "expectedGoalVersion", "taskId", "parentMessageId", "turnId"])
        guard let conversation = NativePlaceActionWire.id(original["conversationId"]), conversation == root.conversationID,
              let message = NativePlaceActionWire.id(original["messageId"]),
              let operation = NativePlaceActionWire.id(original["idempotencyKey"]),
              original["policyId"] as? String == root.policyID,
              original["locale"] as? String == capture.expectation.locale, root.locale == capture.expectation.locale,
              original["relationship"] as? String == root.relationship,
              let text = original["text"] as? String, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              text.utf16.count <= 4000,
              ["independent_question", "goal_start", "follow_up", "amendment", "clarification"].contains(root.relationship)
        else { throw NativeDataError.invalidResponse }
        // An original explicit goal_start is left intact; no Task or Goal is invented here.
        if root.relationship != "goal_start" {
            guard (original["goalId"] as? String) == root.goalID,
                  (original["expectedGoalVersion"] as? Int) == root.goalVersion,
                  (original["parentMessageId"] as? String) == root.parentMessageID else { throw NativeDataError.invalidResponse }
        }
        guard original["taskId"] is NSNull || NativePlaceActionWire.id(original["taskId"]) != nil,
              original["turnId"] is NSNull || NativePlaceActionWire.id(original["turnId"]) != nil else { throw NativeDataError.invalidResponse }
        let body = try NativePlaceActionWire.bytes([
            "schemaVersion": "canonical-place-ask/1", "submission": original,
            "expectation": capture.expectation.object
        ])
        guard body.count <= 24_000 else { throw NativeDataError.invalidResponse }
        _ = try Self.restoring(body: body, scope: capture.scope)
        self.scope = capture.scope; self.body = body; self.submission = submission
        operationID = operation; conversationID = conversation; messageID = message
        scopeKind = "conversation"; scopeID = conversation
        turnID = original["turnId"] as? String; expectation = capture.expectation; self.root = root
    }
}

extension NativeCanonicalPlaceAskCapture.Expectation {
    var object: [String: Any] {
        ["tripId": tripId, "headVersion": headVersion, "canonicalPoiId": selection.canonicalPoiId,
         "provider": selection.provider.rawValue, "providerPoiId": selection.providerPoiId,
         "mappingDigest": mappingDigest, "contextDigest": contextDigest,
         "referenceId": referenceId as Any? ?? NSNull(), "locale": locale]
    }
}

enum NativeCanonicalPlaceAskResponse {
    case accepted(originalReceipt: Data, turnID: String)
    case unknown
    case notSubmitted
    case unavailable(String)

    private static let reasons = ["invalid_input", "unauthorized", "policy_denied", "incompatible_goal", "incompatible_task", "selection_changed", "selection_ambiguous", "source_unavailable", "original_submission_unsupported", "operation_conflict"]
    private static func operation(_ raw: Any, matches pending: NativeCanonicalPlaceAskPending) throws {
        let operation = try NativePlaceActionWire.exact(raw, ["operationId", "scopeKind", "scopeId", "messageId", "turnId"])
        guard operation["operationId"] as? String == pending.operationID,
              operation["scopeKind"] as? String == pending.scopeKind, operation["scopeId"] as? String == pending.scopeID,
              (operation["messageId"] as? String) == pending.messageID,
              operation["messageId"] is NSNull || NativePlaceActionWire.id(operation["messageId"]) != nil,
              (operation["turnId"] as? String) == pending.turnID,
              operation["turnId"] is NSNull || NativePlaceActionWire.id(operation["turnId"]) != nil else { throw NativeDataError.invalidResponse }
    }
    static func decode(_ bytes: Data, pending: NativeCanonicalPlaceAskPending, expectedDigest: String) throws -> Self {
        // POST input is capped at 24KB; recovered current projections retain the original bounded read size.
        let value = try NativePlaceActionWire.object(bytes, maximum: 1_000_000)
        guard value["schemaVersion"] as? String == "canonical-place-ask/1",
              NativePlaceActionWire.boolean(value["readyForProvider"]) == false else { throw NativeDataError.invalidResponse }
        switch value["kind"] as? String {
        case "unknown", "not_submitted":
            _ = try NativePlaceActionWire.exact(value, ["schemaVersion", "kind", "operation", "readyForProvider"])
            try operation(value["operation"] as Any, matches: pending)
            return value["kind"] as? String == "not_submitted" ? .notSubmitted : .unknown
        case "unavailable":
            _ = try NativePlaceActionWire.exact(value, ["schemaVersion", "kind", "reason", "readyForProvider"])
            guard let reason = value["reason"] as? String, reasons.contains(reason) else { throw NativeDataError.invalidResponse }
            return .unavailable(reason)
        case "recovered":
            _ = try NativePlaceActionWire.exact(value, ["schemaVersion", "kind", "operation", "receipt", "current", "readyForProvider"])
            try operation(value["operation"] as Any, matches: pending)
            let receipt = try NativePlaceActionWire.object(try NativePlaceActionWire.bytes(value["receipt"] as? [String: Any] ?? [:]), maximum: 24_000)
            guard receipt["kind"] as? String == "accepted", let current = value["current"] as? [String: Any] else { throw NativeDataError.invalidResponse }
            let accepted = try decode(NativePlaceActionWire.bytes(receipt), pending: pending, expectedDigest: expectedDigest)
            switch current["kind"] as? String {
            case "pending": _ = try NativePlaceActionWire.exact(current, ["kind"])
            case "unavailable":
                _ = try NativePlaceActionWire.exact(current, ["kind", "reason"])
                guard let reason = current["reason"] as? String, reasons.contains(reason) else { throw NativeDataError.invalidResponse }
            case "grounded":
                _ = try NativePlaceActionWire.exact(current, ["kind", "turn"])
                guard let turn = current["turn"] as? [String: Any], turn["kind"] as? String == "grounded_turn",
                      turn["schemaVersion"] as? String == "grounded-turn/1",
                      case .accepted(_, let id) = accepted, turn["turnId"] as? String == id,
                      let binding = receipt["binding"] as? [String: Any],
                      (turn["serviceTaskId"] as? String) == (binding["serviceTaskId"] as? String) else { throw NativeDataError.invalidResponse }
                // This is receipt recovery only. Current content is never promoted to prompt/fact eligibility.
            default: throw NativeDataError.invalidResponse
            }
            return accepted
        case "accepted":
            _ = try NativePlaceActionWire.exact(value, ["schemaVersion", "kind", "operation", "originalReceipt", "binding", "readyForProvider", "currentEligibilityRequiresRead"])
            try operation(value["operation"] as Any, matches: pending)
            guard NativePlaceActionWire.boolean(value["currentEligibilityRequiresRead"]) == true else { throw NativeDataError.invalidResponse }
            let binding = try NativePlaceActionWire.exact(value["binding"] as Any, ["turnId", "serviceTaskId", "goalId", "goalVersion", "requestDigest", "expectation"])
            guard let turn = NativePlaceActionWire.id(binding["turnId"]), pending.turnID == nil || turn == pending.turnID,
                  binding["requestDigest"] as? String == expectedDigest,
                  NativePlaceActionWire.digest(binding["requestDigest"]) != nil,
                  binding["serviceTaskId"] is NSNull || NativePlaceActionWire.id(binding["serviceTaskId"]) != nil,
                  binding["goalId"] is NSNull || NativePlaceActionWire.id(binding["goalId"]) != nil,
                  binding["goalVersion"] is NSNull || NativePlaceActionWire.integer(binding["goalVersion"]).map({ $0 > 0 }) == true else { throw NativeDataError.invalidResponse }
            let expected = try NativePlaceActionWire.exact(binding["expectation"] as Any, Array(pending.expectation.object.keys))
            guard NSDictionary(dictionary: expected).isEqual(to: pending.expectation.object),
                  NativePlaceActionWire.integer(expected["headVersion"]) == pending.expectation.headVersion else { throw NativeDataError.invalidResponse }
            let original = try NativePlaceActionWire.object(pending.submission, maximum: 24_000)
            if pending.scopeKind == "thread" {
                let receipt = try NativePlaceActionWire.exact(value["originalReceipt"] as Any,
                    ["version", "kind", "turnId", "reused", "serviceTaskId", "scopeVersion", "relationship", "parentTurnId"])
                let task = try NativePlaceActionWire.exact(original["serviceTask"] as Any, ["id", "scopeVersion", "relationship", "parentTurnId"])
                guard [2, 3].contains(NativePlaceActionWire.integer(receipt["version"]) ?? -1), receipt["kind"] as? String == "accepted",
                      receipt["turnId"] as? String == pending.turnID, receipt["turnId"] as? String == turn,
                      NativePlaceActionWire.boolean(receipt["reused"]) != nil, NativePlaceActionWire.integer(receipt["scopeVersion"]) == 1,
                      receipt["serviceTaskId"] as? String == task["id"] as? String,
                      binding["serviceTaskId"] as? String == task["id"] as? String,
                      receipt["relationship"] as? String == task["relationship"] as? String,
                      (receipt["parentTurnId"] as? String) == (task["parentTurnId"] as? String),
                      receipt["parentTurnId"] is NSNull || NativePlaceActionWire.id(receipt["parentTurnId"]) != nil,
                      binding["goalId"] is NSNull, binding["goalVersion"] is NSNull else { throw NativeDataError.invalidResponse }
                return .accepted(originalReceipt: try NativePlaceActionWire.bytes(receipt), turnID: turn)
            }
            let receipt = try NativePlaceActionWire.exact(value["originalReceipt"] as Any, ["version", "kind", "conversationId", "messageId", "sequence", "goalId", "scopeVersion", "turnId", "reused"])
            guard NativePlaceActionWire.integer(receipt["version"]) == 5, receipt["kind"] as? String == "accepted",
                  receipt["conversationId"] as? String == pending.conversationID, receipt["messageId"] as? String == pending.messageID,
                  let sequence = NativePlaceActionWire.integer(receipt["sequence"]), sequence > 0,
                  NativePlaceActionWire.boolean(receipt["reused"]) != nil,
                  (receipt["turnId"] as? String) == pending.turnID,
                  receipt["turnId"] is NSNull || receipt["turnId"] as? String == turn,
                  (receipt["goalId"] as? String) == (original["goalId"] as? String),
                  (binding["goalId"] as? String) == (receipt["goalId"] as? String),
                  receipt["goalId"] is NSNull || NativePlaceActionWire.id(receipt["goalId"]) != nil,
                  (binding["goalVersion"] as? Int) == (receipt["scopeVersion"] as? Int) else { throw NativeDataError.invalidResponse }
            let expectedVersion = original["relationship"] as? String == "goal_start" ? 1
                : (original["expectedGoalVersion"] as? Int).map { $0 + (original["relationship"] as? String == "amendment" ? 1 : 0) }
            if let expectedVersion {
                guard NativePlaceActionWire.integer(receipt["scopeVersion"]) == expectedVersion else { throw NativeDataError.invalidResponse }
            } else {
                guard receipt["scopeVersion"] is NSNull, binding["goalVersion"] is NSNull else { throw NativeDataError.invalidResponse }
            }
            return .accepted(originalReceipt: try NativePlaceActionWire.bytes(receipt), turnID: turn)
        default: throw NativeDataError.invalidResponse
        }
    }
}

/// A closed variant in the existing credential Root ledger, not another Keychain service.
struct NativeCanonicalPlaceAskDurable: Codable, Equatable {
    let schemaVersion: String
    let endpoint: String
    let subject: String
    let mobileEpoch: Int
    let noticeVersion: String
    let noticeHash: String
    let body: Data
    let bodyDigest: String

    init(pending: NativeCanonicalPlaceAskPending, policy: NativeTextPolicy) throws {
        guard policy.valid, policy.consentState == .accepted, pending.root.policyID == policy.id else { throw NativeDataError.invalidResponse }
        schemaVersion = "canonical-place-ask-root/1"
        endpoint = pending.scope.endpoint; subject = pending.scope.subject; mobileEpoch = pending.scope.mobileEpoch
        noticeVersion = policy.noticeVersion; noticeHash = policy.noticeHash
        body = pending.body; bodyDigest = Self.digest(pending.body)
        guard valid else { throw NativeDataError.invalidResponse }
    }
    static func digest(_ bytes: Data) -> String { SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined() }
    func matches(_ scope: NativeDataScope) -> Bool {
        valid && endpoint == scope.endpoint && subject == scope.subject && mobileEpoch == scope.mobileEpoch
    }
    var valid: Bool {
        guard schemaVersion == "canonical-place-ask-root/1", UUID(uuidString: subject) != nil, mobileEpoch > 0,
              let url = URL(string: endpoint), ["https", "http"].contains(url.scheme), url.host != nil,
              !noticeVersion.isEmpty, noticeVersion.utf16.count <= 256,
              NativePlaceActionWire.digest(noticeHash) != nil, body.count <= 24_000,
              bodyDigest == Self.digest(body) else { return false }
        return (try? NativeCanonicalPlaceAskPending.restoring(body: body,
            scope: .init(endpoint: endpoint, subject: subject, mobileEpoch: mobileEpoch, generation: 0))) != nil
    }
    private enum CodingKeys: String, CodingKey, CaseIterable {
        case schemaVersion, endpoint, subject, mobileEpoch, noticeVersion, noticeHash, body, bodyDigest
    }
    private struct RawKey: CodingKey {
        let stringValue: String
        var intValue: Int? { nil }
        init?(stringValue: String) { self.stringValue = stringValue }
        init?(intValue: Int) { return nil }
    }
    init(from decoder: Decoder) throws {
        let raw = try decoder.container(keyedBy: RawKey.self)
        guard Set(raw.allKeys.map(\.stringValue)) == Set(CodingKeys.allCases.map(\.rawValue)) else { throw NativeDataError.invalidResponse }
        let c = try decoder.container(keyedBy: CodingKeys.self)
        schemaVersion = try c.decode(String.self, forKey: .schemaVersion)
        endpoint = try c.decode(String.self, forKey: .endpoint); subject = try c.decode(String.self, forKey: .subject)
        mobileEpoch = try c.decode(Int.self, forKey: .mobileEpoch)
        noticeVersion = try c.decode(String.self, forKey: .noticeVersion); noticeHash = try c.decode(String.self, forKey: .noticeHash)
        body = try c.decode(Data.self, forKey: .body); bodyDigest = try c.decode(String.self, forKey: .bodyDigest)
        guard valid else { throw NativeDataError.invalidResponse }
    }
}
