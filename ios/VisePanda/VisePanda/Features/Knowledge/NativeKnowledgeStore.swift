import Foundation
import Observation

@MainActor
@Observable
final class NativeKnowledgeStore {
    enum State { case idle, loading, ready, empty, unavailable }
    private(set) var rows: [NativeKnowledgeStatement] = []
    private(set) var state = State.idle
    private(set) var scope: NativeDataScope?
    private(set) var selection: NativeKnowledgeSelection?
    private(set) var deadline: TimeInterval = 0
    private var generation = UUID()
    private let uptime: () -> TimeInterval

    init(uptime: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) { self.uptime = uptime }

    func clear() {
        generation = UUID()
        rows = []; state = .idle; scope = nil; selection = nil; deadline = 0
    }

    func isCurrent(scope: NativeDataScope?, selection: NativeKnowledgeSelection) -> Bool {
        scope != nil && self.scope == scope && self.selection == selection && deadline > uptime()
    }

    var refreshDelay: TimeInterval { max(0, deadline - uptime()) }

    func load(scope: NativeDataScope?, selection: NativeKnowledgeSelection, fetch: () async throws -> Data) async {
        clear()
        guard let scope, selection.valid, !Task.isCancelled else { return }
        self.scope = scope; self.selection = selection; state = .loading
        let own = generation, started = uptime()
        do {
            let bytes = try await fetch()
            guard generation == own, !Task.isCancelled else { return }
            guard bytes.count <= 1_000_000 else { throw NativeDataError.invalidResponse }
            let reply = try JSONDecoder().decode(NativeKnowledgeReply.self, from: bytes).data
            let lifetime = try reply.lifetime(for: selection, elapsed: uptime() - started)
            rows = reply.statements; deadline = uptime() + lifetime
            state = rows.isEmpty ? .empty : .ready
        } catch {
            guard generation == own else { return }
            rows = []; deadline = 0
            state = Task.isCancelled ? .idle : .unavailable
        }
    }
}
