import Foundation
import Observation

enum NativeTravelPace: String, Codable, CaseIterable {
    case relaxed, balanced, packed
    func label(chinese: Bool) -> String {
        switch self {
        case .relaxed: chinese ? "轻松" : "Relaxed"
        case .balanced: chinese ? "适中" : "Balanced"
        case .packed: chinese ? "紧凑" : "Packed"
        }
    }
}

struct NativeTravelPaceSnapshot: Decodable, Equatable {
    let schemaVersion: String
    let revision: Int
    let state: String
    let travelPace: NativeTravelPace?
    let scope: String?
    let purpose: String?
    let noticeVersion: String?
    let operationId: UUID?
    let reused: Bool?
    var valid: Bool {
        guard schemaVersion == "travel-pace/1", (0...9_007_199_254_740_990).contains(revision),
              ["unset", "explicit", "paused", "revoked"].contains(state) else { return false }
        if state == "explicit" || state == "paused" {
            return travelPace != nil && scope == "account" && purpose == "local_trip_planning"
                && noticeVersion == NativeTravelPaceStore.noticeVersion && operationId != nil && revision > 0
        }
        return travelPace == nil && scope == nil && purpose == nil && noticeVersion == nil
    }
}

struct NativeTravelPaceCommand: Encodable, Equatable {
    let action: String
    let operationId: UUID
    let expectedRevision: Int
    var travelPace: NativeTravelPace? = nil
    var noticeVersion: String? = nil
}

@MainActor @Observable
final class NativeTravelPaceStore {
    static let noticeVersion = "local-planning-cross-trip-v1"
    struct Toast: Equatable {
        let operationId: UUID
        let revision: Int
    }
    private(set) var scope: NativeDataScope?
    private(set) var snapshot: NativeTravelPaceSnapshot?
    private(set) var pending: NativeTravelPaceCommand?
    private(set) var toast: Toast?
    private(set) var busy = false
    private(set) var notice: String?
    private var shownOperations: Set<UUID> = []

    func reset(for next: NativeDataScope?) {
        guard scope != next else { return }
        scope = next; snapshot = nil; pending = nil; toast = nil; busy = false
        notice = nil; shownOperations = []
    }

    func load(using session: NativeSession) async {
        reset(for: session.dataScope)
        await perform(currentScope: { session.dataScope }, command: nil) {
            try await session.memoryRequest(method: "GET")
        }
    }

    func save(_ pace: NativeTravelPace, consent: Bool, using session: NativeSession) async {
        guard consent, let snapshot, pending == nil else { return }
        let command = NativeTravelPaceCommand(action: "save", operationId: UUID(), expectedRevision: snapshot.revision,
                                             travelPace: pace, noticeVersion: Self.noticeVersion)
        await send(command, using: session)
    }

    func change(_ action: String, using session: NativeSession) async {
        guard ["pause", "revoke", "undo"].contains(action), let snapshot, pending == nil else { return }
        if action == "undo" {
            guard let toast, toast.revision == snapshot.revision, toast.operationId == snapshot.operationId else { return }
        }
        await send(.init(action: action, operationId: UUID(), expectedRevision: snapshot.revision), using: session)
    }

    func retry(using session: NativeSession) async {
        guard let pending else { return }
        await send(pending, using: session)
    }

    func dismissToast(_ operationId: UUID) {
        if toast?.operationId == operationId { toast = nil }
    }

    private func send(_ command: NativeTravelPaceCommand, using session: NativeSession) async {
        await perform(currentScope: { session.dataScope }, command: command) {
            try await session.memoryRequest(method: "POST", body: JSONEncoder().encode(command))
        }
    }

    /// Same actor scope before and after every suspension. Tests control the
    /// transport without inventing credentials or bypassing the production gate.
    func perform(currentScope: @MainActor () -> NativeDataScope?, command: NativeTravelPaceCommand?,
                 request: @MainActor () async throws -> Data) async {
        guard !busy, let captured = scope, currentScope() == captured else { return }
        if let command {
            guard pending == nil || pending == command else { return }
            pending = command
        }
        busy = true; notice = nil
        defer { if scope == captured && currentScope() == captured { busy = false } }
        do {
            let data = try await request()
            guard scope == captured, currentScope() == captured else { return }
            let result = try JSONDecoder().decode(NativeTravelPaceSnapshot.self, from: data)
            guard result.valid else { throw NativeDataError.invalidResponse }
            if let command {
                guard result.operationId == command.operationId, result.revision == command.expectedRevision + 1,
                      result.reused != nil else { throw NativeDataError.invalidResponse }
                pending = nil
                if command.action == "save", result.state == "explicit",
                   shownOperations.insert(command.operationId).inserted {
                    toast = .init(operationId: command.operationId, revision: result.revision)
                } else if command.action != "save" {
                    toast = nil
                    notice = command.action == "undo" ? "undone" : command.action
                }
            } else {
                // Read/reconnect never creates a toast, even when resolving an
                // unknown write. Older operations are not resubmitted as new ones.
                if let pending, result.operationId == pending.operationId || result.revision > pending.expectedRevision {
                    self.pending = nil
                }
                if let toast, toast.revision != result.revision || toast.operationId != result.operationId { self.toast = nil }
            }
            snapshot = result
        } catch {
            guard scope == captured, currentScope() == captured else { return }
            if case NativeDataError.server(let code) = error,
               ["PACE_CONFLICT", "PACE_OPERATION_REUSE", "PACE_STALE_SOURCE"].contains(code) {
                pending = nil; snapshot = nil; toast = nil; notice = "conflict"
            } else { notice = "retry" }
        }
    }
}
