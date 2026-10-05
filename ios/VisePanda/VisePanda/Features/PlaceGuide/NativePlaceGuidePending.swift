import Foundation

/// Original explicit Ask operation, retained only after its processing consent.
/// No source text or audio is copied into this recovery record.
struct NativePlaceGuidePending: Codable, Equatable {
    let endpoint: String
    let owner: String
    let mobileEpoch: Int
    let canonicalPoiID: String
    let tripID: String
    let tripVersion: Int
    let placeReferenceID: String
    let locale: String
    let interest: NativePlaceGuideInterest
    let noticeHash: String
    let expiresAt: Date
    let body: Data
    var fencedReference: NativePlaceGuideResultReference? = nil

    func selection(for scope: NativeDataScope) throws -> NativePlaceGuideSelection {
        guard scope.endpoint == endpoint, scope.subject == owner, scope.mobileEpoch == mobileEpoch else { throw NativeDataError.staleSessionResponse }
        let selection = NativePlaceGuideSelection(scope: scope, canonicalPoiID: canonicalPoiID, placeReferenceID: placeReferenceID,
            tripID: tripID, tripVersion: tripVersion, locale: locale, interest: interest)
        guard selection.valid else { throw NativeDataError.invalidResponse }
        return selection
    }
    func fields() throws -> [String: Any] {
        guard fencedReference == nil else { throw NativeDataError.server(code: "GUIDE_SOURCE_FENCED") }
        guard body.count <= 12_000, NativePlaceActionWire.digest(noticeHash) != nil else { throw NativeDataError.invalidResponse }
        let value = try NativePlaceActionWire.exact(JSONSerialization.jsonObject(with: body), ["action", "expectedTripVersion", "placeReferenceId", "locale", "interest", "operationId", "expectedDigest", "completedSegmentIds", "question", "threadId", "turnId", "policyId", "serviceTask"])
        guard value["action"] as? String == "follow_up", NativePlaceActionWire.integer(value["expectedTripVersion"]) == tripVersion,
              value["placeReferenceId"] as? String == placeReferenceID, value["locale"] as? String == locale,
              value["interest"] as? String == interest.rawValue, NativePlaceActionWire.id(value["operationId"]) != nil,
              NativePlaceActionWire.digest(value["expectedDigest"]) != nil, NativePlaceActionWire.id(value["threadId"]) != nil,
              NativePlaceActionWire.id(value["turnId"]) != nil, NativePlaceActionWire.id(value["policyId"]) != nil,
              let question = value["question"] as? String, !question.isEmpty, question.utf16.count <= 600,
              question == question.trimmingCharacters(in: .whitespacesAndNewlines), !question.contains("\0") else { throw NativeDataError.invalidResponse }
        guard let completed = value["completedSegmentIds"] as? [String], completed.count <= 4,
              Set(completed).count == completed.count, completed.allSatisfy({ NativePlaceActionWire.id($0) != nil }) else { throw NativeDataError.invalidResponse }
        let task = try NativePlaceActionWire.exact(value["serviceTask"] as Any, ["id", "scopeVersion", "relationship", "parentTurnId"])
        guard NativePlaceActionWire.id(task["id"]) != nil, NativePlaceActionWire.integer(task["scopeVersion"]) == 1,
              ["new_goal", "clarification", "repair"].contains(task["relationship"] as? String ?? ""),
              (task["relationship"] as? String == "new_goal") == (task["parentTurnId"] is NSNull),
              task["parentTurnId"] is NSNull || NativePlaceActionWire.id(task["parentTurnId"]) != nil else { throw NativeDataError.invalidResponse }
        return value
    }
    func validatedRecovery() throws {
        if let reference = fencedReference {
            guard body.isEmpty, reference.valid, reference.noticeHash == noticeHash else { throw NativeDataError.invalidResponse }
        } else { _ = try fields() }
    }
    func fenced() throws -> Self {
        let reference = try NativePlaceGuideResultReference(self)
        return .init(endpoint: endpoint, owner: owner, mobileEpoch: mobileEpoch, canonicalPoiID: canonicalPoiID,
            tripID: tripID, tripVersion: tripVersion, placeReferenceID: placeReferenceID, locale: locale, interest: interest,
            noticeHash: noticeHash, expiresAt: expiresAt, body: Data(), fencedReference: reference)
    }
}

/// A read-only result marker, without the original question or submitted speech-position input.
struct NativePlaceGuideResultReference: Codable, Equatable {
    let operationID: String
    let turnID: String
    let threadID: String
    let policyID: String
    let noticeHash: String
    let digest: String
    let taskID: String
    let relationship: String
    let parentTurnID: String?
    var valid: Bool {
        [operationID, turnID, threadID, policyID, taskID].allSatisfy({ NativePlaceActionWire.id($0) != nil })
        && NativePlaceActionWire.digest(digest) != nil && NativePlaceActionWire.digest(noticeHash) != nil
        && ["new_goal", "clarification", "repair"].contains(relationship)
        && (relationship == "new_goal") == (parentTurnID == nil)
        && (parentTurnID == nil || NativePlaceActionWire.id(parentTurnID) != nil)
    }
    init(_ pending: NativePlaceGuidePending) throws {
        if let reference = pending.fencedReference { guard reference.valid, pending.body.isEmpty else { throw NativeDataError.invalidResponse }; self = reference; return }
        let value = try pending.fields(), task = try NativePlaceActionWire.exact(value["serviceTask"] as Any, ["id", "scopeVersion", "relationship", "parentTurnId"])
        guard let operationID = value["operationId"] as? String, let turnID = value["turnId"] as? String, let threadID = value["threadId"] as? String,
              let policyID = value["policyId"] as? String, let digest = value["expectedDigest"] as? String,
              let taskID = task["id"] as? String, let relationship = task["relationship"] as? String else { throw NativeDataError.invalidResponse }
        self.operationID = operationID; self.turnID = turnID; self.threadID = threadID; self.policyID = policyID; self.digest = digest
        self.noticeHash = pending.noticeHash; self.taskID = taskID; self.relationship = relationship; self.parentTurnID = task["parentTurnId"] as? String
    }
}
