import Foundation
import Observation

@MainActor @Observable
final class NativeTaskActivityStore {
    enum State { case idle, loading, ready, unavailable }
    private(set) var state = State.idle
    private(set) var boundSelection: NativeTaskActivitySelection?
    private(set) var boundActive = false
    private var activity: NativeTaskActivity?
    private var selection: NativeTaskActivitySelection?
    private var generation = UUID()
    private var deadline: TimeInterval = 0
    private let uptime: () -> TimeInterval
    init(uptime: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) { self.uptime = uptime }

    func bind(selection current: NativeTaskActivitySelection?, active: Bool) {
        guard boundSelection != current || boundActive != active else { return }
        clear(); boundSelection = current; boundActive = active
    }
    func clear() {
        generation = UUID(); activity = nil; selection = nil; deadline = 0; state = .idle
    }
    func visible(selection current: NativeTaskActivitySelection?, active: Bool) -> NativeTaskActivity? {
        guard active, let current, current.valid, selection == current, state == .ready, deadline > uptime() else { return nil }
        return activity
    }
    func expireIfNeeded() {
        if state == .ready && deadline <= uptime() { clear() }
    }
    func load(selection requested: NativeTaskActivitySelection?, currentSelection: () -> NativeTaskActivitySelection?,
              active: () -> Bool, request: (String, String) async throws -> Data) async {
        guard let requested, requested.valid, requested == boundSelection, boundActive,
              requested == currentSelection(), active(), !Task.isCancelled else { return }
        clear()
        let own = generation, started = uptime()
        selection = requested; state = .loading
        do {
            let bytes = try await request(requested.conversationID, requested.taskID)
            guard generation == own else { return }
            guard currentSelection() == requested, boundSelection == requested, boundActive, active(), !Task.isCancelled else { clear(); return }
            guard bytes.count <= 10_000, uptime() < started + 30 else { throw NativeDataError.invalidResponse }
            let decoded = try JSONDecoder().decode(NativeTaskActivity.self, from: bytes)
            guard decoded.matches(requested) else { throw NativeDataError.invalidResponse }
            activity = decoded; state = .ready; deadline = started + 30
        } catch {
            guard generation == own else { return }
            guard currentSelection() == requested, boundSelection == requested, boundActive, active() else { clear(); return }
            activity = nil; deadline = 0; state = Task.isCancelled ? .idle : .unavailable
        }
    }
}
