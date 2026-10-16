import Foundation

/// A read-only projection of the original Store. Flags describe UI eligibility, not server authority.
struct NativeQAHistorySnapshot {
    let scope: NativeDataScope
    let sessions: [NativeQASession]
    let selectedID: String?
    let isLoading: Bool
    let canSelect: Bool
    let canCreate: Bool
}

/// Main supplies live closures from the original Store and active/readable session gate.
/// No snapshot, credentials, search text, or selected session is persisted here.
@MainActor
struct NativeQAHistorySource {
    let currentScope: () -> NativeDataScope?
    let expectedScope: () -> NativeDataScope?
    let read: () -> NativeQAHistorySnapshot?
    let onSelect: (String) -> Void
    let onCreate: () -> Void

    func readable() -> NativeQAHistorySnapshot? {
        guard let expected = expectedScope(), currentScope() == expected,
              let snapshot = read(), snapshot.scope == expected,
              snapshot.sessions.count <= 200,
              snapshot.sessions.allSatisfy(\.valid),
              Set(snapshot.sessions.map(\.id)).count == snapshot.sessions.count,
              currentScope() == expected, expectedScope() == expected else { return nil }
        return snapshot
    }

    @discardableResult
    func select(_ id: String, displayedScope: NativeDataScope) -> Bool {
        guard let snapshot = readable(), snapshot.scope == displayedScope,
              !snapshot.isLoading, snapshot.canSelect,
              snapshot.sessions.contains(where: { $0.id == id }) else { return false }
        onSelect(id)
        return true
    }

    @discardableResult
    func create(displayedScope: NativeDataScope) -> Bool {
        guard let snapshot = readable(), snapshot.scope == displayedScope,
              !snapshot.isLoading, snapshot.canCreate else { return false }
        onCreate()
        return true
    }
}

enum NativeQAHistoryPresentation {
    enum ListState: Equatable { case loading, empty, noMatches, sessions }

    static func filtered(_ sessions: [NativeQASession], query: String) -> [NativeQASession] {
        let query = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return sessions }
        // Only the server label is searchable; do not derive topics from messages or invent titles.
        return sessions.filter { $0.label.localizedStandardContains(query) }
    }

    static func state(_ snapshot: NativeQAHistorySnapshot, query: String) -> ListState {
        if !filtered(snapshot.sessions, query: query).isEmpty { return .sessions }
        if snapshot.isLoading { return .loading }
        return snapshot.sessions.isEmpty ? .empty : .noMatches
    }
}
