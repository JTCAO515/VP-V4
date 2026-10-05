import Foundation

struct NativeArchiveDataCursor: Equatable {
    let digest: String
    let afterID: String
    var object: [String: Any] { ["sourceDigest": digest, "afterId": afterID] }
    init(_ raw: Any) throws {
        let v = try NativeCommunityWire.object(raw, ["sourceDigest", "afterId"])
        digest = try NativeCommunityWire.hash(v["sourceDigest"])
        afterID = try NativeArchiveDataCommand.id(v["afterId"])
    }
}

enum NativeArchiveDataScope: String, CaseIterable {
    case trip = "archived-trip-data/1", progress = "archive-export-progress/1"
    var sections: [String] { self == .trip ? ["trip", "snapshots", "operations"] : ["progress"] }
}

struct NativeArchiveDataCommand {
    let body: Data
    let action: String
    let scope: NativeArchiveDataScope
    let requestID: String?
    let tripID: String?
    let tripVersion: Int?
    let objectIDs: [String]
    let previewDigest: String?
    let mutationBytes: Data?
    let cursor: NativeArchiveDataCursor?
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
              let scope = (v["scope"] as? String).flatMap(NativeArchiveDataScope.init(rawValue:)),
              let action = v["action"] as? String else { throw NativeDataError.invalidResponse }
        self.body = body; self.action = action; self.scope = scope
        if action == "list" {
            _ = try w.object(v, ["action", "scope", "cursor", "limit"])
            guard body.count <= 8192, try w.integer(v["limit"], max: 20) == 20 else { throw NativeDataError.invalidResponse }
            cursor = try w.optional(v["cursor"]) { try NativeArchiveDataCursor($0 as Any) }
            requestID = nil; tripID = nil; tripVersion = nil; objectIDs = []; previewDigest = nil; mutationBytes = nil
            return
        }
        requestID = try Self.id(v["requestId"]); cursor = nil
        if scope == .trip {
            tripID = try Self.id(v["tripId"]); tripVersion = try w.integer(v["tripVersion"], max: Int(Int32.max))
            guard let empty = v["objectIds"] as? [String], empty.isEmpty else { throw NativeDataError.invalidResponse }
            objectIDs = []
        } else {
            guard v["tripId"] is NSNull, v["tripVersion"] is NSNull else { throw NativeDataError.invalidResponse }
            tripID = nil; tripVersion = nil; objectIDs = try Self.ids(v["objectIds"])
            guard !objectIDs.contains(requestID ?? "") else { throw NativeDataError.invalidResponse }
        }
        let keys: Set<String> = ["action", "scope", "requestId", "tripId", "tripVersion", "objectIds"]
        switch action {
        case "preview":
            _ = try w.object(v, keys); previewDigest = nil; mutationBytes = nil
            guard body.count <= 8192 else { throw NativeDataError.invalidResponse }
        case "export", "erase", "validate":
            _ = try w.object(v, keys.union(["previewDigest", "confirmed"]))
            guard body.count <= 8192, try w.bool(v["confirmed"]), action != "erase" || scope == .progress else { throw NativeDataError.invalidResponse }
            previewDigest = try w.hash(v["previewDigest"]); mutationBytes = nil
        case "recover":
            _ = try w.object(v, keys.union(["mutationBytes"]))
            guard !nested, let text = v["mutationBytes"] as? String else { throw NativeDataError.invalidResponse }
            let originalBytes = Data(text.utf8), original = try Self(body: originalBytes, nested: true)
            guard original.action == "erase", original.scope == scope, original.requestID == requestID,
                  original.tripID == tripID, original.tripVersion == tripVersion, original.objectIDs == objectIDs else { throw NativeDataError.invalidResponse }
            mutationBytes = originalBytes; previewDigest = original.previewDigest
        default: throw NativeDataError.invalidResponse
        }
    }
    static func list(scope: NativeArchiveDataScope, cursor: NativeArchiveDataCursor? = nil) throws -> Self {
        try .init(body: NativeCommunityWire.bytes(["action": "list", "scope": scope.rawValue,
            "cursor": cursor?.object as Any? ?? NSNull(), "limit": 20]))
    }
    static func preview(trip: NativeTripLifecycleTrip) throws -> Self {
        guard trip.valid, trip.state == .archived else { throw NativeDataError.invalidResponse }
        return try preview(scope: .trip, tripID: trip.id, tripVersion: trip.headVersion, ids: [])
    }
    static func preview(ids: Set<String>) throws -> Self { try preview(scope: .progress, tripID: nil, tripVersion: nil, ids: ids.sorted()) }
    private static func preview(scope: NativeArchiveDataScope, tripID: String?, tripVersion: Int?, ids: [String]) throws -> Self {
        try .init(body: NativeCommunityWire.bytes(["action": "preview", "scope": scope.rawValue,
            "requestId": UUID().uuidString.lowercased(), "tripId": tripID as Any? ?? NSNull(),
            "tripVersion": tripVersion as Any? ?? NSNull(), "objectIds": ids]))
    }
    private var selection: [String: Any] {
        ["scope": scope.rawValue, "requestId": requestID as Any? ?? NSNull(), "tripId": tripID as Any? ?? NSNull(),
         "tripVersion": tripVersion as Any? ?? NSNull(), "objectIds": objectIDs]
    }
    func confirmed(action: String, digest: String) throws -> Self {
        guard self.action == "preview", ["export", "erase"].contains(action) else { throw NativeDataError.invalidResponse }
        var v = selection; v["action"] = action; v["previewDigest"] = digest; v["confirmed"] = true
        return try .init(body: NativeCommunityWire.bytes(v))
    }
    func validation() throws -> Self {
        guard action == "export", let previewDigest else { throw NativeDataError.invalidResponse }
        var v = selection; v["action"] = "validate"; v["previewDigest"] = previewDigest; v["confirmed"] = true
        return try .init(body: NativeCommunityWire.bytes(v))
    }
    func recovery() throws -> Self {
        guard action == "erase", let text = String(data: body, encoding: .utf8) else { throw NativeDataError.invalidResponse }
        var v = selection; v["action"] = "recover"; v["mutationBytes"] = text
        return try .init(body: NativeCommunityWire.bytes(v))
    }
    static func validateConfirmation(_ bytes: Data) throws {
        guard ["export", "erase"].contains(try Self(body: bytes).action) else { throw NativeDataError.invalidResponse }
    }
}
