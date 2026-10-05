import Foundation
import Observation

struct NativeMaterialReferenceTrip: Identifiable, Equatable {
    let id: String
    let label: String?
    let headVersion: Int
    let state: String
    init(id: String, label: String?, headVersion: Int, state: String) {
        self.id = id; self.label = label; self.headVersion = headVersion; self.state = state
    }
    init(_ raw: Any, scope: NativeMaterialReferenceScope) throws {
        let w = NativeCommunityWire.self
        let v = try w.object(raw, ["tripId", "tripVersion", "label", "state"])
        id = try NativeMaterialReferenceCommand.id(v["tripId"])
        label = try w.optional(v["label"], { try w.text($0, max: 1000) })
        headVersion = try w.integer(v["tripVersion"], max: 9_007_199_254_740_991, minimum: 0)
        state = try w.text(v["state"], max: 8)
        guard ["active", "archived", "deleted", "retained"].contains(state),
              !["deleted", "retained"].contains(state) || scope == .progress && label == nil else { throw NativeDataError.invalidResponse }
    }
}

/// Source-specific metadata discovery includes archived records and retained
/// progress after Trip deletion. It grants no body read or Trip write authority.
@MainActor @Observable final class NativeMaterialReferenceTrips {
    private(set) var rows: [NativeMaterialReferenceTrip] = []
    private(set) var selected: NativeMaterialReferenceTrip?
    private(set) var next: NativeMaterialReferenceCursor?
    private(set) var busy = false
    private(set) var unavailable = false
    private var generation = UUID()
    private var actor: NativeCommunitySafetyActor?
    private var lease: NativeMaterialReferenceLease?
    private let uptime: () -> TimeInterval
    private let now: () -> Date

    init(uptime: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }, now: @escaping () -> Date = Date.init) {
        self.uptime = uptime; self.now = now
    }
    func clear() { generation = UUID(); actor = nil; rows = []; selected = nil; next = nil; lease = nil; busy = false; unavailable = false }
    func visible(_ current: NativeCommunitySafetyActor?) -> [NativeMaterialReferenceTrip] {
        actor != nil && actor == current && lease?.valid(uptime: uptime(), now: now()) == true ? rows : []
    }
    func currentSelection(_ current: NativeCommunitySafetyActor?) -> NativeMaterialReferenceTrip? {
        visible(current).contains(where: { $0 == selected }) ? selected : nil
    }
    func select(_ trip: NativeMaterialReferenceTrip, current: NativeCommunitySafetyActor?) {
        guard !busy, visible(current).contains(trip) else { return }
        selected = trip
    }
    func load(scope: NativeMaterialReferenceScope, nextPage: Bool = false, client: NativeMaterialReferenceClient) async {
        guard !busy, let actor = client.current(), !Task.isCancelled else { return }
        let cursor = nextPage ? next : nil
        if nextPage && (self.actor != actor || cursor == nil || visible(actor).isEmpty) { return }
        clear(); self.actor = actor
        let own = generation, started = uptime()
        busy = true
        defer { if own == generation { busy = false } }
        do {
            let command = try NativeMaterialReferenceCommand.trips(scope: scope, cursor: cursor)
            let bytes = try await client.request(command.body, actor)
            guard self.actor == actor, client.current() == actor, own == generation, !Task.isCancelled else { throw NativeDataError.staleSessionResponse }
            let page = try NativeMaterialReferenceProtocol.trips(bytes, command: command, actor: actor, now: now())
            lease = try .init(started: started, received: uptime(), now: now(), expiresAt: page.expiresAt)
            rows = page.trips; next = page.next
        } catch { if own == generation { rows = []; selected = nil; next = nil; lease = nil; unavailable = true } }
    }
}
