import Foundation

struct NativeCoverageProgressCursor: Equatable {
    let digest: String
    let afterID: String
    var object: [String: Any] { ["sourceDigest": digest, "afterId": afterID] }
    init(_ raw: Any) throws {
        let v = try NativeCommunityWire.object(raw, ["sourceDigest", "afterId"])
        digest = try NativeCommunityWire.hash(v["sourceDigest"])
        afterID = try NativeCoverageProgressCommand.id(v["afterId"])
    }
}

struct NativeCoverageProgressCommand {
    let body: Data
    let action: String
    let requestID: String?
    let objectIDs: [String]
    let previewDigest: String?
    let mutationBytes: Data?
    let cursor: NativeCoverageProgressCursor?

    static func id(_ raw: Any?) throws -> String {
        let id = try NativeCommunityWire.id(raw)
        guard raw as? String == id else { throw NativeDataError.invalidResponse }
        return id
    }
    static func ids(_ raw: Any?) throws -> [String] {
        guard let ids = raw as? [String], !ids.isEmpty, ids.count <= 20,
              ids == ids.sorted(), Set(ids).count == ids.count else { throw NativeDataError.invalidResponse }
        for id in ids { _ = try Self.id(id) }
        return ids
    }

    init(body: Data, nested: Bool = false) throws {
        guard !body.isEmpty, body.count <= (nested ? 8192 : 16384) else { throw NativeDataError.invalidResponse }
        let w = NativeCommunityWire.self
        guard let v = try JSONSerialization.jsonObject(with: body) as? [String: Any],
              v["scope"] as? String == NativeCoverageProgressWire.schema,
              let action = v["action"] as? String else { throw NativeDataError.invalidResponse }
        self.body = body; self.action = action
        if action == "list" {
            _ = try w.object(v, ["action", "scope", "cursor", "limit"])
            guard body.count <= 8192, try w.integer(v["limit"], max: 20) == 20 else { throw NativeDataError.invalidResponse }
            cursor = try w.optional(v["cursor"]) { try NativeCoverageProgressCursor($0 as Any) }
            requestID = nil; objectIDs = []; previewDigest = nil; mutationBytes = nil
            return
        }
        requestID = try Self.id(v["requestId"]); objectIDs = try Self.ids(v["objectIds"]); cursor = nil
        guard !objectIDs.contains(requestID ?? "") else { throw NativeDataError.invalidResponse }
        let keys: Set<String> = ["action", "scope", "requestId", "objectIds"]
        switch action {
        case "preview":
            _ = try w.object(v, keys)
            guard body.count <= 8192 else { throw NativeDataError.invalidResponse }
            previewDigest = nil; mutationBytes = nil
        case "export", "erase":
            _ = try w.object(v, keys.union(["previewDigest", "confirmed"]))
            guard body.count <= 8192, try w.bool(v["confirmed"]) else { throw NativeDataError.invalidResponse }
            previewDigest = try w.hash(v["previewDigest"]); mutationBytes = nil
        case "recover":
            _ = try w.object(v, keys.union(["mutationBytes"]))
            guard !nested, let text = v["mutationBytes"] as? String else { throw NativeDataError.invalidResponse }
            let originalBytes = Data(text.utf8)
            let original = try Self(body: originalBytes, nested: true)
            guard original.action == "erase", original.requestID == requestID, original.objectIDs == objectIDs else {
                throw NativeDataError.invalidResponse
            }
            mutationBytes = originalBytes; previewDigest = original.previewDigest
        default: throw NativeDataError.invalidResponse
        }
    }

    static func list(cursor: NativeCoverageProgressCursor? = nil) throws -> Self {
        try .init(body: NativeCommunityWire.bytes(["action": "list", "scope": NativeCoverageProgressWire.schema,
            "cursor": cursor?.object as Any? ?? NSNull(), "limit": 20]))
    }
    static func preview(_ ids: Set<String>) throws -> Self {
        try .init(body: NativeCommunityWire.bytes(["action": "preview", "scope": NativeCoverageProgressWire.schema,
            "requestId": UUID().uuidString.lowercased(), "objectIds": ids.sorted()]))
    }
    func confirmed(action: String, digest: String) throws -> Self {
        guard self.action == "preview", let requestID, ["export", "erase"].contains(action) else { throw NativeDataError.invalidResponse }
        return try .init(body: NativeCommunityWire.bytes(["action": action, "scope": NativeCoverageProgressWire.schema,
            "requestId": requestID, "objectIds": objectIDs, "previewDigest": digest, "confirmed": true]))
    }
    func recovery() throws -> Self {
        guard action == "erase", let requestID, let text = String(data: body, encoding: .utf8) else { throw NativeDataError.invalidResponse }
        return try .init(body: NativeCommunityWire.bytes(["action": "recover", "scope": NativeCoverageProgressWire.schema,
            "requestId": requestID, "objectIds": objectIDs, "mutationBytes": text]))
    }
    static func validateErase(_ bytes: Data) throws {
        guard try Self(body: bytes).action == "erase" else { throw NativeDataError.invalidResponse }
    }
}
