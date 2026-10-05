import Foundation

struct NativeTravelerBriefField: Identifiable, Equatable {
    struct Source: Equatable {
        let kind: String
        let id: String
        let revision: Int
        let updatedAt: Double
        let receiptID: String?
        let consentID: String?
        let basisDigest: String
    }
    enum Value: Equatable {
        case text(String)
        case budget(currency: String, minorUnits: Int)
        case requirements(city: String?, duration: Int?, party: Int?, interests: [String]?, start: String?, end: String?, mobility: [String]?)
    }
    let key: String
    let field: String
    let value: Value?
    let provenance: String?
    let source: Source?
    var id: String { key }
    var available: Bool { value != nil && source != nil && provenance == "explicit" }

    static func decode(_ raw: Any) throws -> Self {
        let w = NativeTravelerBriefWire.self
        guard let object = raw as? [String: Any], let field = object["field"] as? String,
              ["problem", "travel_pace", "preference", "budget", "requirements", "response_detail"].contains(field) else { throw NativeDataError.invalidResponse }
        let key = try w.key(object["key"])
        guard (field == "preference") == key.hasPrefix("memory:"), field == "preference" || key == field else { throw NativeDataError.invalidResponse }
        if object["state"] as? String == "unknown" {
            _ = try w.object(object, keys: ["key", "field", "state"])
            return .init(key: key, field: field, value: nil, provenance: nil, source: nil)
        }
        let v = try w.object(object, keys: ["key", "field", "state", "value", "provenance", "source"])
        guard v["state"] as? String == "available", v["provenance"] as? String == "explicit" else { throw NativeDataError.invalidResponse }
        let s = try w.object(v["source"], keys: ["kind", "id", "revision", "updatedAt", "receiptId", "consentId", "basisDigest"])
        let kind = try w.text(s["kind"], maximum: 20), id = try w.uuid(s["id"])
        let receipt = s["receiptId"] is NSNull ? nil : try w.uuid(s["receiptId"])
        let consent = s["consentId"] is NSNull ? nil : try w.uuid(s["consentId"])
        let source = Source(kind: kind, id: id, revision: try w.integer(s["revision"]), updatedAt: try w.timestamp(s["updatedAt"]),
                            receiptID: receipt, consentID: consent, basisDigest: try w.digest(s["basisDigest"]))
        switch field {
        case "problem": guard kind == "case", receipt == nil, consent == nil else { throw NativeDataError.invalidResponse }
        case "preference": guard kind == "memory", id == String(key.dropFirst(7)), receipt != nil, consent != nil else { throw NativeDataError.invalidResponse }
        case "travel_pace": guard (kind == "profile_pace" && receipt != nil && consent == nil) || (kind == "intake" && receipt != nil && consent != nil) else { throw NativeDataError.invalidResponse }
        default: guard ["budget", "requirements"].contains(field), kind == "intake", receipt != nil, consent != nil else { throw NativeDataError.invalidResponse }
        }
        return .init(key: key, field: field, value: try decodeValue(v["value"], field: field), provenance: "explicit", source: source)
    }

    private static func decodeValue(_ raw: Any?, field: String) throws -> Value {
        let w = NativeTravelerBriefWire.self
        if ["problem", "preference", "travel_pace"].contains(field) {
            let value = try w.text(raw, maximum: field == "problem" ? 1000 : 500)
            guard field != "travel_pace" || ["relaxed", "balanced", "packed", "fast"].contains(value) else { throw NativeDataError.invalidResponse }
            return .text(value)
        }
        if field == "budget" {
            let value = try w.object(raw, keys: ["currency", "perNightMinorUnits"])
            let currency = try w.text(value["currency"], maximum: 3)
            guard ["CNY", "USD", "EUR", "GBP"].contains(currency) else { throw NativeDataError.invalidResponse }
            return .budget(currency: currency, minorUnits: try w.integer(value["perNightMinorUnits"], maximum: 10_000_000, minimum: 1))
        }
        guard field == "requirements" else { throw NativeDataError.invalidResponse }
        let value = try w.object(raw, keys: ["city", "durationDays", "partySize", "interests", "dates", "mobilityConstraints"])
        let city = value["city"] is NSNull ? nil : try w.text(value["city"], maximum: 80)
        let duration = value["durationDays"] is NSNull ? nil : try w.integer(value["durationDays"], maximum: 30, minimum: 1)
        let party = value["partySize"] is NSNull ? nil : try w.integer(value["partySize"], maximum: 10, minimum: 1)
        let interests = try strings(value["interests"], count: 8, length: 20), mobility = try strings(value["mobilityConstraints"], count: 6, length: 120)
        guard interests?.allSatisfy({ ["food", "photography", "culture", "nature"].contains($0) }) ?? true else { throw NativeDataError.invalidResponse }
        var start: String?, end: String?
        if !(value["dates"] is NSNull) {
            let dates = try w.object(value["dates"], keys: ["startDate", "endDate"])
            let a = try w.text(dates["startDate"], maximum: 10), b = try w.text(dates["endDate"], maximum: 10)
            guard let first = date(a), let last = date(b), last >= first, last.timeIntervalSince(first) <= 30 * 86400 else { throw NativeDataError.invalidResponse }
            start = a; end = b
        }
        return .requirements(city: city, duration: duration, party: party, interests: interests, start: start, end: end, mobility: mobility)
    }
    private static func strings(_ raw: Any?, count: Int, length: Int) throws -> [String]? {
        if raw is NSNull { return nil }
        guard let rows = raw as? [Any], rows.count <= count else { throw NativeDataError.invalidResponse }
        let values = try rows.map { try NativeTravelerBriefWire.text($0, maximum: length) }
        guard Set(values).count == values.count else { throw NativeDataError.invalidResponse }; return values
    }
    private static func date(_ raw: String) -> Date? {
        guard raw.range(of: "^\\d{4}-\\d{2}-\\d{2}$", options: .regularExpression) != nil else { return nil }
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.timeZone = TimeZone(secondsFromGMT: 0); f.dateFormat = "yyyy-MM-dd"; f.isLenient = false
        guard let value = f.date(from: raw), f.string(from: value) == raw else { return nil }; return value
    }
}

struct NativeTravelerBriefSnapshot: Equatable {
    let kind: String
    let caseID: String
    let ownerID: String
    let recipientID: String
    let grantRevision: Int
    let category: String
    let revision: Int
    let sourceDigest: String
    let expiresAt: Double
    let updatedAt: Double
    let previewID: String?
    let fields: [NativeTravelerBriefField]

    init(raw: Any, actor: NativeDataScope, caseID: String) throws {
        let w = NativeTravelerBriefWire.self
        guard let value = raw as? [String: Any], let kind = value["kind"] as? String, ["preview", "brief"].contains(kind) else { throw NativeDataError.invalidResponse }
        let base: Set<String> = ["schemaVersion", "kind", "caseId", "ownerId", "recipientId", "grantRevision", "purpose", "category", "revision", "sourceDigest", "expiresAt", "fields", "noticeVersion"]
        let v = try w.object(value, keys: base.union(kind == "preview" ? ["previewId", "createdAt"] : ["updatedAt"]))
        guard v["schemaVersion"] as? String == w.version, v["noticeVersion"] as? String == w.notice,
              v["purpose"] as? String == "case_assistance", let category = v["category"] as? String,
              ["transport", "accommodation", "on_trip", "general"].contains(category),
              let rows = v["fields"] as? [Any], rows.count <= 8 else { throw NativeDataError.invalidResponse }
        let owner = try w.uuid(v["ownerId"]), recipient = try w.uuid(v["recipientId"]), actualCase = try w.uuid(v["caseId"])
        guard actualCase == caseID, owner == actor.subject.lowercased(), owner != recipient else { throw NativeDataError.invalidResponse }
        let revision = try w.integer(v["revision"]), grant = try w.integer(v["grantRevision"])
        let updated = try w.timestamp(v[kind == "preview" ? "createdAt" : "updatedAt"]), expiry = try w.timestamp(v["expiresAt"])
        guard expiry > updated, kind != "preview" || expiry - updated <= 300_000 else { throw NativeDataError.invalidResponse }
        let fields = try rows.map(NativeTravelerBriefField.decode)
        guard Set(fields.map(\.key)).count == fields.count,
              kind != "brief" || (!fields.isEmpty && fields.allSatisfy(\.available)),
              fields.allSatisfy({ field in
                  guard let source = field.source else { return true }
                  if source.kind == "case" { return source.id == caseID && source.revision == grant }
                  if source.kind == "profile_pace" { return source.id == owner }
                  return true
              }) else { throw NativeDataError.invalidResponse }
        self.kind = kind; self.caseID = actualCase; ownerID = owner; recipientID = recipient; grantRevision = grant; self.category = category
        self.revision = revision; sourceDigest = try w.digest(v["sourceDigest"]); expiresAt = expiry; updatedAt = updated
        previewID = kind == "preview" ? try w.uuid(v["previewId"]) : nil; self.fields = fields
    }
    func boundary(actor: NativeDataScope) -> NativeTravelerBriefSelection.Boundary {
        .init(actor: actor, caseID: caseID, purpose: "case_assistance", recipientID: recipientID,
              grantRevision: grantRevision, briefRevision: revision, sourceFrontier: sourceDigest)
    }
}
