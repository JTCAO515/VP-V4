import Foundation

/// Operational status is supplied by the authoritative case reader, never inferred from a grant.
enum NativeServiceOperationStatus: String, Decodable, Sendable {
    case requested, queued, accepted, assigned
    case waitingExternal = "waiting_external"
    case resolved, unresolved, cancelled, unknown

    init(from decoder: Decoder) throws {
        let value = try decoder.singleValueContainer().decode(String.self)
        self = Self(rawValue: value) ?? .unknown
    }

    var isTerminal: Bool {
        switch self {
        case .resolved, .unresolved, .cancelled: true
        default: false
        }
    }

    var mayShowAcceptance: Bool {
        switch self {
        case .accepted, .assigned, .waitingExternal, .resolved, .unresolved: true
        default: false
        }
    }

    func label(zh: Bool) -> String {
        switch self {
        case .requested: zh ? "申请已记录" : "Request recorded"
        case .queued: zh ? "排队中，尚未接单" : "Queued; not accepted"
        case .accepted: zh ? "已接单" : "Accepted"
        case .assigned: zh ? "已分配负责人" : "Assigned"
        case .waitingExternal: zh ? "等待外部回复" : "Waiting for an external response"
        case .resolved: zh ? "已解决" : "Resolved"
        case .unresolved: zh ? "尚未解决，服务已结束" : "Unresolved; service ended"
        case .cancelled: zh ? "已取消" : "Cancelled"
        case .unknown: zh ? "运营状态未知" : "Operational status unknown"
        }
    }
}
