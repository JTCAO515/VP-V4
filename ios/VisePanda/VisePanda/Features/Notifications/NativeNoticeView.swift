import Foundation

struct NativeNoticeSource: Codable, Equatable, Sendable {
    let kind: String
    let sourceId: String
    let revision: Int
    let contentDigest: String
    var valid: Bool {
        ["current_trip", "user_reminder", "task_result", "qualified_watch"].contains(kind) &&
        NativeNotificationWire.uuid(sourceId) && (0...Int(Int32.max)).contains(revision) &&
        contentDigest.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil
    }
    var purpose: NativeReminderPurpose? {
        switch kind {
        case "current_trip", "user_reminder": return .userSetTravel
        case "task_result": return .acceptedTaskResult
        case "qualified_watch": return .qualifiedWatch
        default: return nil
        }
    }
}

struct NativeNextStep: Decodable, Identifiable, Equatable, Sendable {
    let id: String
    let source: NativeNoticeSource
    let reasonCode: String
    let reason: String?
    let expiresAt: String
    var valid: Bool {
        guard NativeNotificationWire.uuid(id), source.valid, NativeNoticeView.reasonValid(reason),
              NativeNotificationWire.date(expiresAt) != nil, source.kind == "user_reminder" || reason == nil else { return false }
        switch source.kind {
        case "current_trip": return reasonCode == "review_trip"
        case "user_reminder": return reasonCode == "user_requested"
        case "task_result": return reasonCode == "result_ready"
        case "qualified_watch": return ["watch_available", "watch_changed"].contains(reasonCode)
        default: return false
        }
    }
}

struct NativeNoticeRecord: Decodable, Identifiable, Equatable, Sendable {
    let id: String
    let operationId: String
    let baseVersion: Int
    let purpose: NativeReminderPurpose
    let source: NativeNoticeSource
    let reason: String?
    let dueAt: String
    let expiresAt: String
    let timeZone: String
    let quietHours: NativeQuietHours
    let status: String
    let deliveryState: NativeDeliveryState
    let outcome: NativeDeliveryReceipt.Outcome?
    var valid: Bool {
        guard NativeNotificationWire.uuid(id), NativeNotificationWire.uuid(operationId),
              (0...Int(Int32.max)).contains(baseVersion), source.valid, source.purpose == purpose,
              NativeNoticeView.reasonValid(reason), let due = NativeNotificationWire.date(dueAt),
              let expiry = NativeNotificationWire.date(expiresAt), expiry > due, expiry.timeIntervalSince(due) <= 86400,
              TimeZone(identifier: timeZone) != nil, quietHours.valid,
              ["saved", "cancelled", "completed"].contains(status),
              ![.cancelled, .completed].contains(deliveryState), outcome?.valid != false else { return false }
        guard purpose == .userSetTravel ? reason != nil : reason == nil else { return false }
        switch deliveryState {
        case .accepted: return outcome?.kind == "accepted"
        case .unknown: return outcome?.kind == "unknown"
        case .error: return outcome?.kind == "error"
        case .attempting: return outcome == nil
        default: return outcome == nil
        }
    }
}

struct NativeWatchRecord: Decodable, Identifiable, Equatable, Sendable {
    let id: String
    let source: NativeNoticeSource
    let expiresAt: String
    let status: String
    let timeZone: String
    let quietHours: NativeQuietHours
    var valid: Bool {
        NativeNotificationWire.uuid(id) && source.valid && source.kind == "qualified_watch" &&
        NativeNotificationWire.date(expiresAt) != nil && ["active", "cancelled"].contains(status) &&
        TimeZone(identifier: timeZone) != nil && quietHours.valid
    }
}

struct NativeNoticeView: Decodable, Sendable {
    struct MutationReceipt: Decodable, Equatable, Sendable {
        let operationId: String
        let action: String
        let requestDigest: String
        let resultId: String
        let revision: Int
        let terminal: Bool
        let outcome: String
        func matches(_ command: NativeNoticeCommand) -> Bool {
            operationId == command.operationId && action == command.action && requestDigest == command.requestDigest &&
            resultId == command.resultId && (0...Int(Int32.max)).contains(revision) && terminal && ["applied", "cancelled"].contains(outcome)
        }
    }
    struct Device: Decodable, Equatable, Sendable {
        let deviceId: String
        let revision: Int
        let permission: String
        let active: Bool
        var valid: Bool {
            NativeNotificationWire.uuid(deviceId) && (1...Int(Int32.max)).contains(revision) &&
            ["authorized", "denied", "not_determined"].contains(permission) && (!active || permission == "authorized")
        }
    }
    let version: Int
    let tripId: String
    let tripVersion: Int
    let transport: String
    let watchAvailability: String
    let nextSteps: [NativeNextStep]
    let reminders: [NativeNoticeRecord]
    let watches: [NativeWatchRecord]
    let device: Device?
    let complete: Bool
    let mutationReceipt: MutationReceipt?
    var hasConsentedPurpose: Bool {
        reminders.contains { $0.status == "saved" } || watches.contains { $0.status == "active" }
    }

    static func reasonValid(_ value: String?) -> Bool {
        guard let value else { return true }
        return !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && value.utf16.count <= 240
    }

    static func decode(_ bytes: Data, tripId: String) throws -> Self {
        guard bytes.count <= 262144,
              let raw = try JSONSerialization.jsonObject(with: bytes) as? [String: Any],
              Set(raw.keys) == Set(["version", "tripId", "tripVersion", "transport", "watchAvailability", "nextSteps", "reminders", "watches", "device", "complete", "mutationReceipt"]) else { throw NativeDataError.invalidResponse }
        if let receipt = raw["mutationReceipt"] as? [String: Any] {
            guard Set(receipt.keys) == Set(["operationId", "action", "requestDigest", "resultId", "revision", "terminal", "outcome"]), NativeNoticeCommand.integer(receipt["revision"]) != nil else { throw NativeDataError.invalidResponse }
        }
        try NativeNoticeCommand.requireKeys(raw["nextSteps"], ["id", "source", "reasonCode", "reason", "expiresAt"])
        try NativeNoticeCommand.requireKeys(raw["reminders"], ["id", "operationId", "baseVersion", "purpose", "source", "reason", "dueAt", "expiresAt", "timeZone", "quietHours", "status", "deliveryState", "outcome"])
        try NativeNoticeCommand.requireKeys(raw["watches"], ["id", "source", "expiresAt", "status", "timeZone", "quietHours"])
        if let device = raw["device"] as? [String: Any], Set(device.keys) != Set(["deviceId", "revision", "permission", "active"]) { throw NativeDataError.invalidResponse }
        let value = try JSONDecoder().decode(Self.self, from: bytes)
        guard value.version == 2, value.tripId == tripId, NativeNotificationWire.uuid(tripId),
              (0...Int(Int32.max)).contains(value.tripVersion), ["disabled", "configured"].contains(value.transport),
              value.watchAvailability == "qualified_only", value.nextSteps.count <= 100, value.reminders.count <= 100,
              value.watches.count <= 50, value.nextSteps.allSatisfy(\.valid), value.reminders.allSatisfy(\.valid),
              value.watches.allSatisfy(\.valid), value.device?.valid != false,
              Set(value.nextSteps.map(\.id)).count == value.nextSteps.count,
              Set(value.reminders.map(\.id)).count == value.reminders.count,
              Set(value.watches.map(\.id)).count == value.watches.count else { throw NativeDataError.invalidResponse }
        return value
    }
}
