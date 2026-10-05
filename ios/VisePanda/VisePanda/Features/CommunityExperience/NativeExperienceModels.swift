import Foundation

enum NativeExperienceWire {
    static let schema = "community-publication-j3j4/1"
    static let actions = ["requestPublication", "rightsReview", "publish", "withdraw", "revoke", "save", "unsave", "delete"]
    static let retained = ["operation_fences", "publication_tombstones", "reference_tombstones", "audit_metadata"]
    static func revision(_ raw: Any?, minimum: Int = 0) throws -> Int { try NativeCommunityWire.integer(raw, max: 2_147_483_647, minimum: minimum) }
    static func audience(_ value: [String: Any]) throws {
        guard value["audience"] as? String == "controlled_registered",
              try NativeCommunityWire.bool(value["publiclyVisible"]) == false,
              try NativeCommunityWire.bool(value["retrievalEligible"]) == false else { throw NativeDataError.invalidResponse }
    }
    static func page(_ ids: [String], cursor: String?, complete: Bool) throws {
        guard complete == (cursor == nil), cursor == nil || ids.last == cursor,
              zip(ids, ids.dropFirst()).allSatisfy({ $0 < $1 }) else { throw NativeDataError.invalidResponse }
    }
}

struct NativeExperiencePublication: Identifiable, Equatable {
    let id: String
    let submissionID: String
    let submissionVersion: Int
    let safetyVersion: Int
    let version: Int
    let state: String
    let rightsDeclaration: String?
    let rightsNote: String?
    let createdAt: Date
    let publishedAt: Date?
    let endedAt: Date?
    init(_ raw: Any) throws {
        let w = NativeCommunityWire.self, e = NativeExperienceWire.self, d = NativeCommunitySafetyWire.dateValue
        let v = try w.object(raw, ["id", "submissionId", "submissionVersion", "safetyVersion", "version", "state", "rightsDeclaration", "rightsNote", "createdAt", "publishedAt", "endedAt", "audience", "publiclyVisible", "retrievalEligible"])
        id = try w.id(v["id"]); submissionID = try w.id(v["submissionId"])
        submissionVersion = try e.revision(v["submissionVersion"], minimum: 1); safetyVersion = try e.revision(v["safetyVersion"]); version = try e.revision(v["version"], minimum: 1)
        state = try w.text(v["state"], max: 24)
        rightsDeclaration = try w.optional(v["rightsDeclaration"]) { try w.text($0, max: 24) }
        rightsNote = try w.optional(v["rightsNote"]) { try w.text($0, max: 400) }
        createdAt = try d(v["createdAt"]); publishedAt = try w.optional(v["publishedAt"], d); endedAt = try w.optional(v["endedAt"], d)
        try e.audience(v)
        guard ["pending_rights", "rights_approved", "rights_rejected", "published", "withdrawn", "revoked", "invalidated", "erased"].contains(state),
              state == "erased" ? rightsDeclaration == nil && rightsNote == nil : rightsDeclaration == "own-text-v1" else { throw NativeDataError.invalidResponse }
        guard state != "published" || (publishedAt != nil && endedAt == nil),
              !["withdrawn", "revoked", "invalidated", "erased"].contains(state) || endedAt != nil else { throw NativeDataError.invalidResponse }
    }
}

struct NativeExperiencePlace: Equatable {
    let canonicalID: String
    let mappingDigest: String
    let label: String?
    init(_ raw: Any) throws {
        let w = NativeCommunityWire.self, v = try w.object(raw, ["canonicalPoiId", "mappingDigest", "label"])
        canonicalID = try w.id(v["canonicalPoiId"]); mappingDigest = try w.hash(v["mappingDigest"])
        label = try w.optional(v["label"]) { try w.text($0, max: 160) }
    }
}

struct NativeExperience: Identifiable, Equatable {
    let id: String
    let submissionID: String
    let submissionVersion: Int
    let safetyVersion: Int
    let publicationVersion: Int
    let title: String
    let content: String
    let kind: String
    let benefit: String
    let authorDisclosure: String
    let reviewerDisclosure: String?
    let source: String
    let canBlock: Bool
    let place: NativeExperiencePlace?
    let expiresAt: Date
    init(_ raw: Any) throws {
        let w = NativeCommunityWire.self, e = NativeExperienceWire.self
        let v = try w.object(raw, ["id", "submissionId", "submissionVersion", "safetyVersion", "publicationVersion", "title", "content", "contentKind", "benefitDisclosure", "authorDisclosure", "reviewerDisclosure", "source", "copyright", "rightsPurpose", "audience", "publiclyVisible", "retrievalEligible", "canReport", "canBlock", "place", "expiresAt"])
        id = try w.id(v["id"]); submissionID = try w.id(v["submissionId"])
        submissionVersion = try e.revision(v["submissionVersion"], minimum: 1); safetyVersion = try e.revision(v["safetyVersion"]); publicationVersion = try e.revision(v["publicationVersion"], minimum: 1)
        title = try w.text(v["title"], max: 160); content = try w.text(v["content"], max: 4000); kind = try w.text(v["contentKind"], max: 10)
        benefit = try w.text(v["benefitDisclosure"], max: 400, empty: true)
        authorDisclosure = try w.text(v["authorDisclosure"], max: 24); reviewerDisclosure = try w.optional(v["reviewerDisclosure"]) { try w.text($0, max: 24) }
        source = try w.text(v["source"], max: 20); canBlock = try w.bool(v["canBlock"])
        place = try w.optional(v["place"]) { try NativeExperiencePlace($0 as Any) }; expiresAt = try NativeCommunitySafetyWire.dateValue(v["expiresAt"])
        try e.audience(v)
        guard ["experience": "user_experience", "help": "user_help"][kind] == source,
              NativeCommunitySafetyWire.affiliations.contains(authorDisclosure), reviewerDisclosure == nil || NativeCommunitySafetyWire.affiliations.contains(reviewerDisclosure!),
              v["copyright"] as? String == "author_declared_own_text_independently_reviewed",
              v["rightsPurpose"] as? String == "controlled_experience_display", try w.bool(v["canReport"]) else { throw NativeDataError.invalidResponse }
    }
}

struct NativeExperienceSaved: Identifiable, Equatable {
    let id: String
    let publicationID: String?
    let submissionVersion: Int
    let safetyVersion: Int
    let publicationVersion: Int
    let version: Int
    let state: String
    let availability: String
    let experience: NativeExperience?
    let createdAt: Date
    let endedAt: Date?
    init(_ raw: Any) throws {
        let w = NativeCommunityWire.self, e = NativeExperienceWire.self, d = NativeCommunitySafetyWire.dateValue
        let v = try w.object(raw, ["id", "publicationId", "submissionVersion", "safetyVersion", "publicationVersion", "version", "state", "availability", "experience", "createdAt", "endedAt"])
        id = try w.id(v["id"]); publicationID = try w.optional(v["publicationId"], w.id)
        submissionVersion = try e.revision(v["submissionVersion"], minimum: 1); safetyVersion = try e.revision(v["safetyVersion"]); publicationVersion = try e.revision(v["publicationVersion"], minimum: 1)
        version = try e.revision(v["version"], minimum: 1); state = try w.text(v["state"], max: 10); availability = try w.text(v["availability"], max: 12)
        experience = try w.optional(v["experience"]) { try NativeExperience($0 as Any) }; createdAt = try d(v["createdAt"]); endedAt = try w.optional(v["endedAt"], d)
        guard ["saved", "unsaved", "erased"].contains(state), ["current", "unavailable"].contains(availability),
              state == "saved" ? version == 1 && endedAt == nil : version >= 2 && endedAt != nil,
              state != "erased" || publicationID == nil else { throw NativeDataError.invalidResponse }
        if availability == "unavailable" { guard experience == nil else { throw NativeDataError.invalidResponse } }
        else {
            guard state == "saved", let experience, experience.id == publicationID,
                  experience.submissionVersion == submissionVersion, experience.safetyVersion == safetyVersion,
                  experience.publicationVersion == publicationVersion else { throw NativeDataError.invalidResponse }
        }
    }
}

struct NativeExperiencePreview: Equatable {
    let object: NativeCommunitySafetyObject
    let digest: String
    let expiresAt: Date
    init(_ raw: Any) throws {
        let w = NativeCommunityWire.self, v = try w.object(raw, ["object", "previewDigest", "audience", "rightsDeclarationRequired", "expiresAt"])
        object = try NativeCommunitySafetyObject(v["object"] as Any); digest = try w.hash(v["previewDigest"])
        expiresAt = try NativeCommunitySafetyWire.dateValue(v["expiresAt"])
        guard v["audience"] as? String == "controlled_registered", v["rightsDeclarationRequired"] as? String == "own-text-v1",
              expiresAt == object.expiresAt else { throw NativeDataError.invalidResponse }
    }
}
