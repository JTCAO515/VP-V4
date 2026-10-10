import Foundation
import Observation

/// This store owns transport progress only. Task/result readers retain their own
/// values, freshness, deletion fences and independent per-task selection.
@MainActor @Observable
final class NativeAssistantEventsStore {
    enum State: Equatable { case idle, reading, ready, unavailable }
    private(set) var state = State.idle
    private(set) var hasMore = false
    private(set) var afterSequence = 0
    private(set) var boundSelection: NativeAssistantEventsSelection?
    @ObservationIgnored private let projection = NativeAssistantEventsProjection()
    @ObservationIgnored private var generation = UUID()
    @ObservationIgnored private var active = false
    @ObservationIgnored private var inFlight = false
    @ObservationIgnored private let uptime: () -> TimeInterval

    init(uptime: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) {
        self.uptime = uptime
    }

    func bind(_ selection: NativeAssistantEventsSelection?, active: Bool,
              clearDisplays: () -> Void) {
        guard boundSelection != selection || self.active != active else { return }
        generation = UUID(); inFlight = false; state = .idle; hasMore = false; afterSequence = 0
        clearDisplays()
        boundSelection = selection?.valid == true ? selection : nil
        self.active = active && boundSelection != nil
        projection.bind(boundSelection, active: self.active)
    }

    /// Caller invokes only after an original authoritative conversation read.
    /// Persistence is a hint, never a reason to display restored task/result bytes.
    func restoreCursor(_ cursor: Int, selection: NativeAssistantEventsSelection,
                       qualified: Bool) throws {
        guard qualified, active, !inFlight, boundSelection == selection,
              (0...999_999_999_999_999).contains(cursor) else { throw NativeDataError.invalidResponse }
        afterSequence = cursor
    }

    /// One bounded finite replay request. Background/replacement invalidates it;
    /// read failures leave immutable intake/planning journals outside this store.
    func read(selection: NativeAssistantEventsSelection,
              current: @escaping () -> NativeAssistantEventsSelection?,
              request: (String, Int) async throws -> Data,
              clear: (NativeAssistantEventsReference.Object) -> Void,
              retire: (NativeAssistantEventsReference.Object?) -> Void = { _ in },
              readCurrent: @escaping (NativeAssistantEventsDecoder.Event) async throws -> Bool,
              saveCursor: @escaping (NativeAssistantEventsSelection, Int) throws -> Void,
              clearDisplays: () -> Void) async {
        guard active, boundSelection == selection, current() == selection,
              !inFlight, !Task.isCancelled else { return }
        let own = generation, started = uptime(), requestedCursor = afterSequence
        guard started.isFinite else { return }
        inFlight = true; state = .reading
        defer { if generation == own { inFlight = false } }
        func valid() -> Bool {
            let now = uptime()
            return generation == own && active && boundSelection == selection && current() == selection &&
                !Task.isCancelled && now.isFinite && now >= started && now < started + 30
        }
        do {
            let bytes = try await request(selection.conversationID, requestedCursor)
            guard valid() else { if generation == own { fail(clearDisplays) }; return }
            let page = try NativeAssistantEventsDecoder.decode(bytes, conversationID: selection.conversationID, after: requestedCursor)
            for event in page.events {
                guard valid() else { if generation == own { fail(clearDisplays) }; return }
                let qualifiedRead: () async throws -> Bool = {
                        let eligible = try await readCurrent(event)
                        guard valid() else { throw NativeDataError.staleSessionResponse }
                        return eligible
                    }
                let persist: (NativeAssistantEventsSelection, String) throws -> Void = { captured, _ in
                        guard valid() else { throw NativeDataError.staleSessionResponse }
                        try saveCursor(captured, event.sequence)
                    }
                let outcome: NativeAssistantEventsProjection.Outcome
                if case .retired(let retired) = event.change {
                    outcome = try await projection.consumeRetirement(eventID: event.eventID, sequence: event.sequence,
                        retiredSequence: retired, selection: selection, clear: retire,
                        readCurrent: qualifiedRead, saveCursor: persist)
                } else {
                    guard let reference = event.reference else { throw NativeDataError.invalidResponse }
                    outcome = try await projection.consume(reference, selection: selection, clear: clear,
                        readCurrent: { _ in try await qualifiedRead() }, saveCursor: persist)
                }
                guard valid(), outcome == .applied || outcome == .duplicate else {
                    if generation == own { fail(clearDisplays) }; return
                }
                afterSequence = event.sequence
            }
            guard valid(), afterSequence == page.afterSequence else {
                if generation == own { fail(clearDisplays) }; return
            }
            hasMore = page.hasMore; state = .ready
        } catch {
            guard generation == own else { return }
            // A newer original source read can supersede this read while actor and
            // selection remain current. Keep that projection, ack nothing, reconnect.
            if case NativeDataError.staleSessionResponse = error, valid() {
                hasMore = false; state = .ready; return
            }
            fail(clearDisplays)
        }
    }

    private func fail(_ clearDisplays: () -> Void) {
        clearDisplays(); hasMore = false; state = .unavailable
    }
}
