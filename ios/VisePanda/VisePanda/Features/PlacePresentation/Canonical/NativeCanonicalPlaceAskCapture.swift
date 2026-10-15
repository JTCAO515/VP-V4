import Foundation

/// A short-lived, server-checked navigation reference. Never provider or fact authority.
struct NativeCanonicalPlaceAskCapture: Equatable {
    let scope: NativeDataScope
    let expectation: Expectation
    let title: String
    let expiresAt: Date
    let receivedUptime: TimeInterval
    let lifetime: TimeInterval
    let purpose = "first_party_reference_only"
    let readyForProvider = false
    var currentInput: NativePlaceActionIdentity { expectation.selection }
    // Exact validated closed source set; never a latest-source lookup or a grant.
    var selectedSources: NativeSelectedSources {
        .init(artifact: nil, trip: .init(tripId: expectation.tripId, headVersion: expectation.headVersion), evidence: [])
    }

    struct Expectation: Equatable {
        let tripId: String
        let headVersion: Int
        let selection: NativePlaceActionIdentity
        let mappingDigest: String
        let contextDigest: String
        let referenceId: String?
        let locale: String
    }

    func current(scope: NativeDataScope?, locale: String, now: Date = Date(),
                 uptime: TimeInterval = ProcessInfo.processInfo.systemUptime) -> Bool {
        lifetime.isFinite && lifetime > 0 && lifetime <= 30 && receivedUptime.isFinite && uptime.isFinite
            && self.scope == scope && expectation.locale == locale && now < expiresAt
            && uptime >= receivedUptime && uptime - receivedUptime < lifetime
    }

    static func decode(_ bytes: Data, context: NativePlaceActionContext,
                       target: NativePlaceActionSelection, locale: String,
                       started: TimeInterval, now: Date = Date(),
                       uptime: TimeInterval = ProcessInfo.processInfo.systemUptime) throws -> Self {
        guard target.valid, context.selection == target.place, context.tripId == target.tripId,
              context.tripVersion == target.baseVersion, ["zh", "en"].contains(locale),
              started <= uptime, uptime - started < 30, context.expiresAt > now else { throw NativeDataError.invalidResponse }
        let value = try NativePlaceActionWire.object(bytes)
        _ = try NativePlaceActionWire.exact(value, ["kind", "tripId", "tripVersion", "selection", "mappingDigest", "contextDigest", "referenceId", "selectedSources", "currentInput", "readyForProvider", "purpose", "expiresAt", "handoff"])
        guard value["kind"] as? String == "place_ask_context", value["tripId"] as? String == target.tripId,
              NativePlaceActionWire.integer(value["tripVersion"]) == target.baseVersion,
              try NativePlaceActionWire.selection(value["selection"] as Any) == target.place,
              try NativePlaceActionWire.selection(value["currentInput"] as Any) == target.place,
              value["mappingDigest"] as? String == context.mappingDigest,
              value["contextDigest"] as? String == context.contextDigest,
              value["referenceId"] is NSNull || NativePlaceActionWire.id(value["referenceId"]) != nil,
              NativePlaceActionWire.boolean(value["readyForProvider"]) == false,
              value["purpose"] as? String == "first_party_reference_only",
              let expires = (value["expiresAt"] as? String).flatMap(NativeKnowledgeRead.date),
              expires > now, expires.timeIntervalSince(now) <= 30 else { throw NativeDataError.invalidResponse }
        let sources = try NativePlaceActionWire.exact(value["selectedSources"] as Any, ["artifact", "trip", "evidence"])
        let trip = try NativePlaceActionWire.exact(sources["trip"] as Any, ["tripId", "headVersion"])
        guard sources["artifact"] is NSNull, (sources["evidence"] as? [Any])?.isEmpty == true,
              trip["tripId"] as? String == target.tripId,
              NativePlaceActionWire.integer(trip["headVersion"]) == target.baseVersion else { throw NativeDataError.invalidResponse }
        let reference = value["referenceId"] as? String
        if !(value["handoff"] is NSNull) {
            let handoff = try NativePlaceActionWire.exact(value["handoff"] as Any, ["kind", "href", "poiId", "readiness"])
            guard handoff["kind"] as? String == "ask_ready", handoff["poiId"] as? String == target.place.canonicalPoiId,
                  handoff["readiness"] as? String == "recheck_required", reference != nil else { throw NativeDataError.invalidResponse }
        }
        let boundExpiry = min(expires, context.expiresAt)
        let remaining = min(30 - (uptime - started), boundExpiry.timeIntervalSince(now))
        guard remaining > 0 else { throw NativeDataError.invalidResponse }
        return .init(scope: target.scope,
                     expectation: .init(tripId: target.tripId, headVersion: target.baseVersion, selection: target.place,
                                        mappingDigest: context.mappingDigest, contextDigest: context.contextDigest,
                                        referenceId: reference, locale: locale),
                     title: context.title, expiresAt: boundExpiry, receivedUptime: uptime, lifetime: remaining)
    }
}

/// Local composer fence only; the server still derives the authoritative root.
struct NativeCanonicalPlaceAskRoot: Equatable {
    let conversationID: String?
    let goalID: String?
    let goalVersion: Int?
    let parentMessageID: String?
    let relationship: String
    let locale: String
    let policyID: String?
}

/// A refresh is staged only if the exact reference generation still owns navigation.
struct NativeCanonicalPlaceAskRefresh {
    let original: NativeCanonicalPlaceAskCapture
    let capture: NativeCanonicalPlaceAskCapture
    let generation: UUID
}

/// Server history only. This proof is immutable identity, never current fact or prompt permission.
struct NativeCanonicalPlaceHistoryProof: Decodable {
    let operationID: String
    let requestDigest: String
    let expectation: NativeCanonicalPlaceAskCapture.Expectation
    let subjectID: String
    let city: String
    let scene: String
    let sourceDigest: String
    let threadID: String
    let turnID: String
    let taskID: String
    let relationship: String
    let parentTurnID: String?

    init(from decoder: Decoder) throws {
        let raw = try NativeCanonicalJSON(from: decoder).value
        let v = try NativePlaceActionWire.exact(raw, ["schemaVersion", "operationId", "scopeKind", "scopeId", "operation", "requestDigest", "expectation", "basis", "originalReceipt"])
        guard v["schemaVersion"] as? String == "canonical-place-proof/1", v["scopeKind"] as? String == "thread",
              let operation = NativePlaceActionWire.id(v["operationId"]), let thread = NativePlaceActionWire.id(v["scopeId"]),
              let digest = NativePlaceActionWire.digest(v["requestDigest"]) else { throw NativeDataError.invalidResponse }
        let op = try NativePlaceActionWire.exact(v["operation"] as Any, ["operationId", "scopeKind", "scopeId", "messageId", "turnId"])
        guard op["operationId"] as? String == operation, op["scopeKind"] as? String == "thread", op["scopeId"] as? String == thread,
              op["messageId"] is NSNull, let turn = NativePlaceActionWire.id(op["turnId"]) else { throw NativeDataError.invalidResponse }
        let e = try NativePlaceActionWire.exact(v["expectation"] as Any, ["tripId", "headVersion", "canonicalPoiId", "provider", "providerPoiId", "mappingDigest", "contextDigest", "referenceId", "locale"])
        guard let trip = NativePlaceActionWire.id(e["tripId"]), let head = NativePlaceActionWire.integer(e["headVersion"]),
              let mapping = NativePlaceActionWire.digest(e["mappingDigest"]), let context = NativePlaceActionWire.digest(e["contextDigest"]),
              e["referenceId"] is NSNull || NativePlaceActionWire.id(e["referenceId"]) != nil,
              let locale = e["locale"] as? String, ["zh", "en"].contains(locale) else { throw NativeDataError.invalidResponse }
        let identity = try NativePlaceActionWire.selection(["canonicalPoiId": e["canonicalPoiId"] as Any, "provider": e["provider"] as Any, "providerPoiId": e["providerPoiId"] as Any])
        let basis = try NativePlaceActionWire.exact(v["basis"] as Any, ["subjectId", "city", "scene", "sourceDigest"])
        guard let subject = basis["subjectId"] as? String, NativeKnowledgeAnswer.definition("place_address", subjectId: subject) != nil,
              let city = basis["city"] as? String, NativeKnowledgeSelection.cities.contains(city),
              basis["scene"] as? String == "attraction", let source = NativePlaceActionWire.digest(basis["sourceDigest"]) else { throw NativeDataError.invalidResponse }
        let receipt = try NativePlaceActionWire.exact(v["originalReceipt"] as Any, ["version", "kind", "turnId", "reused", "serviceTaskId", "scopeVersion", "relationship", "parentTurnId"])
        guard NativePlaceActionWire.integer(receipt["version"]) == 2, receipt["kind"] as? String == "accepted",
              receipt["turnId"] as? String == turn, NativePlaceActionWire.boolean(receipt["reused"]) == false,
              let task = NativePlaceActionWire.id(receipt["serviceTaskId"]), task != turn,
              NativePlaceActionWire.integer(receipt["scopeVersion"]) == 1,
              let relation = receipt["relationship"] as? String, ["new_goal", "clarification", "repair"].contains(relation),
              receipt["parentTurnId"] is NSNull || NativePlaceActionWire.id(receipt["parentTurnId"]) != nil,
              (relation == "new_goal") == (receipt["parentTurnId"] is NSNull) else { throw NativeDataError.invalidResponse }
        operationID = operation; requestDigest = digest; threadID = thread; turnID = turn; taskID = task
        expectation = .init(tripId: trip, headVersion: head, selection: identity, mappingDigest: mapping, contextDigest: context, referenceId: e["referenceId"] as? String, locale: locale)
        subjectID = subject; self.city = city; scene = "attraction"; sourceDigest = source
        relationship = relation; parentTurnID = receipt["parentTurnId"] as? String
    }
    func matches(_ turn: NativeTextTurn) -> Bool {
        turn.valid && turn.validTask && turn.turnId == turnID && turn.threadId == threadID && turn.serviceTaskId == taskID
            && turn.scopeVersion == 1 && turn.relationship == relationship && turn.parentTurnId == parentTurnID
            && turn.locale == expectation.locale
    }
}

struct NativeCanonicalPlaceHistoryRow: Decodable {
    let turn: NativeTextTurn
    let proof: NativeCanonicalPlaceHistoryProof?
    private enum CodingKeys: String, CodingKey { case canonicalPlaceProof }
    init(from decoder: Decoder) throws {
        turn = try NativeTextTurn(from: decoder)
        let c = try decoder.container(keyedBy: CodingKeys.self)
        proof = try c.decodeIfPresent(NativeCanonicalPlaceHistoryProof.self, forKey: .canonicalPlaceProof)
    }
    var selected: Bool { proof != nil || turn.result != nil }
    func lifetime(elapsed: TimeInterval) throws -> TimeInterval {
        guard let proof, proof.matches(turn), let result = turn.result,
              result.type == "reviewed_answer", result.city == proof.city, result.placeName == nil,
              result.placeSubjectId == nil || result.placeSubjectId == proof.subjectID,
              result.placeResolution == nil || result.placeResolution == "matched",
              result.originalOutcome == turn.outcome?.rawValue,
              elapsed.isFinite, elapsed >= 0, elapsed < 30 else { throw NativeDataError.invalidResponse }
        if let needs = result.unansweredNeeds {
            guard result.completedAt != nil, needs.count <= 6, Set(needs).count == needs.count,
                  (result.requestScope == "additional_needs") == !needs.isEmpty,
                  needs.allSatisfy({ !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && $0.unicodeScalars.count <= 240 && !$0.contains("\0") && turn.input.contains($0) }) else { throw NativeDataError.invalidResponse }
        }
        if result.completedAt == nil {
            guard result.intent == nil, result.requestScope == nil, result.originalOutcome == nil,
                  result.knowledge == nil, result.projection == "pending", turn.output == nil else { throw NativeDataError.invalidResponse }
            return 30 - elapsed
        }
        guard result.completedAt.flatMap(NativeKnowledgeRead.date) != nil, turn.output == "reviewed-answer-v1",
              ["current", "unavailable"].contains(result.projection) else { throw NativeDataError.invalidResponse }
        if let intent = result.intent, NativeKnowledgeAnswer.isPlace(intent),
           let definition = NativeKnowledgeAnswer.definition(intent, subjectId: proof.subjectID) {
            guard ["single", "additional_needs"].contains(result.requestScope ?? ""),
                  ["answered", "partial", "blocked"].contains(result.originalOutcome ?? ""),
                  result.requestScope != "additional_needs" || result.originalOutcome != "answered" else { throw NativeDataError.invalidResponse }
            if result.projection == "unavailable" {
                guard result.knowledge == nil else { throw NativeDataError.invalidResponse }
                return 30 - elapsed
            }
            guard let knowledge = result.knowledge, result.placeSubjectId == proof.subjectID,
                  result.placeResolution == "matched", definition.scene == proof.scene else { throw NativeDataError.invalidResponse }
            return try knowledge.lifetime(for: .init(city: proof.city, scene: proof.scene, locale: turn.locale),
                elapsed: elapsed, question: true, questionId: intent, subjectId: proof.subjectID)
        }
        let expected = result.intent == "clarification" ? "clarification" : result.intent == "technical_failure" ? "technical_failure" : "blocked"
        guard ["clarification", "unsupported", "technical_failure", "blocked"].contains(result.intent ?? ""),
              result.requestScope == "unknown", result.originalOutcome == expected,
              result.knowledge == nil, result.projection == "current" else { throw NativeDataError.invalidResponse }
        return 30 - elapsed
    }
}
struct NativeCanonicalPlaceHistory: Decodable {
    let version: Int
    let kind: String
    let turns: [NativeCanonicalPlaceHistoryRow]
}

/// Preserves JSON scalars only for the closed history proof decoder; never an admission body builder.
private struct NativeCanonicalJSON: Decodable {
    let value: Any
    private struct Key: CodingKey {
        let stringValue: String; var intValue: Int? { nil }
        init?(stringValue: String) { self.stringValue = stringValue }
        init?(intValue: Int) { return nil }
    }
    init(from decoder: Decoder) throws {
        if let c = try? decoder.container(keyedBy: Key.self) {
            var result: [String: Any] = [:]
            for key in c.allKeys { result[key.stringValue] = try c.decode(NativeCanonicalJSON.self, forKey: key).value }
            value = result
        } else if var c = try? decoder.unkeyedContainer() {
            var result: [Any] = []
            while !c.isAtEnd { result.append(try c.decode(NativeCanonicalJSON.self).value) }
            value = result
        } else {
            let c = try decoder.singleValueContainer()
            if c.decodeNil() { value = NSNull() }
            else if let v = try? c.decode(Bool.self) { value = v }
            else if let v = try? c.decode(Int.self) { value = v }
            else if let v = try? c.decode(String.self) { value = v }
            else { value = try c.decode(Double.self) }
        }
    }
}

struct NativeCanonicalPlaceAskHistoryRefresh {
    let capture: NativeCanonicalPlaceAskCapture
    let generation: UUID
    let operationID: String
    let requestDigest: String
}
