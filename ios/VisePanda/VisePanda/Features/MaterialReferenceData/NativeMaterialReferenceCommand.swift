import Foundation

enum NativeMaterialReferenceScope: String, CaseIterable {
    case reservations = "reservation-reference-data/1"
    case pdf = "pdf-intake-data/1"
    case progress = "material-exit-progress/1"
}

struct NativeMaterialReferenceCursor: Equatable {
    let sourceDigest: String
    let afterID: String
    init(_ value: Any) throws {
        let row = try NativeCommunityWire.object(value, ["sourceDigest", "afterId"])
        sourceDigest = try NativeCommunityWire.hash(row["sourceDigest"])
        afterID = try NativeMaterialReferenceCommand.id(row["afterId"])
    }
    var object: [String: Any] { ["sourceDigest": sourceDigest, "afterId": afterID] }
}

/// Closed commands mirror the sole producer's material-references/contract.ts.
/// Only opaque selected identifiers and digests are persisted for recovery.
struct NativeMaterialReferenceCommand: Equatable {
    let body: Data
    let action: String
    let scope: NativeMaterialReferenceScope
    let tripID: String?
    let requestID: String?
    let objectIDs: [String]
    let previewDigest: String?
    let mutationBytes: Data?
    let cursor: NativeMaterialReferenceCursor?

    init(body: Data, recovering: Bool = false) throws {
        guard body.count <= 16_384 else { throw NativeDataError.invalidResponse }
        let w = NativeCommunityWire.self
        guard let value = try JSONSerialization.jsonObject(with: body) as? [String: Any],
              let scope = NativeMaterialReferenceScope(rawValue: value["scope"] as? String ?? "") else { throw NativeDataError.invalidResponse }
        self.scope = scope; self.body = body
        action = try w.text(value["action"], max: 9)
        guard action == "recover" || body.count <= 8192 else { throw NativeDataError.invalidResponse }
        if action == "trip_list" {
            _ = try w.object(value, ["action", "scope", "cursor", "limit"])
            cursor = try w.optional(value["cursor"], NativeMaterialReferenceCursor.init)
            guard try w.integer(value["limit"], max: 20) == 20 else { throw NativeDataError.invalidResponse }
            tripID = nil; requestID = nil; objectIDs = []; previewDigest = nil; mutationBytes = nil
            return
        }
        tripID = try Self.id(value["tripId"])
        if action == "list" {
            _ = try w.object(value, ["action", "scope", "tripId", "cursor", "limit"])
            cursor = try w.optional(value["cursor"], NativeMaterialReferenceCursor.init)
            guard try w.integer(value["limit"], max: 20) == 20 else { throw NativeDataError.invalidResponse }
            requestID = nil; objectIDs = []; previewDigest = nil; mutationBytes = nil
            return
        }
        cursor = nil
        requestID = try Self.id(value["requestId"])
        guard let ids = value["objectIds"] as? [String], !ids.isEmpty, ids.count <= 20,
              ids == ids.sorted(), Set(ids).count == ids.count else { throw NativeDataError.invalidResponse }
        for id in ids { _ = try Self.id(id) }
        objectIDs = ids
        guard scope != .progress || !ids.contains(requestID!) else { throw NativeDataError.invalidResponse }
        let common = ["action", "scope", "requestId", "tripId", "objectIds"]
        switch action {
        case "preview":
            _ = try w.object(value, Set(common)); previewDigest = nil; mutationBytes = nil
        case "export", "erase":
            _ = try w.object(value, Set(common + ["previewDigest", "confirmed"]))
            guard try w.bool(value["confirmed"]) else { throw NativeDataError.invalidResponse }
            previewDigest = try w.hash(value["previewDigest"]); mutationBytes = nil
        case "recover":
            _ = try w.object(value, Set(common + ["mutationBytes"]))
            guard !recovering, let text = value["mutationBytes"] as? String,
                  text.utf8.count <= 8192 else { throw NativeDataError.invalidResponse }
            let prior = try Self(body: Data(text.utf8), recovering: true)
            guard prior.action == "erase", prior.scope == scope, prior.tripID == tripID,
                  prior.requestID == requestID, prior.objectIDs == objectIDs else { throw NativeDataError.invalidResponse }
            mutationBytes = prior.body; previewDigest = prior.previewDigest
        default: throw NativeDataError.invalidResponse
        }
    }

    static func id(_ raw: Any?) throws -> String {
        let id = try NativeCommunityWire.id(raw)
        guard raw as? String == id else { throw NativeDataError.invalidResponse }
        return id
    }

    static func list(scope: NativeMaterialReferenceScope, tripID: String, cursor: NativeMaterialReferenceCursor? = nil) throws -> Self {
        try .init(body: NativeCommunityWire.bytes(["action": "list", "scope": scope.rawValue,
            "tripId": tripID, "cursor": cursor?.object as Any? ?? NSNull(), "limit": 20]))
    }

    static func trips(scope: NativeMaterialReferenceScope, cursor: NativeMaterialReferenceCursor? = nil) throws -> Self {
        try .init(body: NativeCommunityWire.bytes(["action": "trip_list", "scope": scope.rawValue,
            "cursor": cursor?.object as Any? ?? NSNull(), "limit": 20]))
    }

    static func preview(scope: NativeMaterialReferenceScope, tripID: String, objectIDs: [String]) throws -> Self {
        try .init(body: NativeCommunityWire.bytes(["action": "preview", "scope": scope.rawValue,
            "tripId": tripID, "objectIds": objectIDs.sorted(), "requestId": UUID().uuidString.lowercased()]))
    }

    func confirmed(action: String, previewDigest: String) throws -> Self {
        guard self.action == "preview", ["export", "erase"].contains(action), let requestID, let tripID else { throw NativeDataError.invalidResponse }
        return try .init(body: NativeCommunityWire.bytes(["action": action, "scope": scope.rawValue,
            "tripId": tripID, "objectIds": objectIDs, "requestId": requestID,
            "previewDigest": previewDigest, "confirmed": true]))
    }

    func recovery() throws -> Self {
        guard action == "erase", let requestID, let tripID, let text = String(data: body, encoding: .utf8) else { throw NativeDataError.invalidResponse }
        return try .init(body: NativeCommunityWire.bytes(["action": "recover", "scope": scope.rawValue,
            "tripId": tripID, "objectIds": objectIDs, "requestId": requestID, "mutationBytes": text]))
    }
}
