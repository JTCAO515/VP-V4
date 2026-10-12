import Foundation
import Observation

struct NativeJourneyGoalReturnContext: Equatable {
    let actor: NativeCommunitySafetyActor
    let source: NativeJourneyGoalReturnWire.Scope
}

/// Read-only ephemeral consumer. It cannot choose, save, create a goal, bill or
/// publish an outcome. The original readers remain the source authority.
@MainActor @Observable
final class NativeJourneyGoalReturnStore {
    struct SavedDecision {
        let reference: NativeJourneyGoalReturnWire.Reference
        let title: String
        let summary: String
        let chosenOptionID: String
    }
    enum State: Equatable { case idle, loading, unknown, unavailable, ready }
    var requestGeneration: UUID { generation }
    private(set) var state = State.idle
    private var decision: SavedDecision?
    private var context: NativeJourneyGoalReturnContext?
    private var generation = UUID()
    private var deadline: TimeInterval = 0
    private var started: TimeInterval = 0
    private let uptime: () -> TimeInterval
    init(uptime: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) { self.uptime = uptime }
    func clear() { generation = UUID(); context = nil; decision = nil; deadline = 0; state = .idle }
    func expireRequest(_ own: UUID) { if generation == own, state == .loading { clear() } }
    func visible(current: NativeJourneyGoalReturnContext?) -> SavedDecision? {
        guard let current, context == current, uptime().isFinite, uptime() >= started, uptime() < deadline else { return nil }
        return decision
    }
    func load(_ target: NativeJourneyGoalReturnContext, current: @escaping () -> NativeJourneyGoalReturnContext?,
              discover: (NativeJourneyGoalReturnWire.Scope) async throws -> Data,
              read: (String, Int) async throws -> Data) async {
        clear()
        guard target.source.valid, current() == target, !Task.isCancelled else { return }
        context = target; state = .loading; started = uptime()
        let own = generation, beginning = started
        func qualified() -> Bool {
            let now = uptime()
            return generation == own && current() == target && !Task.isCancelled
                && now.isFinite && now >= beginning && now - beginning < 20
        }
        do {
            let bytes = try await discover(target.source)
            guard qualified() else { if generation == own { clear() }; return }
            guard case .reference(let reference) = try NativeJourneyGoalReturnWire.decode(bytes, expected: target.source) else {
                state = .unknown; return
            }
            let artifact = try await read(reference.artifactID, reference.revision)
            guard qualified() else { if generation == own { clear() }; return }
            guard let record = try NativeFiveResultRecord.decode(artifact, artifactID: reference.artifactID, revision: reference.revision),
                  record.current, record.source.goalId == target.source.goalID,
                  record.source.goalVersion == target.source.goalVersion,
                  record.source.inputMessageId == target.source.parentMessageID,
                  record.source.inputSequence == target.source.inputSequence,
                  case .decision(let choice) = record.content, choice.state == "chosen",
                  let selected = choice.chosenOptionID else { state = .unknown; return }
            let final = try await discover(target.source)
            guard qualified() else { if generation == own { clear() }; return }
            guard try NativeJourneyGoalReturnWire.decode(final, expected: target.source) == .reference(reference) else {
                state = .unknown; return
            }
            decision = .init(reference: reference, title: choice.title, summary: choice.summary, chosenOptionID: selected)
            deadline = beginning + 20; state = .ready
        } catch {
            guard generation == own else { return }
            decision = nil; deadline = 0; state = .unavailable
        }
    }
}
