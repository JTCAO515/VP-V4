import Foundation
import Observation

struct NativeLibraryPhraseReference: Identifiable {
    let phrase: NativeTranslationPhrase
    let policyID: String
    let noticeHash: String
    let scope: NativeDataScope
    var id: String { phrase.id }
}

/// A read-only consumer of the existing retained translation window.
@MainActor @Observable
final class NativeLibraryPhraseStore {
    private(set) var rows: [NativeTranslationPhrase] = []
    private(set) var opened: NativeTranslationPhrase?
    private(set) var policyID: String?
    private(set) var noticeHash: String?
    private(set) var scope: NativeDataScope?
    private(set) var state = "idle"
    private var generation = UUID()
    private var deadline: TimeInterval = 0
    private let uptime: () -> TimeInterval
    init(uptime: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) { self.uptime = uptime }
    func clear() {
        generation = UUID(); rows = []; opened = nil; policyID = nil; noticeHash = nil
        scope = nil; deadline = 0; state = "idle"
    }
    func isCurrent(_ requested: NativeDataScope?) -> Bool {
        state == "ready" && requested != nil && scope == requested && uptime() < deadline
    }
    /// nil means the window is not currently readable, never zero matches.
    /// Matching only reads the existing snapshot; it cannot renew its lifetime.
    func matches(scope requested: NativeDataScope?, query: String) -> [NativeTranslationPhrase]? {
        guard isCurrent(requested), query.utf16.count <= 120 else { return nil }
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines)
        return rows.filter { phrase in
            term.isEmpty || [phrase.original, phrase.translation ?? "", phrase.backTranslation ?? ""]
                .contains { $0.localizedStandardContains(term) }
        }
    }
    func reference(_ phrase: NativeTranslationPhrase, scope requested: NativeDataScope?) -> NativeLibraryPhraseReference? {
        guard isCurrent(requested), rows.contains(phrase), let scope, let policyID, let noticeHash else { return nil }
        return .init(phrase: phrase, policyID: policyID, noticeHash: noticeHash, scope: scope)
    }
    func load(scope requested: NativeDataScope?, exact: NativeLibraryPhraseReference? = nil,
              currentScope: () -> NativeDataScope?, request: NativeTranslationStore.Request) async {
        clear()
        guard let requested, requested == currentScope(), !Task.isCancelled,
              exact == nil || exact?.scope == requested else { return }
        let own = generation, started = uptime()
        scope = requested; state = "loading"
        // A fresh domain reader has no retained text to survive a failed refresh.
        let reader = NativeTranslationStore()
        await reader.load(scope: requested) { path, method, body in
            guard method == "GET", body == nil, ["api/translate/policy", "api/translate"].contains(path),
                  currentScope() == requested, self.generation == own, !Task.isCancelled else { throw NativeDataError.staleSessionResponse }
            let data = try await request(path, method, body)
            guard currentScope() == requested, self.generation == own, !Task.isCancelled else { throw NativeDataError.staleSessionResponse }
            return data
        }
        guard generation == own, !Task.isCancelled else { return }
        guard currentScope() == requested, reader.errorCode == nil, let policy = reader.policy,
              policy.consentState == .accepted, uptime() - started < 20 else { state = "unavailable"; return }
        let eligible = reader.phrases.filter { $0.state == "translated" && $0.valid }
        if let exact {
            guard policy.id == exact.policyID, policy.noticeHash == exact.noticeHash,
                  let phrase = eligible.first(where: { $0.id == exact.id }), phrase == exact.phrase else { state = "unavailable"; return }
            opened = phrase
        } else { rows = eligible }
        policyID = policy.id; noticeHash = policy.noticeHash
        deadline = started + 20; state = "ready"
    }
}

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
