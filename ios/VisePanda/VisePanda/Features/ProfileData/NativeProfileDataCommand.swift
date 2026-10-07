import Foundation

enum NativeProfileDataScope: String, CaseIterable {
    case sensitive = "profile-sensitive-data/1"
    case progress = "profile-delete-progress/1"
}

struct NativeProfileDataCursor: Equatable {
    let digest: String
    let afterID: String
    var object: [String: Any] { ["sourceDigest": digest, "afterId": afterID] }
    init(_ raw: Any) throws {
        let v = try NativeCommunityWire.object(raw, ["sourceDigest", "afterId"])
        digest = try NativeCommunityWire.hash(v["sourceDigest"])
        afterID = try NativeProfileDataCommand.id(v["afterId"])
    }
}

/// Field names and closed actions come only from sole TS profile-data/contract.ts.
struct NativeProfileDataCommand {
    let body: Data
    let action: String
    let scope: NativeProfileDataScope
    let profileID: String?
    let requestID: String?
    let objectIDs: [String]
    let sourceDigest: String?
    let previewDigest: String?
    let mutationBytes: Data?
    let cursor: NativeProfileDataCursor?

    static func id(_ raw: Any?) throws -> String {
        let result = try NativeCommunityWire.id(raw)
        guard raw as? String == result else { throw NativeDataError.invalidResponse }
        return result
    }
    static func ids(_ raw: Any?, maximum: Int = 10000) throws -> [String] {
        guard let result = raw as? [String], result.count <= maximum,
              result == result.sorted(), Set(result).count == result.count else { throw NativeDataError.invalidResponse }
        for value in result { _ = try id(value) }
        return result
    }
    init(body: Data, nested: Bool = false) throws {
        guard !body.isEmpty, body.count <= (nested ? 8192 : 16384) else { throw NativeDataError.invalidResponse }
        let w = NativeCommunityWire.self
        guard let v = try JSONSerialization.jsonObject(with: body) as? [String: Any],
              let scope = (v["scope"] as? String).flatMap(NativeProfileDataScope.init(rawValue:)),
              let action = v["action"] as? String else { throw NativeDataError.invalidResponse }
        self.body = body; self.scope = scope; self.action = action
        if action == "list" {
            _ = try w.object(v, ["action", "scope", "cursor", "limit"])
            guard body.count <= 8192, try w.integer(v["limit"], max: 20) == 20 else { throw NativeDataError.invalidResponse }
            cursor = try w.optional(v["cursor"]) { try NativeProfileDataCursor($0 as Any) }
            profileID = nil; requestID = nil; objectIDs = []; sourceDigest = nil; previewDigest = nil; mutationBytes = nil
            return
        }
        cursor = nil; requestID = try Self.id(v["requestId"])
        if scope == .sensitive {
            profileID = try Self.id(v["profileId"])
            guard let empty = v["objectIds"] as? [String], empty.isEmpty else { throw NativeDataError.invalidResponse }
            objectIDs = []
        } else {
            guard v["profileId"] is NSNull else { throw NativeDataError.invalidResponse }
            profileID = nil; objectIDs = try Self.ids(v["objectIds"], maximum: 20)
            guard !objectIDs.isEmpty, !objectIDs.contains(requestID ?? "") else { throw NativeDataError.invalidResponse }
        }
        let keys: Set<String> = ["action", "scope", "requestId", "profileId", "objectIds"]
        switch action {
        case "preview":
            _ = try w.object(v, keys)
            guard body.count <= 8192 else { throw NativeDataError.invalidResponse }
            sourceDigest = nil; previewDigest = nil; mutationBytes = nil
        case "erase":
            _ = try w.object(v, keys.union(["sourceDigest", "previewDigest", "confirmed"]))
            guard body.count <= 8192, try w.bool(v["confirmed"]) else { throw NativeDataError.invalidResponse }
            sourceDigest = try w.hash(v["sourceDigest"]); previewDigest = try w.hash(v["previewDigest"]); mutationBytes = nil
        case "recover":
            _ = try w.object(v, keys.union(["mutationBytes"]))
            guard !nested, let text = v["mutationBytes"] as? String else { throw NativeDataError.invalidResponse }
            let originalBytes = Data(text.utf8), original = try Self(body: originalBytes, nested: true)
            guard original.action == "erase", original.scope == scope, original.requestID == requestID,
                  original.profileID == profileID, original.objectIDs == objectIDs else { throw NativeDataError.invalidResponse }
            sourceDigest = original.sourceDigest; previewDigest = original.previewDigest; mutationBytes = originalBytes
        default: throw NativeDataError.invalidResponse
        }
    }

    static func list(scope: NativeProfileDataScope, cursor: NativeProfileDataCursor? = nil) throws -> Self {
        try .init(body: NativeCommunityWire.bytes(["action": "list", "scope": scope.rawValue,
            "cursor": cursor?.object as Any? ?? NSNull(), "limit": 20]))
    }
    static func preview(profileID: String) throws -> Self {
        try preview(scope: .sensitive, id: profileID, objectIDs: [])
    }
    static func preview(ids: Set<String>) throws -> Self {
        try preview(scope: .progress, id: nil, objectIDs: ids.sorted())
    }
    private static func preview(scope: NativeProfileDataScope, id: String?, objectIDs: [String]) throws -> Self {
        try .init(body: NativeCommunityWire.bytes(["action": "preview", "scope": scope.rawValue,
            "requestId": UUID().uuidString.lowercased(),
            "profileId": id as Any? ?? NSNull(), "objectIds": objectIDs]))
    }
    private var selection: [String: Any] {
        ["scope": scope.rawValue, "requestId": requestID as Any? ?? NSNull(),
         "profileId": profileID as Any? ?? NSNull(), "objectIds": objectIDs]
    }
    func confirmed(sourceDigest: String, previewDigest: String) throws -> Self {
        guard action == "preview" else { throw NativeDataError.invalidResponse }
        var v = selection; v["action"] = "erase"; v["sourceDigest"] = sourceDigest; v["previewDigest"] = previewDigest; v["confirmed"] = true
        return try .init(body: NativeCommunityWire.bytes(v))
    }
    func recovery() throws -> Self {
        guard action == "erase", let text = String(data: body, encoding: .utf8) else { throw NativeDataError.invalidResponse }
        var v = selection; v["action"] = "recover"; v["mutationBytes"] = text
        return try .init(body: NativeCommunityWire.bytes(v))
    }
    static func validateConfirmation(_ bytes: Data) throws {
        guard try Self(body: bytes).action == "erase" else { throw NativeDataError.invalidResponse }
    }
}
