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
    let body: Data

    func selection(for scope: NativeDataScope) throws -> NativePlaceGuideSelection {
        guard scope.endpoint == endpoint, scope.subject == owner, scope.mobileEpoch == mobileEpoch else { throw NativeDataError.staleSessionResponse }
        let selection = NativePlaceGuideSelection(scope: scope, canonicalPoiID: canonicalPoiID, placeReferenceID: placeReferenceID,
            tripID: tripID, tripVersion: tripVersion, locale: locale, interest: interest)
        guard selection.valid else { throw NativeDataError.invalidResponse }
        return selection
    }
    func fields() throws -> [String: Any] {
        guard body.count <= 12_000, NativePlaceActionWire.digest(noticeHash) != nil else { throw NativeDataError.invalidResponse }
        let value = try NativePlaceActionWire.exact(JSONSerialization.jsonObject(with: body), ["action", "expectedTripVersion", "placeReferenceId", "locale", "interest", "operationId", "expectedDigest", "question", "threadId", "turnId", "policyId", "serviceTask"])
        guard value["action"] as? String == "follow_up", NativePlaceActionWire.integer(value["expectedTripVersion"]) == tripVersion,
              value["placeReferenceId"] as? String == placeReferenceID, value["locale"] as? String == locale,
              value["interest"] as? String == interest.rawValue, NativePlaceActionWire.id(value["operationId"]) != nil,
              NativePlaceActionWire.digest(value["expectedDigest"]) != nil, NativePlaceActionWire.id(value["threadId"]) != nil,
              NativePlaceActionWire.id(value["turnId"]) != nil, NativePlaceActionWire.id(value["policyId"]) != nil,
              let question = value["question"] as? String, !question.isEmpty, question.utf16.count <= 600,
              question == question.trimmingCharacters(in: .whitespacesAndNewlines), !question.contains("\0") else { throw NativeDataError.invalidResponse }
        let task = try NativePlaceActionWire.exact(value["serviceTask"] as Any, ["id", "scopeVersion", "relationship", "parentTurnId"])
        guard NativePlaceActionWire.id(task["id"]) != nil, NativePlaceActionWire.integer(task["scopeVersion"]) == 1,
              ["new_goal", "clarification", "repair"].contains(task["relationship"] as? String ?? ""),
              (task["relationship"] as? String == "new_goal") == (task["parentTurnId"] is NSNull),
              task["parentTurnId"] is NSNull || NativePlaceActionWire.id(task["parentTurnId"]) != nil else { throw NativeDataError.invalidResponse }
        return value
    }
}
