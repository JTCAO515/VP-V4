import Foundation
import Observation

/// Uses the existing result envelope and current reads, with no extra artifact cache,
/// Profile store, writer, automatic retry, or confirmation authority.
@MainActor @Observable
final class NativeTravelDirectionsStore {
    struct Key: Equatable { let scope: NativeDataScope; let artifactID: String }
    struct Pending {
        let action: NativeTravelDirectionsAction
        let revision: Int
        let body: Data
    }
    private(set) var key: Key?
    private(set) var record: NativeFiveResultRecord?
    private(set) var pending: Pending?
    private(set) var proposal: NativeTravelDirectionsReceipt.Proposal?
    private(set) var busy = false
    private(set) var notice: String?
    var editing = NativeTravelDirectionsEditing(days: [])
    private var generation = UUID()
    private var eventGeneration = UUID()
    private(set) var readRevision: Int?
    private(set) var editorRevision: Int?
    var editingNeedsReview: Bool { editing.hasChanges && editorRevision != readRevision }
    private var deadline: TimeInterval = 0
    private let uptime: () -> TimeInterval
    init(uptime: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) { self.uptime = uptime }

    func clear() {
        generation = UUID(); key = nil; record = nil; deadline = 0
        editing = .init(days: []); readRevision = nil; editorRevision = nil; eventGeneration = UUID(); pending = nil; proposal = nil; busy = false; notice = nil
    }
    func visible(current: Key?) -> NativeFiveResultRecord? {
        guard current == key, current != nil, uptime() < deadline else { return nil }
        return record
    }
    func content(current: Key?) -> NativeTravelDirectionsContent? {
        guard let visible = visible(current: current), case .directions(let content) = visible.content else { return nil }
        return content
    }
    func canAct(current: Key?) -> Bool {
        visible(current: current)?.current == true && !busy && pending == nil
    }
    func load(key requested: Key, revision: Int, current: @escaping () -> Key?, read: (String, Int) async throws -> Data) async {
        if key != requested { clear() }
        guard !busy, requested == current(), UUID(uuidString: requested.artifactID) != nil,
              (1...1000).contains(revision) else { return }
        generation = UUID(); let own = generation, event = eventGeneration, start = uptime()
        key = requested; record = nil; deadline = 0; proposal = nil; busy = true
        defer { if generation == own { busy = false } }
        do {
            let bytes = try await read(requested.artifactID, revision)
            guard generation == own, requested == current(), !Task.isCancelled else { return }
            guard eventGeneration == event, uptime() - start < 30, let value = try NativeFiveResultRecord.decode(bytes, artifactID: requested.artifactID, revision: revision),
                  case .directions(let content) = value.content else { throw NativeDataError.invalidResponse }
            readRevision = value.revision; record = value; deadline = start + 30; notice = value.current ? nil : "stale"
            if pending == nil && !editing.hasChanges { editing = Self.editor(content); editorRevision = value.revision }
        } catch {
            guard generation == own, current() == requested else { return }
            failed(error)
        }
    }

    func perform(_ action: NativeTravelDirectionsAction, current: @escaping () -> Key?,
                 post: (String, Data) async throws -> Data, read: (String, Int) async throws -> Data) async {
        guard canAct(current: current()), let target = key, let record,
              case .directions(let content) = record.content else { return }
        switch action {
        case .choose(let id): guard !editing.hasChanges, content.directions.contains(where: { $0.id == id }) else { return }
        case .save: guard content.selectedDirectionId != nil, !editing.hasChanges else { return }
        case .edit(let changes):
            guard let saved = content.draft, editing.valid, !editingNeedsReview, !changes.isEmpty,
                  changes.allSatisfy({ changed in saved.days.contains { $0.ordinal == changed.ordinal } }) else { return }
        case .bind(let tripID, let version, let start):
            guard let saved = content.draft, !saved.days.isEmpty, !editing.hasChanges,
                  record.source.tripId == tripID, record.source.tripVersion == version,
                  content.intake.dates == nil || content.intake.dates?.startDate == start else { return }
        }
        do {
            let bytes = try action.body(artifactID: target.artifactID, revision: record.revision, operationID: UUID().uuidString.lowercased())
            pending = .init(action: action, revision: record.revision, body: bytes)
            await sendPending(current: current, post: post, read: read)
        } catch { notice = "invalid" }
    }
    func retry(current: @escaping () -> Key?, post: (String, Data) async throws -> Data,
               read: (String, Int) async throws -> Data) async {
        // Explicit retry uses exactly the original operation/body, including source revision.
        await sendPending(current: current, post: post, read: read)
    }
    private func sendPending(current: @escaping () -> Key?, post: (String, Data) async throws -> Data,
                             read: (String, Int) async throws -> Data) async {
        guard !busy, let request = pending, let target = key, target == current(), !Task.isCancelled else { return }
        let own = generation, event = eventGeneration; busy = true; notice = nil; proposal = nil
        defer { if generation == own { busy = false } }
        do {
            let bytes = try await post(request.action.endpoint, request.body)
            guard generation == own, current() == target, !Task.isCancelled else { return }
            let receipt = try NativeTravelDirectionsReceipt.decode(bytes, action: request.action,
                artifactID: target.artifactID, expectedRevision: request.revision)
            readRevision = receipt.revision
            let start = uptime()
            let nextBytes = try await read(receipt.artifactID, receipt.revision)
            guard generation == own, current() == target, !Task.isCancelled else { return }
            guard eventGeneration == event else { notice = "unconfirmed"; return }
            guard uptime() - start < 30, let fresh = try NativeFiveResultRecord.decode(nextBytes, artifactID: receipt.artifactID, revision: receipt.revision),
                  fresh.current, case .directions(let content) = fresh.content else { throw NativeDataError.staleSessionResponse }
            switch request.action {
            case .choose(let id): guard content.selectedDirectionId == id, content.draft == nil else { throw NativeDataError.invalidResponse }
            case .save: guard content.draft != nil else { throw NativeDataError.invalidResponse }
            case .edit(let changes):
                guard let saved = content.draft, changes.allSatisfy({ changed in
                    saved.days.contains { $0.ordinal == changed.ordinal && $0.destination == changed.destination && $0.activities == changed.activities }
                }) else { throw NativeDataError.invalidResponse }
            case .bind:
                guard let proposal = receipt.proposal,
                      fresh.source.tripId == proposal.tripID, fresh.source.tripVersion == proposal.tripVersion else { throw NativeDataError.invalidResponse }
                let proposalBytes = try await read(proposal.artifactID, proposal.artifactRevision)
                guard generation == own, current() == target, !Task.isCancelled else { return }
                guard eventGeneration == event, uptime() - start < 30,
                      let reference = try NativeFiveResultRecord.decode(proposalBytes, artifactID: proposal.artifactID, revision: proposal.artifactRevision),
                      reference.current, reference.source.tripId == proposal.tripID, reference.source.tripVersion == proposal.tripVersion,
                      case .proposal(let id, let revision) = reference.content,
                      id == proposal.proposalID, revision == proposal.proposalRevision else { throw NativeDataError.invalidResponse }
                self.proposal = proposal
            }
            readRevision = fresh.revision; record = fresh; deadline = start + 30; editing = Self.editor(content); editorRevision = fresh.revision; pending = nil
        } catch {
            guard generation == own, current() == target else { return }
            failed(error)
        }
    }
    func suspend() { eventGeneration = UUID(); record = nil; deadline = 0; proposal = nil }
    func invalidateAssistantEvent(_ signal: NativeAssistantEventsInvalidation) {
        guard key?.scope == signal.selection.scope,
              signal.object == nil || signal.object == .artifact(key?.artifactID ?? "") else { return }
        eventGeneration = UUID(); record = nil; deadline = 0; proposal = nil
        // Preserve original pending request/body, editor and writer generation.
    }
    private func failed(_ error: Error) {
        record = nil; deadline = 0; proposal = nil
        if case NativeDataError.server(let code) = error,
           ["UNAUTHENTICATED", "DATA_POLICY_BLOCKED"].contains(code) { clear(); notice = "blocked"; return }
        if case NativeDataError.staleSessionResponse = error { pending = nil; notice = "stale"; return }
        notice = pending == nil ? "unavailable" : "unconfirmed"
    }
    static func editor(_ content: NativeTravelDirectionsContent) -> NativeTravelDirectionsEditing {
        .init(days: (content.draft?.days ?? []).map { .init(id: "relative_\($0.ordinal)", relativeDay: $0.ordinal,
            city: $0.destination, activities: $0.activities, fixed: false) })
    }
}
