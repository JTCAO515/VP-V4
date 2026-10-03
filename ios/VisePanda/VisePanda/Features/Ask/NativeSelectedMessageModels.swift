import Foundation

struct NativeSelectedSources: Codable, Equatable {
    struct Artifact: Codable, Equatable { let artifactId: String; let revision: Int }
    struct Trip: Codable, Equatable { let tripId: String; let headVersion: Int }
    struct Evidence: Codable, Equatable {
        let factId: String; let assertionId: String; let assertionRevision: Int; let city: String; let scene: String
    }
    var artifact: Artifact? = nil; var trip: Trip? = nil; var evidence: [Evidence] = []
    var empty: Bool { artifact == nil && trip == nil && evidence.isEmpty }
    var valid: Bool {
        (artifact == nil || (UUID(uuidString: artifact!.artifactId) != nil && (1...1000).contains(artifact!.revision)))
        && (trip == nil || (UUID(uuidString: trip!.tripId) != nil && (0...999_999_999).contains(trip!.headVersion)))
        && evidence.count <= 3 && Set(evidence.compactMap { UUID(uuidString: $0.factId) }).count == evidence.count
        && evidence.allSatisfy { UUID(uuidString: $0.factId) != nil && UUID(uuidString: $0.assertionId) != nil
            && (1...999_999_999).contains($0.assertionRevision) && NativeTravelIntake.text($0.city, max: 80) && NativeTravelIntake.text($0.scene, max: 80) }
    }
    enum CodingKeys: String, CodingKey { case artifact, trip, evidence }
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(artifact, forKey: .artifact); try c.encode(trip, forKey: .trip); try c.encode(evidence, forKey: .evidence)
    }
}
struct NativeSelectedMessageRequest: Encodable, Equatable {
    let schemaVersion = "assistant-message-sources/2"
    let conversationId: String; let messageId: String; let idempotencyKey: String; let policyId: String
    let locale: String; let text: String; let relationship: String; let goalId: String?; let expectedGoalVersion: Int?
    let parentMessageId: String?; let turnId: String?; let selectedSources: NativeSelectedSources
    enum CodingKeys: String, CodingKey, CaseIterable {
        case schemaVersion, conversationId, messageId, idempotencyKey, policyId, locale, text, relationship, goalId, expectedGoalVersion, taskId, parentMessageId, turnId, selectedSources
    }
    var valid: Bool {
        [conversationId, messageId, idempotencyKey, policyId].allSatisfy { UUID(uuidString: $0) != nil }
        && ["zh", "en"].contains(locale) && NativeTravelIntake.text(text, max: 4000) && selectedSources.valid
        && ["independent_question", "goal_start", "follow_up", "amendment", "clarification"].contains(relationship)
        && (goalId == nil || UUID(uuidString: goalId!) != nil) && (parentMessageId == nil || UUID(uuidString: parentMessageId!) != nil)
        && (turnId == nil || UUID(uuidString: turnId!) != nil)
        && (expectedGoalVersion == nil || (1...10000).contains(expectedGoalVersion!))
        && (relationship == "goal_start" ? goalId != nil && expectedGoalVersion == nil && parentMessageId == nil && turnId == nil
            : relationship == "independent_question" ? goalId == nil && expectedGoalVersion == nil && parentMessageId == nil && turnId != nil
            : goalId != nil && expectedGoalVersion != nil && parentMessageId != nil && turnId == nil)
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(schemaVersion, forKey: .schemaVersion); try c.encode(conversationId, forKey: .conversationId)
        try c.encode(messageId, forKey: .messageId); try c.encode(idempotencyKey, forKey: .idempotencyKey); try c.encode(policyId, forKey: .policyId)
        try c.encode(locale, forKey: .locale); try c.encode(text, forKey: .text); try c.encode(relationship, forKey: .relationship)
        try c.encode(goalId, forKey: .goalId); try c.encode(expectedGoalVersion, forKey: .expectedGoalVersion); try c.encodeNil(forKey: .taskId)
        try c.encode(parentMessageId, forKey: .parentMessageId); try c.encode(turnId, forKey: .turnId); try c.encode(selectedSources, forKey: .selectedSources)
    }
}
struct NativeSelectedContextRequest: Encodable, Equatable {
    let conversationId: String; let goalId: String; let messageId: String; let expectedGoalVersion: Int; let memoryIds: [String]
    var valid: Bool { [conversationId,goalId,messageId].allSatisfy { UUID(uuidString: $0) != nil } && (1...10000).contains(expectedGoalVersion)
        && memoryIds.count <= 3 && Set(memoryIds.compactMap(UUID.init(uuidString:))).count == memoryIds.count }
}
/// Capture carries version identities, not a grant. UI uses the fresh context manifest for purpose/currentness.
struct NativeSelectedMessageAccepted {
    let conversationID: String; let messageID: String; let sequence: Int
    let goalID: String?; let scopeVersion: Int?; let turnID: String?; let reused: Bool
    let captured: NativeSelectedSources
    static func decode(_ data: Data) throws -> Self {
        guard data.count <= 32_000, let r = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              Set(r.keys) == Set(["version","kind","conversationId","messageId","sequence","goalId","scopeVersion","turnId","reused","selectedSources","readyForProvider"]),
              r["version"] as? Int == 6, r["kind"] as? String == "accepted", r["readyForProvider"] as? Bool == false,
              let conversation = r["conversationId"] as? String, let message = r["messageId"] as? String,
              let sequence = r["sequence"] as? Int, (1...1_000_000).contains(sequence), let reused = r["reused"] as? Bool,
              let sources = r["selectedSources"] as? [String: Any], Set(sources.keys) == Set(["artifact","trip","evidence"]) else { throw NativeDataError.invalidResponse }
        func optionalUUID(_ key: String) throws -> String? {
            if r[key] is NSNull { return nil }; guard let id = r[key] as? String, UUID(uuidString: id) != nil else { throw NativeDataError.invalidResponse }; return id
        }
        var captured = NativeSelectedSources()
        if !(sources["artifact"] is NSNull) {
            guard let a = sources["artifact"] as? [String: Any], let id = a["artifactId"] as? String, let rev = a["revision"] as? Int else { throw NativeDataError.invalidResponse }
            guard Set(a.keys) == Set(["artifactId","revision","originGoalId","originGoalVersion","source","memoryVersions","proposal","purpose","captured"]),
                  a["captured"] as? Bool == true, a["proposal"] is Bool,
                  ["selected_result_reference","previous_result_reference"].contains(a["purpose"] as? String ?? ""),
                  let origin = a["originGoalId"] as? String, UUID(uuidString: origin) != nil,
                  let version = a["originGoalVersion"] as? Int, (1...10001).contains(version),
                  let source = a["source"] as? [String: Any],
                  let memories = a["memoryVersions"] as? [[String: Any]], memories.count <= 3,
                  memories.allSatisfy({ Set($0.keys) == Set(["id","revision","consentId","state"]) && UUID(uuidString: $0["id"] as? String ?? "") != nil
                    && UUID(uuidString: $0["consentId"] as? String ?? "") != nil && ["explicit","confirmed"].contains($0["state"] as? String ?? "")
                    && ($0["revision"] as? Int).map({(1...999_999_999_999_999).contains($0)}) == true }) else { throw NativeDataError.invalidResponse }
            let originRecord = try JSONDecoder().decode(NativeResultSource.self, from: JSONSerialization.data(withJSONObject: source))
            guard originRecord.complete else { throw NativeDataError.invalidResponse }
            captured.artifact = .init(artifactId: id, revision: rev)
        }
        if !(sources["trip"] is NSNull) {
            guard let t = sources["trip"] as? [String: Any], let id = t["tripId"] as? String, let head = t["headVersion"] as? Int else { throw NativeDataError.invalidResponse }
            guard Set(t.keys) == Set(["tripId","headVersion","purpose"]), t["purpose"] as? String == "current_trip_reference" else { throw NativeDataError.invalidResponse }
            captured.trip = .init(tripId: id, headVersion: head)
        }
        guard let evidence = sources["evidence"] as? [[String: Any]] else { throw NativeDataError.invalidResponse }
        captured.evidence = try evidence.map { e in
            guard let id=e["factId"] as? String, let assertion=e["assertionId"] as? String, let revision=e["assertionRevision"] as? Int,
                  let city=e["city"] as? String, let scene=e["scene"] as? String else { throw NativeDataError.invalidResponse }
            guard Set(e.keys) == Set(["factId","assertionId","assertionRevision","city","scene","publishedAt","expiresAt","sourceRevisionIds","recipient"]),
                  e["recipient"] as? String == "first_party", let published = e["publishedAt"] as? String, Self.date(published) != nil,
                  e["expiresAt"] is NSNull || (e["expiresAt"] as? String).flatMap(Self.date) != nil,
                  let revisions = e["sourceRevisionIds"] as? [String], revisions.count <= 32, revisions.allSatisfy({UUID(uuidString:$0) != nil}) else { throw NativeDataError.invalidResponse }
            return .init(factId:id,assertionId:assertion,assertionRevision:revision,city:city,scene:scene)
        }
        let scope = r["scopeVersion"] is NSNull ? nil : r["scopeVersion"] as? Int
        guard UUID(uuidString: conversation) != nil, UUID(uuidString: message) != nil, captured.valid,
              r["scopeVersion"] is NSNull || scope.map({(1...10000).contains($0)}) == true else { throw NativeDataError.invalidResponse }
        return .init(conversationID:conversation,messageID:message,sequence:sequence,goalID:try optionalUUID("goalId"),scopeVersion:scope,turnID:try optionalUUID("turnId"),reused:reused,captured:captured)
    }
    private static func date(_ value: String) -> Date? {
        let f=ISO8601DateFormatter(); f.formatOptions=[.withInternetDateTime,.withFractionalSeconds]
        if let date=f.date(from:value) { return date }; f.formatOptions=[.withInternetDateTime]; return f.date(from:value)
    }
    func matches(_ request: NativeSelectedMessageRequest) -> Bool {
        conversationID == request.conversationId && messageID == request.messageId && goalID == request.goalId && turnID == request.turnId
            && captured == request.selectedSources
            && (request.relationship == "goal_start" ? scopeVersion == 1 : request.expectedGoalVersion.map { scopeVersion == $0 + (request.relationship == "amendment" ? 1 : 0) } ?? (scopeVersion == nil))
    }
}

struct NativeSelectedContextManifest: Decodable {
    struct Source: Decodable {
        let id: String; let kind: String; let sourceVersion: String
        let purpose: String?; let recipient: String?; let artifactId: String?; let revision: Int?; let originGoalVersion: Int?; let current: Bool?
    }
    struct Metadata: Decodable {
        let contextVersion: String; let compactionVersion: String; let sourceRefs: [Source]; let sourceVersions: [String]
        let omittedReasons: [String]; let sectionTokenCounts: [String:Int]; let totalTokens: Int; let contentHashes: [String]
    }
    let version: Int; let kind: String; let schemaVersion: String
    let conversationId: String; let goalId: String; let goalScopeVersion: Int; let messageId: String; let messageSequence: Int
    let selectedMemoryCount: Int; let readyForProvider: Bool; let context: Metadata
    static func decode(_ data: Data) throws -> Self {
        guard data.count <= 64_000, let root = try JSONSerialization.jsonObject(with:data) as? [String:Any],
              Set(root.keys) == Set(["version","kind","schemaVersion","conversationId","goalId","goalScopeVersion","messageId","messageSequence","selectedMemoryCount","readyForProvider","context"]),
              let meta = root["context"] as? [String:Any], Set(meta.keys) == Set(["contextVersion","compactionVersion","sourceRefs","sourceVersions","omittedReasons","sectionTokenCounts","totalTokens","contentHashes"]),
              let refs = meta["sourceRefs"] as? [[String:Any]], refs.count <= 64 else { throw NativeDataError.invalidResponse }
        let sections = Set(["system","policy","constraints","trip","proposal","memory","evidence","tool","thread","user_message"])
        for r in refs {
            let extra = Set(r.keys).subtracting(["id","kind","sourceVersion"])
            guard Set(r.keys).isSuperset(of:["id","kind","sourceVersion"]), extra.isSubset(of:["purpose","recipient","artifactId","revision","originGoalVersion","current"]) else { throw NativeDataError.invalidResponse }
        }
        let v = try JSONDecoder().decode(Self.self,from:data)
        guard v.version == 6, v.kind == "context_manifest", v.schemaVersion == "assistant-goal-context/2", !v.readyForProvider,
              [v.conversationId,v.goalId,v.messageId].allSatisfy({UUID(uuidString:$0) != nil}), (1...10000).contains(v.goalScopeVersion),
              (1...1_000_000).contains(v.messageSequence), (0...3).contains(v.selectedMemoryCount),
              v.context.contextVersion == "assistant-selected-source-context-plan/2", v.context.compactionVersion == "context-compaction-v1",
              Set(v.context.sectionTokenCounts.keys) == sections, v.context.sectionTokenCounts.values.allSatisfy({(0...9_700).contains($0)}),
              (1...9_700).contains(v.context.totalTokens), v.context.sourceVersions.count <= 64, v.context.contentHashes.count <= 64,
              v.context.contentHashes.allSatisfy(NativeQualifiedDelegationRPC.digest), v.context.omittedReasons.count <= 100 else { throw NativeDataError.invalidResponse }
        for s in v.context.sourceRefs {
            guard sections.union(["user_artifact"]).contains(s.kind), !s.id.isEmpty, s.id.utf16.count <= 120, !s.sourceVersion.isEmpty, s.sourceVersion.utf16.count <= 8192,
                  s.recipient == nil || s.recipient == "first_party" else { throw NativeDataError.invalidResponse }
            if s.artifactId != nil {
                guard UUID(uuidString:s.artifactId!) != nil, s.revision.map({(1...1000).contains($0)}) == true,
                      s.originGoalVersion.map({(1...10001).contains($0)}) == true, s.recipient == "first_party", s.current != nil else { throw NativeDataError.invalidResponse }
                if s.purpose == "previous_result_reference" { guard s.kind == "thread", s.current == false else { throw NativeDataError.invalidResponse } }
                else { guard s.purpose == "current_context", s.current == true else { throw NativeDataError.invalidResponse } }
            } else if s.purpose == "previous_result_reference" { throw NativeDataError.invalidResponse }
        }
        return v
    }
    func matches(_ request: NativeSelectedContextRequest) -> Bool {
        conversationId == request.conversationId && goalId == request.goalId && messageId == request.messageId && goalScopeVersion == request.expectedGoalVersion
    }
}
