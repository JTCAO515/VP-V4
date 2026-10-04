import Foundation
import CoreFoundation

// Consumer source: 005513bb2396d0aeff66f917088401b1aafa7837 (SQL a11202f).
// The server owns digests and evidence qualification; local material is a locator only.
struct NativeReservationFields: Codable, Equatable {
    var kind = "lodging"
    var supplier = "other"
    var externalReference: String?
    var title = ""
    var startsAt: String?
    var endsAt: String?
    var timeZone: String?
    var address: String?
    var terms: String?
    var status = "unknown"
    static let keys = ["kind", "supplier", "externalReference", "title", "startsAt", "endsAt", "timeZone", "address", "terms", "status"]
    var object: [String: Any] {
        ["kind": kind, "supplier": supplier, "externalReference": externalReference as Any? ?? NSNull(),
         "title": title, "startsAt": startsAt as Any? ?? NSNull(), "endsAt": endsAt as Any? ?? NSNull(),
         "timeZone": timeZone as Any? ?? NSNull(), "address": address as Any? ?? NSNull(),
         "terms": terms as Any? ?? NSNull(), "status": status]
    }
    var valid: Bool {
        ["lodging", "transport", "activity", "other"].contains(kind)
        && ["booking", "trip", "official", "other"].contains(supplier)
        && NativeReservationWire.text(externalReference, max: 120)
        && NativeReservationWire.text(title, max: 160) && !title.isEmpty
        && NativeReservationWire.text(address, max: 500) && NativeReservationWire.text(terms, max: 2000)
        && NativeReservationWire.text(timeZone, max: 80)
        && (timeZone == nil || TimeZone(identifier: timeZone!) != nil)
        && (startsAt == nil || NativeReservationWire.date(startsAt!) != nil)
        && (endsAt == nil || NativeReservationWire.date(endsAt!) != nil)
        && (startsAt == nil || endsAt == nil || NativeReservationWire.date(endsAt!)! > NativeReservationWire.date(startsAt!)!)
        && ["reserved", "amended", "cancelled", "unknown"].contains(status)
    }
}

struct NativeReservationSource: Codable, Equatable {
    let kind: String
    let localMaterialId: String?
    let localContentHash: String?
    let locator: String?
    init(localMaterialId: String? = nil, localContentHash: String? = nil, locator: String? = nil) {
        kind = "user_reported"; self.localMaterialId = localMaterialId
        self.localContentHash = localContentHash; self.locator = locator
    }
    var object: [String: Any] {
        ["kind": kind, "localMaterialId": localMaterialId as Any? ?? NSNull(),
         "localContentHash": localContentHash as Any? ?? NSNull(), "locator": locator as Any? ?? NSNull()]
    }
    var valid: Bool {
        kind == "user_reported" && (localMaterialId == nil || NativeReservationWire.uuid(localMaterialId!))
        && (localContentHash == nil || NativeReservationWire.hash(localContentHash!))
        && NativeReservationWire.text(locator, max: 500)
    }
}

struct NativeReservationCommand: Codable, Equatable {
    let operationId: String
    let referenceId: String
    let expectedTripVersion: Int
    let expectedRevision: Int
    let fields: NativeReservationFields
    let source: NativeReservationSource
    let explicitlyConfirmed: Bool
    var object: [String: Any] {
        ["operationId": operationId, "referenceId": referenceId, "expectedTripVersion": expectedTripVersion,
         "expectedRevision": expectedRevision, "fields": fields.object, "source": source.object,
         "explicitlyConfirmed": explicitlyConfirmed]
    }
    var valid: Bool {
        NativeReservationWire.uuid(operationId) && NativeReservationWire.uuid(referenceId)
        && (0...999999999).contains(expectedTripVersion) && (0...9007199254740990).contains(expectedRevision)
        && fields.valid && source.valid && explicitlyConfirmed
    }
    func body(operation: String) throws -> Data {
        guard valid, ["preview", "confirm"].contains(operation) else { throw NativeDataError.invalidResponse }
        return try NativeReservationWire.encode(["operation": operation, "input": object])
    }
}

struct NativeReservationCurrent: Decodable, Identifiable {
    let kind: String
    let referenceId: String
    let tripId: String
    let tripVersion: Int
    let revision: Int
    let fields: NativeReservationFields
    let evidenceTier: String
    let source: NativeReservationSource
    let sourceQualification: String
    let confirmedBy: String
    let confirmedAt: String
    let contentDigest: String
    let sourceVersion: Int?
    let planningUse: String
    let tripMutation: String
    var id: String { referenceId }
    var valid: Bool {
        kind == "reservation_reference/1" && NativeReservationWire.uuid(referenceId) && NativeReservationWire.uuid(tripId)
        && (0...999999999).contains(tripVersion) && (1...9007199254740990).contains(revision)
        && fields.valid && source.valid && evidenceTier == "user_reported" && sourceQualification == "untrusted"
        && confirmedBy == "explicit_user" && NativeReservationWire.date(confirmedAt) != nil
        && NativeReservationWire.hash(contentDigest) && sourceVersion == nil
        && planningUse == "confirmed_reference_only" && tripMutation == "none"
    }
}

struct NativeReservationTarget: Equatable {
    let referenceId: String
    let revision: Int
}

struct NativeReservationPreview: Decodable {
    struct Match: Decodable { let referenceId: String; let revision: Int }
    struct Field: Decodable, Identifiable { let field: String; let before: String?; let after: String?; let state: String; var id: String { field } }
    let kind: String; let tripId: String; let tripVersion: Int; let referenceId: String
    let relation: String; let matches: [Match]; let fields: [Field]
    let originalLocator: String?; let sourceClaim: String; let evidenceTier: String
    let sourceAvailability: String; let requiresExplicitConfirmation: Bool; let tripMutation: String
}

enum NativeReservationWire {
    static func uuid(_ value: String) -> Bool { UUID(uuidString: value) != nil }
    static func hash(_ value: String) -> Bool { value.range(of: "^[0-9a-f]{64}$", options: .regularExpression) != nil }
    static func date(_ value: String) -> Date? {
        guard value.range(of: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,3})?(Z|[+-]\\d{2}:\\d{2})$", options: .regularExpression) != nil else { return nil }
        let format = ISO8601DateFormatter(); format.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = format.date(from: value) { return date }
        format.formatOptions = [.withInternetDateTime]; return format.date(from: value)
    }
    static func text(_ value: String?, max: Int) -> Bool {
        guard let value else { return true }
        return !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && value.utf16.count <= max
        && value.range(of: "[\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f]", options: .regularExpression) == nil
    }
    static func sameUUID(_ a: String, _ b: String) -> Bool { a.lowercased() == b.lowercased() }
    static func integer(_ value: Any?) -> Int? {
        guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(),
              number.doubleValue.isFinite, number.doubleValue.rounded(.towardZero) == number.doubleValue,
              (0...9007199254740990).contains(number.doubleValue) else { return nil }
        return number.intValue
    }
    static func boolean(_ value: Any?) -> Bool? {
        guard let number = value as? NSNumber, CFGetTypeID(number) == CFBooleanGetTypeID() else { return nil }
        return number.boolValue
    }
    // Swift String equality normalizes Unicode; the wire preserves original bytes.
    static func equal(_ a: Any, _ b: Any) -> Bool {
        if let a = a as? String, let b = b as? String { return a.utf8.elementsEqual(b.utf8) }
        if a is NSNull, b is NSNull { return true }
        if let a = a as? [String: Any], let b = b as? [String: Any] {
            return Set(a.keys) == Set(b.keys) && a.allSatisfy { key, value in equal(value, b[key]!) }
        }
        if let a = a as? [Any], let b = b as? [Any] { return a.count == b.count && zip(a, b).allSatisfy { equal($0.0, $0.1) } }
        if let a = a as? NSNumber, let b = b as? NSNumber { return a == b && CFGetTypeID(a) == CFGetTypeID(b) }
        return false
    }
    static func exact(_ value: Any, _ keys: [String]) throws -> [String: Any] {
        guard let row = value as? [String: Any], Set(row.keys) == Set(keys) else { throw NativeDataError.invalidResponse }
        return row
    }
    static func encode(_ object: [String: Any]) throws -> Data {
        let bytes = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
        guard bytes.count <= 16384 else { throw NativeDataError.invalidResponse }; return bytes
    }
    static func root(_ bytes: Data) throws -> Any {
        guard bytes.count <= 512000 else { throw NativeDataError.invalidResponse }
        let envelope = try exact(JSONSerialization.jsonObject(with: bytes), ["data"])
        return envelope["data"]!
    }
    static func decode<T: Decodable>(_ type: T.Type, _ value: Any) throws -> T {
        try JSONDecoder().decode(type, from: JSONSerialization.data(withJSONObject: value))
    }
    static func command(_ value: Any) throws -> NativeReservationCommand {
        let row = try exact(value, ["operationId", "referenceId", "expectedTripVersion", "expectedRevision", "fields", "source", "explicitlyConfirmed"])
        _ = try exact(row["fields"]!, NativeReservationFields.keys)
        _ = try exact(row["source"]!, ["kind", "localMaterialId", "localContentHash", "locator"])
        let result = try decode(NativeReservationCommand.self, row)
        guard result.valid else { throw NativeDataError.invalidResponse }; return result
    }
    static func current(_ value: Any) throws -> NativeReservationCurrent {
        let row = try exact(value, ["kind", "referenceId", "tripId", "tripVersion", "revision", "fields", "evidenceTier", "source", "sourceQualification", "confirmedBy", "confirmedAt", "contentDigest", "sourceVersion", "planningUse", "tripMutation"])
        _ = try exact(row["fields"]!, NativeReservationFields.keys)
        _ = try exact(row["source"]!, ["kind", "localMaterialId", "localContentHash", "locator"])
        let result = try decode(NativeReservationCurrent.self, row)
        guard result.valid else { throw NativeDataError.invalidResponse }; return result
    }
    static func preview(_ bytes: Data, trip: String, command input: NativeReservationCommand) throws -> NativeReservationPreview {
        let row = try exact(root(bytes), ["kind", "tripId", "tripVersion", "referenceId", "relation", "matches", "fields", "originalLocator", "sourceClaim", "evidenceTier", "sourceAvailability", "requiresExplicitConfirmation", "tripMutation"])
        guard let matches = row["matches"] as? [Any], let fields = row["fields"] as? [Any] else { throw NativeDataError.invalidResponse }
        for match in matches { _ = try exact(match, ["referenceId", "revision"]) }
        for field in fields { _ = try exact(field, ["field", "before", "after", "state"]) }
        let result = try decode(NativeReservationPreview.self, row)
        guard result.kind == "reservation_preview/1", result.tripId == trip, result.tripVersion == input.expectedTripVersion,
              result.referenceId == input.referenceId, ["new", "duplicate", "change", "conflict"].contains(result.relation),
              result.fields.map(\.field) == NativeReservationFields.keys, result.matches.count <= 100,
              result.matches.allSatisfy({ uuid($0.referenceId) && (1...9007199254740990).contains($0.revision) }),
              result.fields.allSatisfy({ ["added", "duplicate", "conflict"].contains($0.state) && equal($0.after as Any? ?? NSNull(), input.fields.object[$0.field]!) }),
              equal(result.originalLocator as Any? ?? NSNull(), input.source.locator as Any? ?? NSNull()),
              result.sourceClaim == "user_reported", result.evidenceTier == "user_reported", result.sourceAvailability == "user_reported_only",
              result.requiresExplicitConfirmation, result.tripMutation == "none" else { throw NativeDataError.invalidResponse }
        return result
    }
    static func confirmation(_ bytes: Data, trip: String, input: NativeReservationCommand) throws -> NativeReservationCurrent {
        let row = try exact(root(bytes), ["kind", "operationId", "tripId", "referenceId", "resultRevision", "commandDigest", "command", "receipt"])
        let echo = try command(row["command"]!); let receipt = try current(row["receipt"]!)
        guard row["kind"] as? String == "reservation_confirmation/1", sameUUID(row["operationId"] as? String ?? "", input.operationId),
              row["tripId"] as? String == trip, sameUUID(row["referenceId"] as? String ?? "", input.referenceId),
              hash(row["commandDigest"] as? String ?? ""), equal(echo.object, input.object),
              integer(row["resultRevision"]) == input.expectedRevision + 1,
              receipt.tripId == trip, sameUUID(receipt.referenceId, input.referenceId), receipt.revision == input.expectedRevision + 1,
              receipt.tripVersion == input.expectedTripVersion, equal(receipt.fields.object, input.fields.object), equal(receipt.source.object, input.source.object)
        else { throw NativeDataError.invalidResponse }; return receipt
    }
    struct Operation { let current: NativeReservationCurrent; let superseded: Bool; let digest: String }
    static func operation(_ bytes: Data, trip: String, input: NativeReservationCommand) throws -> Operation {
        let row = try exact(root(bytes), ["kind", "operationId", "tripId", "referenceId", "appliedRevision", "currentRevision", "commandDigest", "command", "result", "receipt", "current", "tripMutation"])
        let latest = try current(row["current"]!)
        guard row["kind"] as? String == "reservation_operation/1", sameUUID(row["operationId"] as? String ?? "", input.operationId),
              row["tripId"] as? String == trip, sameUUID(row["referenceId"] as? String ?? "", input.referenceId),
              latest.tripId == trip, latest.referenceId == row["referenceId"] as? String,
              let applied = integer(row["appliedRevision"]), applied == input.expectedRevision + 1,
              integer(row["currentRevision"]) == latest.revision, latest.revision >= applied,
              let digest = row["commandDigest"] as? String, hash(digest), row["tripMutation"] as? String == "none"
        else { throw NativeDataError.invalidResponse }
        if row["result"] as? String == "superseded" {
            guard latest.revision > applied, row["command"] is NSNull, row["receipt"] is NSNull else { throw NativeDataError.invalidResponse }
            return .init(current: latest, superseded: true, digest: digest)
        }
        let echo = try command(row["command"]!), receipt = try current(row["receipt"]!)
        guard row["result"] as? String == "applied", latest.revision == applied, equal(echo.object, input.object),
              receipt.revision == applied, receipt.referenceId == latest.referenceId, receipt.tripId == trip,
              receipt.tripVersion == input.expectedTripVersion, equal(receipt.fields.object, input.fields.object),
              equal(receipt.source.object, input.source.object), equal(latest.fields.object, receipt.fields.object), equal(latest.source.object, receipt.source.object)
        else { throw NativeDataError.invalidResponse }
        return .init(current: latest, superseded: false, digest: digest)
    }
    struct Page { let items: [NativeReservationCurrent]; let next: String? }
    static func page(_ bytes: Data, trip: String, version: Int, after: String?, limit: Int = 20) throws -> Page {
        let row = try exact(root(bytes), ["kind", "tripId", "tripVersion", "items", "hasMore", "nextCursor", "planningConstraints"])
        guard row["kind"] as? String == "reservation_references/1", row["tripId"] as? String == trip,
              integer(row["tripVersion"]) == version, let raw = row["items"] as? [Any], raw.count <= limit,
              let more = boolean(row["hasMore"]), let constraints = row["planningConstraints"] as? [[String: Any]], constraints.count == raw.count
        else { throw NativeDataError.invalidResponse }
        let items = try raw.map(current); var previous = after
        for (index, item) in items.enumerated() {
            guard item.tripId == trip, item.tripVersion == version, previous == nil || item.referenceId > previous! else { throw NativeDataError.invalidResponse }
            let constraint = try exact(constraints[index], ["referenceId", "revision", "status", "evidenceTier", "applies", "startsAt", "endsAt", "timeZone", "address", "terms", "sourceQualification", "supplierVerified", "tripMutation"])
            let expected: [String: Any] = ["referenceId": item.referenceId, "revision": item.revision, "status": item.fields.status,
                "evidenceTier": "user_reported", "applies": ["reserved", "amended"].contains(item.fields.status),
                "startsAt": item.fields.startsAt as Any? ?? NSNull(), "endsAt": item.fields.endsAt as Any? ?? NSNull(),
                "timeZone": item.fields.timeZone as Any? ?? NSNull(), "address": item.fields.address as Any? ?? NSNull(),
                "terms": item.fields.terms as Any? ?? NSNull(), "sourceQualification": "untrusted", "supplierVerified": false, "tripMutation": "none"]
            guard equal(constraint, expected) else { throw NativeDataError.invalidResponse }; previous = item.referenceId
        }
        let next = row["nextCursor"] as? String
        guard more ? items.count == limit && next == previous && next != nil : row["nextCursor"] is NSNull else { throw NativeDataError.invalidResponse }
        return .init(items: items, next: next)
    }
}
