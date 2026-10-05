import Foundation

enum NativeNotificationDataScope: String, CaseIterable {
    case trip = "notification-trip-data/1"
    case device = "notification-device-data/1"
    case progress = "notification-exit-progress/1"

    /// Exact sole TS CATALOG.md mapping; an opaque scope or old metadata handler
    /// cannot open the full data consumer under a different catalog module.
    static func catalogScope(_ module: NativeDataCoverageModule) -> Self? {
        guard module.location == .server, module.version == NativeNotificationDataWire.schema,
              module.exportHandler == "notification_data", module.deleteHandler == "notification_data",
              module.selection == "notification_records", let scope = Self(rawValue: module.scope) else { return nil }
        let expected: String
        switch scope { case .trip: expected = "notifications"; case .device: expected = "notification_devices"; case .progress: expected = "notification_exit_progress" }
        return module.id == expected ? scope : nil
    }

}

struct NativeNotificationDataCursor: Equatable {
    let sourceDigest: String
    let afterID: String
    init(_ raw: Any) throws {
        let v = try NativeCommunityWire.object(raw, ["sourceDigest", "afterId"])
        sourceDigest = try NativeCommunityWire.hash(v["sourceDigest"])
        afterID = try NativeNotificationDataCommand.id(v["afterId"])
    }
    var object: [String: Any] { ["sourceDigest": sourceDigest, "afterId": afterID] }
}

/// Mirrors the sole TS notification-data/contract.ts closed command union.
/// There is no owner, credential, privilege, free text or provider selector.
struct NativeNotificationDataCommand: Equatable {
    let body: Data
    let action: String
    let scope: NativeNotificationDataScope
    let requestID: String?
    let objectIDs: [String]
    let previewDigest: String?
    let mutationBytes: Data?
    let cursor: NativeNotificationDataCursor?

    init(body: Data, recovering: Bool = false) throws {
        guard body.count <= 16_384,
              let v = try JSONSerialization.jsonObject(with: body) as? [String: Any],
              let scope = NativeNotificationDataScope(rawValue: v["scope"] as? String ?? "") else {
            throw NativeDataError.invalidResponse
        }
        let w = NativeCommunityWire.self
        self.body = body; self.scope = scope
        action = try w.text(v["action"], max: 9)
        guard action == "recover" || body.count <= 8192 else { throw NativeDataError.invalidResponse }
        if action == "list" {
            _ = try w.object(v, ["action", "scope", "cursor", "limit"])
            guard try w.integer(v["limit"], max: 20) == 20 else { throw NativeDataError.invalidResponse }
            cursor = try w.optional(v["cursor"], NativeNotificationDataCursor.init)
            requestID = nil; objectIDs = []; previewDigest = nil; mutationBytes = nil
            return
        }
        cursor = nil
        requestID = try Self.id(v["requestId"])
        guard let ids = v["objectIds"] as? [String], !ids.isEmpty, ids.count <= 20,
              ids == ids.sorted(), Set(ids).count == ids.count else { throw NativeDataError.invalidResponse }
        for id in ids { _ = try Self.id(id) }
        objectIDs = ids
        guard scope != .progress || !ids.contains(requestID!) else { throw NativeDataError.invalidResponse }
        let common: Set<String> = ["action", "scope", "requestId", "objectIds"]
        switch action {
        case "preview":
            _ = try w.object(v, common); previewDigest = nil; mutationBytes = nil
        case "export", "erase":
            _ = try w.object(v, common.union(["previewDigest", "confirmed"]))
            guard try w.bool(v["confirmed"]) else { throw NativeDataError.invalidResponse }
            previewDigest = try w.hash(v["previewDigest"]); mutationBytes = nil
        case "recover":
            _ = try w.object(v, common.union(["mutationBytes"]))
            guard !recovering, let original = v["mutationBytes"] as? String,
                  original.utf8.count <= 8192 else { throw NativeDataError.invalidResponse }
            let command = try Self(body: Data(original.utf8), recovering: true)
            guard command.action == "erase", command.scope == scope,
                  command.requestID == requestID, command.objectIDs == objectIDs else {
                throw NativeDataError.invalidResponse
            }
            mutationBytes = command.body; previewDigest = command.previewDigest
        default: throw NativeDataError.invalidResponse
        }
        if action == "erase", !recovering { _ = try recovery() }
    }

    static func id(_ raw: Any?) throws -> String {
        let id = try NativeCommunityWire.id(raw)
        guard raw as? String == id else { throw NativeDataError.invalidResponse }
        return id
    }

    static func list(scope: NativeNotificationDataScope, cursor: NativeNotificationDataCursor? = nil) throws -> Self {
        try .init(body: NativeCommunityWire.bytes(["action": "list", "scope": scope.rawValue,
            "cursor": cursor?.object as Any? ?? NSNull(), "limit": 20]))
    }

    static func preview(scope: NativeNotificationDataScope, objectIDs: [String]) throws -> Self {
        try .init(body: NativeCommunityWire.bytes(["action": "preview", "scope": scope.rawValue,
            "requestId": UUID().uuidString.lowercased(), "objectIds": objectIDs.sorted()]))
    }

    func confirmed(action: String, previewDigest: String) throws -> Self {
        guard self.action == "preview", ["export", "erase"].contains(action), let requestID else {
            throw NativeDataError.invalidResponse
        }
        return try .init(body: NativeCommunityWire.bytes(["action": action, "scope": scope.rawValue,
            "requestId": requestID, "objectIds": objectIDs, "previewDigest": previewDigest, "confirmed": true]))
    }

    func recovery() throws -> Self {
        guard action == "erase", let requestID, let original = String(data: body, encoding: .utf8) else {
            throw NativeDataError.invalidResponse
        }
        return try .init(body: NativeCommunityWire.bytes(["action": "recover", "scope": scope.rawValue,
            "requestId": requestID, "objectIds": objectIDs, "mutationBytes": original]))
    }
}
