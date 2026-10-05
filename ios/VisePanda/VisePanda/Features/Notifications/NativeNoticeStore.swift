import Foundation
import Observation

@MainActor @Observable
final class NativeNoticeStore {
    private(set) var view: NativeNoticeView?
    private(set) var pending: NativeNotificationPending?
    private(set) var busy = false
    private(set) var notice: String?
    private(set) var scope: NativeDataScope?
    private(set) var tripId: String?
    private var generation = UUID()

    func bind(scope: NativeDataScope?, tripId: String) {
        guard self.scope != scope || self.tripId != tripId else { return }
        self.scope = scope; self.tripId = tripId; generation = UUID()
        view = nil; pending = nil; busy = false; notice = nil
    }

    func load(scope: NativeDataScope, current: () -> NativeDataScope?,
              read: () throws -> NativeNotificationPending?, request: (String, String, Data?) async throws -> Data) async {
        guard !busy, self.scope == scope, current() == scope, let tripId else { return }
        let own = generation; busy = true; notice = nil; view = nil
        defer { if generation == own { busy = false } }
        do {
            pending = try read()
            let bytes = try await request("api/trips/native/v2/\(tripId)/reminders/delivery", "GET", nil)
            guard own == generation, current() == scope, !Task.isCancelled else { return }
            let result = try NativeNoticeView.decode(bytes, tripId: tripId)
            guard result.mutationReceipt == nil else { throw NativeDataError.invalidResponse }
            view = result // GET never consumes the unresolved command.
            if !result.complete { notice = "SOURCE_UNAVAILABLE" }
        } catch { if own == generation, current() == scope { notice = Self.code(error) } }
    }

    func perform(command: NativeNoticeCommand?, scope: NativeDataScope, abandon: Bool = false, current: () -> NativeDataScope?,
                 read: () throws -> NativeNotificationPending?, retain: (NativeNoticeCommand) throws -> NativeNotificationPending,
                 complete: (NativeNotificationPending, NativeNoticeView.MutationReceipt) throws -> Void,
                 request: (String, String, Data?) async throws -> Data) async {
        guard !busy, self.scope == scope, current() == scope else { return }
        let own = generation; busy = true; notice = nil; view = nil
        defer { if generation == own { busy = false } }
        do {
            let original: NativeNotificationPending
            if let command { original = try retain(command) }
            else {
                guard let existing = try read(), existing.matches(scope) else { throw NativeDataError.invalidResponse }
                original = existing
            }
            pending = original
            let body = abandon ? try JSONSerialization.data(withJSONObject: ["action": "abandon", "input": ["command": original.command.object]], options: [.sortedKeys, .withoutEscapingSlashes]) : original.command.body
            let bytes = try await request(original.command.path, "POST", body)
            guard own == generation, current() == scope, !Task.isCancelled else { return }
            let result = try NativeNoticeView.decode(bytes, tripId: original.command.tripId)
            guard let receipt = result.mutationReceipt, receipt.matches(original.command) else { throw NativeDataError.invalidResponse }
            try complete(original, receipt); pending = nil
            if result.tripId == tripId { view = result }
            notice = result.mutationReceipt?.outcome == "cancelled" ? "REMINDER_OPERATION_CANCELLED" : result.complete ? "REMINDER_OPERATION_CONFIRMED" : "SOURCE_UNAVAILABLE"
        } catch {
            if own == generation, current() == scope { notice = Self.code(error) }
        }
    }

    static func code(_ error: Error) -> String {
        if case NativeDataError.server(let code) = error { return code }
        if case NativeDataError.invalidResponse = error { return "INVALID_RESPONSE" }
        return "REMINDER_ACK_UNKNOWN"
    }
}
