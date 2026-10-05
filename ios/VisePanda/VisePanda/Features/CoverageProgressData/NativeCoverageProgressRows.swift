import Foundation

enum NativeCoverageProgressRows {
    private static let originalScopes = ["notification-metadata/1", "trip-lifecycle-metadata/1"]
    private static func root(_ value: [String: Any], id: String, owner: String) throws {
        guard try NativeCoverageProgressCommand.id(value["requestId"]) == id,
              try NativeCoverageProgressCommand.id(value["ownerId"]) == owner else { throw NativeDataError.invalidResponse }
        _ = try NativeCoverageProgressCommand.id(value["sessionId"])
    }
    private static func cursor(_ raw: Any?, scope: String, digest: String) throws {
        guard let raw else { throw NativeDataError.invalidResponse }
        if raw is NSNull { return }
        let key = scope == originalScopes[0] ? "afterKey" : "afterId"
        let v = try NativeCommunityWire.object(raw, ["sourceDigest", key])
        guard try NativeCommunityWire.hash(v["sourceDigest"]) == digest else { throw NativeDataError.invalidResponse }
        if key == "afterId" { _ = try NativeCommunityWire.id(v[key]) }
        else {
            guard let key = v[key] as? String,
                  key.range(of: "^(reminder|watch|dismissal|operation|device):[a-f0-9-]{36}$", options: .regularExpression) != nil else {
                throw NativeDataError.invalidResponse
            }
        }
    }
    private static func progress(_ p: [String: Any], id: String, scope: String, digest: String,
                                 original: Bool, section: String? = nil) throws {
        let w = NativeCommunityWire.self, s = NativeCoverageProgressWire.self
        var keys: Set<String> = ["requestId", "lastCursor", "nextCursor", "lastLimit", "pages", "rows", "bytes", "terminal"]
        if original { keys.insert("section") }
        _ = try w.object(p, keys)
        guard p["requestId"] as? String == id, !original || p["section"] as? String == section else { throw NativeDataError.invalidResponse }
        try cursor(p["lastCursor"], scope: scope, digest: digest); try cursor(p["nextCursor"], scope: scope, digest: digest)
        let pages = try s.integer(p["pages"], max: original ? 400 : 4, minimum: 0)
        _ = try s.integer(p["rows"], max: original ? 10000 : 20, minimum: 0)
        _ = try s.integer(p["bytes"], max: 1_000_000, minimum: 0)
        _ = try w.bool(p["terminal"])
        if p["lastLimit"] is NSNull {
            guard pages == 0 else { throw NativeDataError.invalidResponse }
        } else {
            let limit = try s.integer(p["lastLimit"], max: original ? (scope == originalScopes[0] ? 100 : 50) : 5)
            guard original || limit == 5 else { throw NativeDataError.invalidResponse }
        }
    }
    static func effects(_ raw: Any) throws -> [String: Int] {
        let v = try NativeCommunityWire.object(raw, ["collectorRequests", "collectorSections", "exitPages", "retainedFences", "sourceData", "sessionAccountFences", "externalCopies"])
        guard v["sourceData"] as? String == "not_modified", v["sessionAccountFences"] as? String == "retained",
              v["externalCopies"] as? String == "not_erased" else { throw NativeDataError.invalidResponse }
        return try ["collectorRequests", "collectorSections", "exitPages", "retainedFences"].reduce(into: [:]) {
            $0[$1] = try NativeCoverageProgressWire.integer(v[$1], max: 60, minimum: 0)
        }
    }
    static func items(_ raw: Any?, binding: NativeCoverageProgressBinding) throws -> [NativeCoverageProgressItem] {
        guard let rows = raw as? [[String: Any]], rows.count == binding.objectIDs.count else { throw NativeDataError.invalidResponse }
        return try rows.enumerated().map { index, v in
            let id = try NativeCoverageProgressCommand.id(v["objectId"])
            guard id == binding.objectIDs[index], let domain = v["domain"] as? String else { throw NativeDataError.invalidResponse }
            switch domain {
            case "collector": try collector(v, id: id, owner: binding.ownerID)
            case "exit": try exit(v, id: id, owner: binding.ownerID)
            default: throw NativeDataError.invalidResponse
            }
            let bytes = try JSONSerialization.data(withJSONObject: v, options: [.prettyPrinted, .sortedKeys])
            guard let text = String(data: bytes, encoding: .utf8) else { throw NativeDataError.invalidResponse }
            return .init(id: id, domain: domain, fields: text)
        }
    }
    private static func collector(_ v: [String: Any], id: String, owner: String) throws {
        let w = NativeCommunityWire.self, s = NativeCoverageProgressWire.self
        _ = try w.object(v, ["objectId", "domain", "request", "sections", "fence"])
        let fence = try w.object(v["fence"] as Any, ["requestId", "ownerId", "sessionId", "scope", "expiresAt"])
        try root(fence, id: id, owner: owner)
        guard let scope = fence["scope"] as? String, originalScopes.contains(scope),
              let sections = v["sections"] as? [[String: Any]], sections.count <= 2 else { throw NativeDataError.invalidResponse }
        let expiry = try s.integer(fence["expiresAt"])
        if v["request"] is NSNull {
            guard sections.isEmpty else { throw NativeDataError.invalidResponse }; return
        }
        let r = try w.object(v["request"] as Any, ["requestId", "ownerId", "sessionId", "mobileEpoch", "scope", "sourceDigest", "capturedAt", "expiresAt"])
        try root(r, id: id, owner: owner)
        let digest = try w.hash(r["sourceDigest"])
        _ = try s.integer(r["mobileEpoch"])
        guard r["sessionId"] as? String == fence["sessionId"] as? String, r["scope"] as? String == scope,
              try s.integer(r["expiresAt"]) == expiry, try expiry == s.integer(r["capturedAt"]) + 30_000 else { throw NativeDataError.invalidResponse }
        let names = scope == originalScopes[0] ? ["notifications"] : ["operations", "trips"]
        guard sections.count == names.count else { throw NativeDataError.invalidResponse }
        for (index, section) in sections.enumerated() {
            try progress(section, id: id, scope: scope, digest: digest, original: true, section: names[index])
        }
    }
    private static func exit(_ v: [String: Any], id: String, owner: String) throws {
        let w = NativeCommunityWire.self, s = NativeCoverageProgressWire.self
        _ = try w.object(v, ["objectId", "domain", "request", "progress"])
        let r = try w.object(v["request"] as Any, ["requestId", "ownerId", "sessionId", "mobileEpoch", "scope", "objectIds", "sourceDigest", "previewDigest", "capturedAt", "expiresAt", "decision", "requestDigest", "decidedAt", "effects"])
        try root(r, id: id, owner: owner)
        _ = try s.integer(r["mobileEpoch"]); _ = try w.hash(r["previewDigest"])
        let digest = try w.hash(r["sourceDigest"]), ids = try NativeCoverageProgressCommand.ids(r["objectIds"])
        let captured = try s.integer(r["capturedAt"]), expires = try s.integer(r["expiresAt"])
        guard r["scope"] as? String == s.schema, !ids.contains(id), expires == captured + 30_000 else { throw NativeDataError.invalidResponse }
        if r["decision"] is NSNull {
            guard r["requestDigest"] is NSNull, r["decidedAt"] is NSNull, r["effects"] is NSNull else { throw NativeDataError.invalidResponse }
        } else {
            guard let decision = r["decision"] as? String, ["export", "erase"].contains(decision) else { throw NativeDataError.invalidResponse }
            _ = try w.hash(r["requestDigest"])
            let decided = try s.integer(r["decidedAt"])
            guard decided >= captured, decided < expires else { throw NativeDataError.invalidResponse }
            if decision == "erase" {
                guard try effects(r["effects"] as Any)["retainedFences"] == ids.count else { throw NativeDataError.invalidResponse }
            }
            else if !(r["effects"] is NSNull) { throw NativeDataError.invalidResponse }
        }
        if !(v["progress"] is NSNull) {
            guard r["decision"] as? String == "export", let p = v["progress"] as? [String: Any] else { throw NativeDataError.invalidResponse }
            try progress(p, id: id, scope: s.schema, digest: digest, original: false)
        }
    }
}
