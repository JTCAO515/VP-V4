import Foundation
import Observation

@MainActor @Observable
final class NativeTravelIntakeStore {
    enum State: Equatable { case idle, loading, current, submitting, needsReview, unavailable }
    private(set) var state = State.idle
    private(set) var selection: NativeTravelIntakeSelection?
    private(set) var unavailableReason: String?
    private(set) var basis: NativeTravelIntakeBasis?
    var draft = NativeTravelIntake()
    private var generation = UUID()
    private var operation: Task<Void, Never>?
    private(set) var pending: NativeTravelIntakeSubmission?
    func bind(_ target: NativeTravelIntakeSelection?) {
        guard selection != target else { return }
        invalidate(); selection = target
    }
    func invalidate() {
        operation?.cancel(); operation = nil; generation = UUID(); selection = nil
        basis = nil; unavailableReason = nil; pending = nil; draft = NativeTravelIntake(); state = .idle
    }
    func load(request: @escaping (String, String) async throws -> Data, current: @escaping () -> NativeTravelIntakeSelection?) async {
        guard let target = selection, target.valid, target == current(), !Task.isCancelled else { return }
        let own = UUID(); generation = own; state = .loading; basis = nil; pending = nil
        do {
            let reply = try NativeTravelIntakeRead.decode(await request(target.conversationID, target.goalID))
            guard generation == own, selection == target, current() == target, !Task.isCancelled else { return }
            guard case .current(let value) = reply else {
                if case .unavailable(let reason) = reply { unavailableReason = reason }
                state = .unavailable; return
            }
            unavailableReason = nil
            guard value.conversationId == target.conversationID, value.goalId == target.goalID,
                  value.goalVersion == target.goalVersion, value.messageId == target.parentMessageID else { throw NativeDataError.invalidResponse }
            basis = value; draft = value.intake; state = .current
        } catch {
            guard generation == own, selection == target, current() == target else { return }
            if case NativeDataError.server(let code) = error,
               ["DATA_POLICY_BLOCKED", "UNAUTHENTICATED"].contains(code) { invalidate() }
            state = .unavailable
        }
    }
    func prepareUnrecorded(afterReview target: NativeTravelIntakeSelection) {
        guard target.valid, selection == target, unavailableReason == "intake_unrecorded", state == .unavailable else { return }
        draft = NativeTravelIntake(); state = .current
    }
    func submit(locale: String, current: @escaping () -> NativeTravelIntakeSelection?,
                post: @escaping (Data) async throws -> Data,
                read: @escaping (String, String) async throws -> Data,
                accepted: @escaping () async -> Void) {
        guard state == .current, let target = selection, target == current(), draft.valid,
              basis != nil || unavailableReason == "intake_unrecorded" else { return }
        let request = NativeTravelIntakeSubmission(conversationId: target.conversationID, goalId: target.goalID,
            messageId: UUID().uuidString.lowercased(), idempotencyKey: UUID().uuidString.lowercased(),
            policyId: target.policyID, locale: locale,
            text: locale == "zh" ? "我明确确认已填写的当前旅行需求。" : "I explicitly confirm the current travel requirements I entered.",
            relationship: basis == nil ? "follow_up" : "amendment", parentMessageId: target.parentMessageID, expectedGoalVersion: target.goalVersion,
            expectedIntakeRevision: basis?.intakeRevision ?? 0, intake: draft, memoryBasis: basis?.memoryBasis ?? [])
        let own = generation; pending = request; state = .submitting
        operation = Task {
            do {
                let bytes = try await post(JSONEncoder().encode(request))
                guard generation == own, selection == target, current() == target, !Task.isCancelled else { return }
                guard bytes.count <= 10_000 else { throw NativeDataError.invalidResponse }
                let receipt = try NativeTravelIntakeReceipt.decode(bytes)
                guard receipt.matches(request) else { throw NativeDataError.invalidResponse }
                // A receipt is never a current grant. Always obtain the current basis again.
                let fresh = try NativeTravelIntakeBasis.decode(await read(target.conversationID, target.goalID))
                guard generation == own, selection == target, current() == target, !Task.isCancelled else { return }
                guard receipt.current, fresh.conversationId == receipt.conversationId, fresh.goalId == receipt.goalId,
                      fresh.goalVersion == receipt.goalVersion, fresh.messageId == receipt.messageId,
                      fresh.intakeRevision == receipt.intakeRevision, fresh.contextDigest == receipt.contextDigest,
                      fresh.messageSequence == receipt.messageSequence, fresh.intake == request.intake, fresh.memoryBasis == request.memoryBasis else { throw NativeDataError.invalidResponse }
                self.basis = fresh; draft = fresh.intake; pending = nil; state = .current
                await accepted()
            } catch {
                guard generation == own, selection == target, current() == target else { return }
                if case NativeDataError.server(let code) = error,
                   ["DATA_POLICY_BLOCKED", "UNAUTHENTICATED"].contains(code) { invalidate(); state = .unavailable; return }
                self.basis = nil; pending = nil
                // Keep the full draft for explicit re-review, never retry or merge a write.
                state = .needsReview
            }
        }
    }
}
