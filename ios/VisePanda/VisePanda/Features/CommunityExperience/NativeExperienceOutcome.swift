import Foundation

enum NativeExperienceOutcome {
    case session
    case preview(NativeExperiencePreview)
    case detail(NativeExperience)
    case publication(NativeExperiencePublication)
    case reference(NativeExperienceSaved)
    case list([NativeExperience], cursor: String?, complete: Bool)
    case publications([NativeExperiencePublication], cursor: String?, complete: Bool)
    case saved([NativeExperienceSaved], cursor: String?, complete: Bool)
    case operation(String, state: String, publication: NativeExperiencePublication?, reference: NativeExperienceSaved?)
    case deleted(String)
    case export(Data)

    static func decode(_ bytes: Data, actor: NativeCommunitySafetyActor) throws -> Self {
        guard bytes.count <= 1_000_000 else { throw NativeDataError.invalidResponse }
        let w = NativeCommunityWire.self, e = NativeExperienceWire.self
        let outer = try w.object(JSONSerialization.jsonObject(with: bytes), ["data"])
        guard let v = outer["data"] as? [String: Any] else { throw NativeDataError.invalidResponse }
        guard v["schemaVersion"] as? String == e.schema, try w.id(v["actorId"]) == actor.scope.subject.lowercased(),
              try w.id(v["sessionId"]) == actor.sessionID.lowercased() else { throw NativeDataError.staleSessionResponse }
        let base: Set<String> = ["schemaVersion", "kind", "actorId", "sessionId"]
        switch v["kind"] as? String {
        case "session": _ = try w.object(v, base); return .session
        case "preview": _ = try w.object(v, base.union(["preview"])); return try .preview(NativeExperiencePreview(v["preview"] as Any))
        case "detail": _ = try w.object(v, base.union(["experience"])); return try .detail(NativeExperience(v["experience"] as Any))
        case "publication": _ = try w.object(v, base.union(["publication"])); return try .publication(NativeExperiencePublication(v["publication"] as Any))
        case "reference": _ = try w.object(v, base.union(["reference"])); return try .reference(NativeExperienceSaved(v["reference"] as Any))
        case "list", "publications", "saved":
            let kind = v["kind"] as? String ?? "", key = kind == "list" ? "experiences" : kind == "saved" ? "references" : "publications"
            _ = try w.object(v, base.union([key, "nextCursor", "complete"]))
            let cursor = try w.optional(v["nextCursor"], w.id), complete = try w.bool(v["complete"])
            if kind == "list" {
                let values = try w.rows(v[key], max: 50, NativeExperience.init); try e.page(values.map(\.id), cursor: cursor, complete: complete)
                return .list(values, cursor: cursor, complete: complete)
            } else if kind == "saved" {
                let values = try w.rows(v[key], max: 50, NativeExperienceSaved.init); try e.page(values.map(\.id), cursor: cursor, complete: complete)
                return .saved(values, cursor: cursor, complete: complete)
            } else {
                let values = try w.rows(v[key], max: 50, NativeExperiencePublication.init); try e.page(values.map(\.id), cursor: cursor, complete: complete)
                return .publications(values, cursor: cursor, complete: complete)
            }
        case "operation":
            _ = try w.object(v, base.union(["operationId", "state", "publication", "reference"]))
            let id = try w.id(v["operationId"]), state = try w.text(v["state"], max: 10)
            let publication = try w.optional(v["publication"]) { try NativeExperiencePublication($0 as Any) }
            let reference = try w.optional(v["reference"]) { try NativeExperienceSaved($0 as Any) }
            guard ["absent", "committed", "abandoned"].contains(state),
                  state == "committed" ? !(publication != nil && reference != nil) : publication == nil && reference == nil else { throw NativeDataError.invalidResponse }
            return .operation(id, state: state, publication: publication, reference: reference)
        case "deleted":
            _ = try w.object(v, base.union(["operationId", "scope", "retained"]))
            guard v["scope"] as? String == "community_publication_module", v["retained"] as? [String] == e.retained else { throw NativeDataError.invalidResponse }
            return try .deleted(w.id(v["operationId"]))
        case "export":
            _ = try w.object(v, base.union(["scope", "coverage", "publications", "references", "authoredRightsReviews", "receipts", "audits", "qualification", "retained"]))
            guard v["scope"] as? String == "community_publication_module", v["coverage"] as? String == "complete_for_community_publication",
                  v["retained"] as? [String] == e.retained else { throw NativeDataError.invalidResponse }
            _ = try w.rows(v["publications"], max: 100, NativeExperiencePublication.init)
            let refs = try w.rows(v["references"], max: 100, NativeExperienceSaved.init)
            guard refs.allSatisfy({ $0.experience == nil && $0.availability == "unavailable" }) else { throw NativeDataError.invalidResponse }
            _ = try w.rows(v["authoredRightsReviews"], max: 100) { raw in
                let r = try w.object(raw, ["publicationId", "decision", "note", "createdAt"])
                _ = try w.id(r["publicationId"]); _ = try w.date(r["createdAt"]); _ = try w.optional(r["note"]) { try w.text($0, max: 400) }
                guard ["approve", "reject"].contains(r["decision"] as? String ?? "") else { throw NativeDataError.invalidResponse }; return true
            }
            _ = try w.rows(v["receipts"], max: 100) { raw in
                let r = try w.object(raw, ["operationId", "recordId", "action", "state", "digest"])
                _ = try w.id(r["operationId"]); _ = try w.optional(r["recordId"], w.id); _ = try w.hash(r["digest"])
                guard e.actions.contains(r["action"] as? String ?? ""), ["committed", "abandoned"].contains(r["state"] as? String ?? "") else { throw NativeDataError.invalidResponse }; return true
            }
            _ = try w.rows(v["audits"], max: 100) { raw in
                let r = try w.object(raw, ["recordId", "action", "createdAt"])
                _ = try w.optional(r["recordId"], w.id); _ = try w.date(r["createdAt"])
                guard e.actions.contains(r["action"] as? String ?? "") else { throw NativeDataError.invalidResponse }; return true
            }
            _ = try w.optional(v["qualification"]) { raw in
                let r = try w.object(raw as Any, ["rightsReviewer", "publisher"]); _ = try w.bool(r["rightsReviewer"]); _ = try w.bool(r["publisher"]); return true
            }
            return .export(bytes)
        default: throw NativeDataError.invalidResponse
        }
    }

    var experiences: [NativeExperience] {
        switch self {
        case .detail(let e): [e]
        case .list(let values, _, _): values
        case .reference(let ref): ref.experience.map { [$0] } ?? []
        case .saved(let refs, _, _): refs.compactMap(\.experience)
        case .operation(_, _, _, let ref): ref?.experience.map { [$0] } ?? []
        default: []
        }
    }
    func expiry(now: Date) -> Date {
        if case .preview(let preview) = self { return preview.expiresAt }
        return experiences.map(\.expiresAt).min() ?? now.addingTimeInterval(30)
    }
    func matches(_ input: NativeExperienceInput) throws -> Bool {
        let w = NativeCommunityWire.self, v = input.value
        switch (input.action, self) {
        case ("session", .session), ("export", .export): return true
        case ("preview", .preview(let p)): return try p.object.id == w.id(v["submissionId"])
        case ("detail", .detail(let e)): return try e.id == w.id(v["publicationId"])
        case ("inspect", .publication(let p)): return try p.id == w.id(v["publicationId"])
        case ("reference", .reference(let r)): return try r.id == w.id(v["referenceId"])
        case ("list", .list(let values, _, _)): return try afterCursor(values.map(\.id), value: v["cursor"])
        case ("saved", .saved(let values, _, _)): return try afterCursor(values.map(\.id), value: v["cursor"])
        case ("mine", .publications(let values, _, _)): return try afterCursor(values.map(\.id), value: v["cursor"])
        case ("queue", .publications(let values, _, _)): return try values.allSatisfy({ ["pending_rights", "rights_approved"].contains($0.state) }) && afterCursor(values.map(\.id), value: v["cursor"])
        default: break
        }
        guard let command = input.mutation ?? input.recovery else { return false }
        if case .deleted(let id) = self { return input.action == "delete" && id == command.operationID }
        guard case .operation(let id, let state, let publication, let reference) = self, id == command.operationID else { return false }
        if state != "committed" { return true }
        if command.action == "delete" { return publication == nil && reference == nil }
        if ["save", "unsave"].contains(command.action) {
            return publication == nil && (reference == nil || (reference?.id == command.referenceID && (command.action != "save" || reference?.publicationID == command.publicationID || reference?.state == "erased")))
        }
        return reference == nil && (publication == nil || (publication?.id == command.publicationID && (command.action != "requestPublication" || publication?.submissionID == command.submissionID)))
    }
    private func afterCursor(_ ids: [String], value: Any?) throws -> Bool {
        let cursor = try NativeCommunityWire.optional(value, NativeCommunityWire.id)
        return cursor == nil || ids.allSatisfy({ $0 > cursor! })
    }
}
