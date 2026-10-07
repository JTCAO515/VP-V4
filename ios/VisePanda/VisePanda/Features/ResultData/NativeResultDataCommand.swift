import Foundation

enum NativeResultDataScope: String, CaseIterable {
    case sensitive = "result-sensitive-data/1"
    case progress = "result-delete-progress/1"
}

enum NativeResultDataRoot: String, CaseIterable {
    case artifact
}

struct NativeResultDataCursor: Equatable {
    let digest: String
    let afterID: String
    var object: [String: Any] { ["sourceDigest": digest, "afterId": afterID] }
    init(_ raw: Any) throws {
        let v = try NativeCommunityWire.object(raw, ["sourceDigest", "afterId"])
        digest = try NativeCommunityWire.hash(v["sourceDigest"])
        afterID = try NativeResultDataCommand.id(v["afterId"])
    }
}

/// Field names and closed actions come only from sole TS result-data/contract.ts.
struct NativeResultDataCommand {
    let body: Data
    let action: String
    let scope: NativeResultDataScope
    let rootKind: NativeResultDataRoot?
    let rootID: String?
    let requestID: String?
    let objectIDs: [String]
    let sourceDigest: String?
    let previewDigest: String?
    let mutationBytes: Data?
    let cursor: NativeResultDataCursor?

    static func id(_ raw: Any?) throws -> String {
        let result = try NativeCommunityWire.id(raw)
        guard raw as? String == result else { throw NativeDataError.invalidResponse }
        return result
    }
    static func ids(_ raw: Any?, maximum: Int = 4100) throws -> [String] {
        guard let result = raw as? [String], result.count <= maximum,
              result == result.sorted(), Set(result).count == result.count else { throw NativeDataError.invalidResponse }
        for value in result { _ = try id(value) }
        return result
    }
    init(body: Data, nested: Bool = false) throws {
        guard !body.isEmpty, body.count <= (nested ? 8192 : 16384) else { throw NativeDataError.invalidResponse }
        let w = NativeCommunityWire.self
        guard let v = try JSONSerialization.jsonObject(with: body) as? [String: Any],
              let scope = (v["scope"] as? String).flatMap(NativeResultDataScope.init(rawValue:)),
              let action = v["action"] as? String else { throw NativeDataError.invalidResponse }
        self.body = body; self.scope = scope; self.action = action
        if scope == .sensitive {
            guard let kind = (v["rootKind"] as? String).flatMap(NativeResultDataRoot.init(rawValue:)) else { throw NativeDataError.invalidResponse }
            rootKind = kind
        } else {
            guard v["rootKind"] is NSNull else { throw NativeDataError.invalidResponse }
            rootKind = nil
        }
        if action == "list" {
            _ = try w.object(v, ["action", "scope", "rootKind", "cursor", "limit"])
            guard body.count <= 8192, try w.integer(v["limit"], max: 20) == 20 else { throw NativeDataError.invalidResponse }
            cursor = try w.optional(v["cursor"]) { try NativeResultDataCursor($0 as Any) }
            rootID = nil; requestID = nil; objectIDs = []; sourceDigest = nil; previewDigest = nil; mutationBytes = nil
            return
        }
        cursor = nil; requestID = try Self.id(v["requestId"])
        if scope == .sensitive {
            rootID = try Self.id(v["rootId"])
            guard let empty = v["objectIds"] as? [String], empty.isEmpty else { throw NativeDataError.invalidResponse }
            objectIDs = []
        } else {
            guard v["rootId"] is NSNull else { throw NativeDataError.invalidResponse }
            rootID = nil; objectIDs = try Self.ids(v["objectIds"], maximum: 20)
            guard !objectIDs.isEmpty, !objectIDs.contains(requestID ?? "") else { throw NativeDataError.invalidResponse }
        }
        let keys: Set<String> = ["action", "scope", "requestId", "rootKind", "rootId", "objectIds"]
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
                  original.rootKind == rootKind, original.rootID == rootID, original.objectIDs == objectIDs else { throw NativeDataError.invalidResponse }
            sourceDigest = original.sourceDigest; previewDigest = original.previewDigest; mutationBytes = originalBytes
        default: throw NativeDataError.invalidResponse
        }
    }

    static func list(scope: NativeResultDataScope, root: NativeResultDataRoot?, cursor: NativeResultDataCursor? = nil) throws -> Self {
        try .init(body: NativeCommunityWire.bytes(["action": "list", "scope": scope.rawValue,
            "rootKind": root?.rawValue as Any? ?? NSNull(), "cursor": cursor?.object as Any? ?? NSNull(), "limit": 20]))
    }
    static func preview(root: NativeResultDataRoot, id: String) throws -> Self {
        try preview(scope: .sensitive, root: root, id: id, objectIDs: [])
    }
    static func preview(ids: Set<String>) throws -> Self {
        try preview(scope: .progress, root: nil, id: nil, objectIDs: ids.sorted())
    }
    private static func preview(scope: NativeResultDataScope, root: NativeResultDataRoot?, id: String?, objectIDs: [String]) throws -> Self {
        try .init(body: NativeCommunityWire.bytes(["action": "preview", "scope": scope.rawValue,
            "requestId": UUID().uuidString.lowercased(), "rootKind": root?.rawValue as Any? ?? NSNull(),
            "rootId": id as Any? ?? NSNull(), "objectIds": objectIDs]))
    }
    private var selection: [String: Any] {
        ["scope": scope.rawValue, "requestId": requestID as Any? ?? NSNull(), "rootKind": rootKind?.rawValue as Any? ?? NSNull(),
         "rootId": rootID as Any? ?? NSNull(), "objectIds": objectIDs]
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
