import Foundation
import Observation

@MainActor struct NativeTripLifecycleClient {
    var current: () -> NativeDataScope?
    var read: (NativeDataScope, String?, Int?) async throws -> Data
    var saved: (NativeDataScope) throws -> NativeTripLifecycleJournal?
    var remember: (NativeTripLifecycleCommand, NativeDataScope) throws -> NativeTripLifecycleJournal
    var submit: (NativeTripLifecycleJournal, NativeDataScope) async throws -> Data
    var recover: (NativeTripLifecycleJournal, NativeDataScope) async throws -> Data
    var abandon: (NativeTripLifecycleJournal, NativeDataScope) async throws -> Data
    var complete: (NativeTripLifecycleJournal, NativeDataScope) throws -> Void

    init(session: NativeSession) {
        current = { session.dataScope }
        read = { try await session.tripLifecycleRead(actor: $0, afterTripID: $1, revision: $2) }
        saved = { try session.tripLifecycleRecovery(actor: $0) }
        remember = { try session.rememberTripLifecycle($0, actor: $1) }
        submit = { try await session.tripLifecycleSubmit($0, actor: $1) }
        recover = { try await session.tripLifecycleOperation($0, actor: $1) }
        abandon = { try await session.abandonTripLifecycle($0, actor: $1) }
        complete = { try session.completeTripLifecycle($0, actor: $1) }
    }
    init(current: @escaping () -> NativeDataScope?, read: @escaping (NativeDataScope, String?, Int?) async throws -> Data,
         saved: @escaping (NativeDataScope) throws -> NativeTripLifecycleJournal?,
         remember: @escaping (NativeTripLifecycleCommand, NativeDataScope) throws -> NativeTripLifecycleJournal,
         submit: @escaping (NativeTripLifecycleJournal, NativeDataScope) async throws -> Data,
         recover: @escaping (NativeTripLifecycleJournal, NativeDataScope) async throws -> Data,
         abandon: @escaping (NativeTripLifecycleJournal, NativeDataScope) async throws -> Data,
         complete: @escaping (NativeTripLifecycleJournal, NativeDataScope) throws -> Void) {
        self.current = current; self.read = read; self.saved = saved; self.remember = remember
        self.submit = submit; self.recover = recover; self.abandon = abandon; self.complete = complete
    }
}

@MainActor @Observable final class NativeTripLifecycleStore {
    var journalObservation: NativeJournalDataObservation?

    private(set) var scope: NativeDataScope?
    private(set) var snapshot: NativeTripLifecycleSnapshot?
    private(set) var trips: [NativeTripLifecycleTrip] = []
    private(set) var nextTripID: String?
    private(set) var pending: NativeTripLifecycleJournal?
    private(set) var receipt: NativeTripLifecycleTerminal?
    private(set) var notice: String?
    private(set) var busy = false
    private var generation = UUID()
    private var deadline: TimeInterval = 0

    func bind(_ actor: NativeDataScope?) {
        guard scope != actor else { return }
        generation = UUID(); scope = actor; snapshot = nil; trips = []; nextTripID = nil
        pending = nil; receipt = nil; notice = nil; busy = false; deadline = 0
    }
    /// Background/navigation hides qualification without deleting a pending journal.
    func suspend() {
        generation = UUID(); snapshot = nil; trips = []; nextTripID = nil; deadline = 0; receipt = nil; busy = false
    }
    func visible(_ actor: NativeDataScope?) -> NativeTripLifecycleSnapshot? {
        guard actor != nil, scope == actor, ProcessInfo.processInfo.systemUptime < deadline else { return nil }
        return snapshot
    }
    func load(_ client: NativeTripLifecycleClient, next: Bool = false) async {
        bind(client.current())
        guard !busy, let actor = scope, client.current() == actor else { return }
        let own = generation, started = ProcessInfo.processInfo.systemUptime
        let prior = next ? visible(actor) : nil
        let cursor = next ? nextTripID : nil
        if next && (prior == nil || cursor == nil) { return }
        busy = true
        defer { if generation == own { busy = false } }
        do {
            pending = try client.saved(actor)
            let bytes = try await client.read(actor, cursor, prior?.revision)
            guard generation == own, client.current() == actor, !Task.isCancelled else { return }
            let value = try NativeTripLifecycleSnapshot(bytes: bytes, actor: actor)
            if let prior, let cursor {
                guard value.sessionID == prior.sessionID, value.revision == prior.revision,
                      value.capacity == prior.capacity, value.trips.allSatisfy({ $0.id > cursor }),
                      Set(trips.map(\.id)).isDisjoint(with: value.trips.map(\.id)) else { throw NativeDataError.invalidResponse }
                trips += value.trips
            } else { trips = value.trips }
            if value.nextTripID == nil {
                guard trips.filter({ $0.state == .draft }).count == value.capacity.draftCount,
                      trips.filter({ $0.state == .legacy }).count == value.capacity.legacyCount,
                      trips.filter({ $0.state == .active }).map(\.id) == (value.capacity.activeTripId.map({ [$0] }) ?? []) else { throw NativeDataError.invalidResponse }
            }
            snapshot = value; nextTripID = value.nextTripID; deadline = started + 30; notice = nil
        } catch {
            guard generation == own, client.current() == actor else { return }
            snapshot = nil; trips = []; nextTripID = nil; deadline = 0; failed(error)
        }
    }

    func perform(_ action: NativeTripLifecycleCommand.Action, trip: NativeTripLifecycleTrip? = nil,
                 title: String? = nil, state: NativeTripLifecycleState? = nil,
                 preferences: [NativeTripPreferenceReview.Reference] = [], reviewed: NativeTripLifecycleSnapshot,
                 client: NativeTripLifecycleClient) async {
        guard !busy, pending == nil, let actor = scope, let view = visible(client.current()), client.current() == actor,
              view == reviewed, trip == nil || trips.contains(trip!) else { notice = "reviewExpired"; return }
        do {
            receipt = nil
            let command = try NativeTripLifecycleCommand(action: action, tripID: trip?.id ?? UUID().uuidString.lowercased(),
                sessionID: view.sessionID, revision: view.revision, activeTripID: view.capacity.activeTripId,
                headVersion: trip?.headVersion, title: title, state: state, preferences: preferences)
            pending = try client.remember(command, actor)
            await resolve(client, resend: true)
        } catch { failed(error) }
    }

    func resolve(_ client: NativeTripLifecycleClient, resend: Bool = false, abandon: Bool = false) async {
        guard !busy, let actor = scope, client.current() == actor else { return }
        let own = generation
        busy = true
        defer { if generation == own { busy = false } }
        do {
            guard let journal = try client.saved(actor), journal.matches(actor) else { throw NativeDataError.sessionUnavailable }
            pending = journal
            let command = try journal.command()
            let bytes: Data
            if abandon { bytes = try await client.abandon(journal, actor) }
            else if resend { bytes = try await client.submit(journal, actor) }
            else { bytes = try await client.recover(journal, actor) }
            guard generation == own, client.current() == actor, !Task.isCancelled else { return }
            let result = try resend || abandon ? NativeTripLifecycleTerminal(bytes: bytes, actor: actor, command: command)
                : NativeTripLifecycleTerminal.recovery(bytes: bytes, actor: actor, command: command)
            guard let result else { notice = "unknown"; return }
            let journalTicket = journalObservation?.begin()
            try client.complete(journal, actor)
            let outcome: String
            switch result { case .applied: outcome = "acknowledged"; case .declined(let reason): outcome = reason }
            pending = nil; receipt = result; snapshot = nil; trips = []; deadline = 0; notice = outcome
            journalObservation?.finish(journalTicket, command.operationID)
            busy = false
            await load(client)
            if generation == own, snapshot != nil { notice = outcome }
        } catch {
            guard generation == own, client.current() == actor else { return }
            snapshot = nil; trips = []; nextTripID = nil; deadline = 0; failed(error)
        }
    }

    private func failed(_ error: Error) {
        if case NativeDataError.server(let code) = error { notice = code }
        else if case NativeDataError.sessionUnavailable = error { notice = "storage" }
        else { notice = "unknown" }
    }
}
