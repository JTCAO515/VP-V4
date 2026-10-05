import Foundation

struct NativeExperienceCommand: Equatable {
    let body: Data
    let action: String
    let operationID: String
    let publicationID: String?
    let submissionID: String?
    let referenceID: String?
    init(body: Data) throws {
        guard body.count <= 24_000, let utf8 = String(data: body, encoding: .utf8), utf8.utf16.count <= 10_000,
              let v = try JSONSerialization.jsonObject(with: body) as? [String: Any], let action = v["action"] as? String,
              NativeExperienceWire.actions.contains(action) else { throw NativeDataError.invalidResponse }
        let w = NativeCommunityWire.self, e = NativeExperienceWire.self
        self.body = body; self.action = action; operationID = try w.id(v["operationId"])
        publicationID = v["publicationId"].map { _ in try? w.id(v["publicationId"]) } ?? nil
        submissionID = v["submissionId"].map { _ in try? w.id(v["submissionId"]) } ?? nil
        referenceID = v["referenceId"].map { _ in try? w.id(v["referenceId"]) } ?? nil
        var keys: Set<String> = ["action", "operationId"]
        switch action {
        case "delete":
            keys.insert("confirmed"); guard try w.bool(v["confirmed"]) else { throw NativeDataError.invalidResponse }
        case "unsave":
            keys.formUnion(["referenceId", "expectedReferenceVersion"])
            _ = try w.id(v["referenceId"]); guard try e.revision(v["expectedReferenceVersion"], minimum: 1) == 1 else { throw NativeDataError.invalidResponse }
        default:
            keys.formUnion(["publicationId"]); _ = try w.id(v["publicationId"])
            if ["withdraw", "revoke"].contains(action) {
                keys.insert("expectedPublicationVersion"); _ = try e.revision(v["expectedPublicationVersion"], minimum: 1)
            } else {
                keys.formUnion(["expectedSubmissionVersion", "expectedSafetyVersion"])
                _ = try e.revision(v["expectedSubmissionVersion"], minimum: 1); _ = try e.revision(v["expectedSafetyVersion"])
                if action == "requestPublication" {
                    keys.formUnion(["submissionId", "previewDigest", "consent", "rightsDeclaration"])
                    _ = try w.id(v["submissionId"]); _ = try w.hash(v["previewDigest"])
                    guard v["consent"] as? String == "controlled-preview-v1", v["rightsDeclaration"] as? String == "own-text-v1" else { throw NativeDataError.invalidResponse }
                } else {
                    keys.insert("expectedPublicationVersion"); _ = try e.revision(v["expectedPublicationVersion"], minimum: 1)
                    if action == "rightsReview" {
                        keys.formUnion(["decision", "note"])
                        guard ["approve", "reject"].contains(v["decision"] as? String ?? "") else { throw NativeDataError.invalidResponse }
                        _ = try w.text(v["note"], max: 400)
                    } else if action == "save" { keys.insert("referenceId"); _ = try w.id(v["referenceId"]) }
                }
            }
        }
        _ = try w.object(v, keys)
    }
    static func request(_ preview: NativeExperiencePreview) throws -> Self {
        let o = preview.object
        return try make(["action": "requestPublication", "publicationId": UUID().uuidString.lowercased(), "submissionId": o.id,
                         "expectedSubmissionVersion": o.submissionVersion, "expectedSafetyVersion": o.safetyVersion,
                         "previewDigest": preview.digest, "consent": "controlled-preview-v1", "rightsDeclaration": "own-text-v1"])
    }
    static func publish(_ publication: NativeExperiencePublication) throws -> Self {
        guard publication.state == "rights_approved" else { throw NativeDataError.invalidResponse }
        return try make(["action": "publish", "publicationId": publication.id, "expectedPublicationVersion": publication.version,
                         "expectedSubmissionVersion": publication.submissionVersion, "expectedSafetyVersion": publication.safetyVersion])
    }
    static func withdraw(_ publication: NativeExperiencePublication) throws -> Self {
        guard ["pending_rights", "rights_approved", "rights_rejected", "published"].contains(publication.state) else { throw NativeDataError.invalidResponse }
        return try make(["action": "withdraw", "publicationId": publication.id, "expectedPublicationVersion": publication.version])
    }
    static func save(_ experience: NativeExperience) throws -> Self {
        try make(["action": "save", "publicationId": experience.id, "expectedSubmissionVersion": experience.submissionVersion,
                  "expectedSafetyVersion": experience.safetyVersion, "expectedPublicationVersion": experience.publicationVersion,
                  "referenceId": UUID().uuidString.lowercased()])
    }
    static func unsave(_ reference: NativeExperienceSaved) throws -> Self {
        guard reference.state == "saved", reference.version == 1 else { throw NativeDataError.invalidResponse }
        return try make(["action": "unsave", "referenceId": reference.id, "expectedReferenceVersion": reference.version])
    }
    static func delete() throws -> Self { try make(["action": "delete", "confirmed": true]) }
    private static func make(_ input: [String: Any]) throws -> Self {
        var v = input; v["operationId"] = UUID().uuidString.lowercased()
        return try .init(body: NativeCommunityWire.bytes(v))
    }
    func recovery(abandon: Bool = false) throws -> Data {
        guard let original = String(data: body, encoding: .utf8) else { throw NativeDataError.invalidResponse }
        let bytes = try NativeCommunityWire.bytes(["action": abandon ? "abandon" : "operation", "operationId": operationID, "mutationBytes": original])
        guard bytes.count <= 49_152 else { throw NativeDataError.invalidResponse }; return bytes
    }
}

struct NativeExperienceInput {
    let value: [String: Any]
    let action: String
    let mutation: NativeExperienceCommand?
    let recovery: NativeExperienceCommand?
    static let forbidden = ["rightsReview", "publish", "revoke", "queue", "inspect"]
    init(body: Data) throws {
        guard body.count <= 49_152, let utf8 = String(data: body, encoding: .utf8),
              let v = try JSONSerialization.jsonObject(with: body) as? [String: Any], let action = v["action"] as? String else { throw NativeDataError.invalidResponse }
        let w = NativeCommunityWire.self
        guard !Self.forbidden.contains(action) else { throw NativeDataError.invalidResponse }
        value = v; self.action = action
        if NativeExperienceWire.actions.contains(action) { mutation = try .init(body: body); recovery = nil; return }
        mutation = nil
        if ["operation", "abandon"].contains(action) {
            _ = try w.object(v, ["action", "operationId", "mutationBytes"])
            let original = try w.text(v["mutationBytes"], max: 10_000), command = try NativeExperienceCommand(body: Data(original.utf8))
            guard !Self.forbidden.contains(command.action), try w.id(v["operationId"]) == command.operationID else { throw NativeDataError.invalidResponse }
            recovery = command; return
        }
        recovery = nil
        guard body.count <= 24_000, utf8.utf16.count <= 10_000 else { throw NativeDataError.invalidResponse }
        switch action {
        case "session", "export": _ = try w.object(v, ["action"])
        case "preview": _ = try w.object(v, ["action", "submissionId"]); _ = try w.id(v["submissionId"])
        case "detail", "inspect": _ = try w.object(v, ["action", "publicationId"]); _ = try w.id(v["publicationId"])
        case "reference": _ = try w.object(v, ["action", "referenceId"]); _ = try w.id(v["referenceId"])
        case "mine", "queue", "saved": _ = try w.object(v, ["action", "cursor"]); _ = try w.optional(v["cursor"], w.id)
        case "list": _ = try w.object(v, ["action", "cursor", "query"]); _ = try w.optional(v["cursor"], w.id); _ = try w.text(v["query"], max: 160, empty: true)
        default: throw NativeDataError.invalidResponse
        }
    }
}
