import Foundation
import Observation

@MainActor @Observable
final class NativeLibrarySearchStore {
    private(set) var rows: [NativeLibrarySearchItem] = []
    private(set) var nextCursor: String?
    private(set) var scope: NativeDataScope?
    private(set) var state = "idle"
    private var query = ""
    private var cursor: String?
    private var generation = UUID()
    private var deadline: TimeInterval = 0
    private let uptime: () -> TimeInterval
    init(uptime: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) { self.uptime = uptime }

    func clear() {
        generation = UUID(); rows = []; nextCursor = nil; scope = nil; state = "idle"; deadline = 0; query = ""; cursor = nil
    }
    func isCurrent(_ current: NativeDataScope?, query: String = "", cursor: String? = nil) -> Bool {
        state == "result_search" && current != nil && current == scope
        && self.query == query && self.cursor == cursor && deadline > uptime()
    }
    func load(scope requested: NativeDataScope?, query: String = "", cursor: String? = nil, fetch: () async throws -> Data) async {
        clear()
        guard let requested, !Task.isCancelled else { return }
        scope = requested; state = "loading"; self.query = query; self.cursor = cursor
        let own = generation, started = uptime()
        do {
            let bytes = try await fetch()
            guard generation == own, !Task.isCancelled else { return }
            guard bytes.count <= 100_000 else { throw NativeDataError.invalidResponse }
            let envelope = try JSONDecoder().decode(NativeLibrarySearchEnvelope.self, from: bytes)
            guard envelope.version == 1, envelope.data.valid, uptime() - started < 30 else { throw NativeDataError.invalidResponse }
            rows = envelope.data.results ?? []; nextCursor = envelope.data.nextCursor
            state = envelope.data.kind; deadline = state == "result_search" ? started + 30 : 0
        } catch {
            guard generation == own else { return }
            rows = []; nextCursor = nil; deadline = 0; state = Task.isCancelled ? "idle" : "unavailable"
        }
    }
}

@MainActor
@Observable
final class NativeKnowledgeStore {
    enum State { case idle, loading, ready, empty, unavailable }
    private(set) var rows: [NativeKnowledgeStatement] = []
    private(set) var answer: NativeKnowledgeAnswer?
    private(set) var state = State.idle
    private(set) var scope: NativeDataScope?
    private(set) var selection: NativeKnowledgeSelection?
    private(set) var deadline: TimeInterval = 0
    private var generation = UUID()
    private let uptime: () -> TimeInterval

    init(uptime: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) { self.uptime = uptime }

    func clear() {
        generation = UUID()
        rows = []; answer = nil; state = .idle; scope = nil; selection = nil; deadline = 0
    }

    func isCurrent(scope: NativeDataScope?, selection: NativeKnowledgeSelection) -> Bool {
        scope != nil && self.scope == scope && self.selection == selection && deadline > uptime()
    }

    var refreshDelay: TimeInterval { max(0, deadline - uptime()) }

    func load(scope: NativeDataScope?, selection: NativeKnowledgeSelection, question: Bool = false, fetch: () async throws -> Data) async {
        clear()
        guard let scope, selection.valid, !Task.isCancelled else { return }
        self.scope = scope; self.selection = selection; state = .loading
        let own = generation, started = uptime()
        do {
            let bytes = try await fetch()
            guard generation == own, !Task.isCancelled else { return }
            guard bytes.count <= 1_000_000 else { throw NativeDataError.invalidResponse }
            let reply = try JSONDecoder().decode(NativeKnowledgeReply.self, from: bytes).data
            let lifetime = try reply.lifetime(for: selection, elapsed: uptime() - started, question: question)
            rows = reply.statements; answer = reply.answer; deadline = uptime() + lifetime
            state = rows.isEmpty ? .empty : .ready
        } catch {
            guard generation == own else { return }
            rows = []; answer = nil; deadline = 0
            state = Task.isCancelled ? .idle : .unavailable
        }
    }
}
