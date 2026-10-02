import Foundation
import Observation
import OSLog

@MainActor @Observable
final class NativeTravelIntakeStore {
    enum State: Equatable { case idle, loading, current, submitting, needsReview, unavailable, readOnly }
    private(set) var state = State.idle
    private(set) var readOnlyReason: NativeTravelIntakeCorrectionLimit?
    var canSubmit: Bool {
        state == .current && selection?.canCorrect == true
            && ((basis != nil && basis?.correctionLimit == nil) || (writeBasis != nil && writeBasis?.correctionLimit == nil))
    }
    private(set) var selection: NativeTravelIntakeSelection?
    private(set) var unavailableReason: String?
    private(set) var writeBasis: NativeTravelIntakeWriteBasis?
    private(set) var basis: NativeTravelIntakeBasis?
    var draft = NativeTravelIntake()
    private var generation = UUID()
    private var needsExplicitReview = false
    private var metadataLoading = false
    private var operation: Task<Void, Never>?
    private var readOperation: Task<Data, Error>?
    private var traceGeneration = 0
    private var localTrace = false
    private(set) var pending: NativeTravelIntakeSubmission?
    func bind(_ target: NativeTravelIntakeSelection?) {
        guard selection != target else { return }
        #if DEBUG
        if let target { localTrace = ProcessInfo.processInfo.arguments.contains("-VisePandaIntakeAuthTrace") && target.scope.endpoint == "http://127.0.0.1:63252" }
        #endif
        let retained = draft
        let sameGoal = selection != nil && target != nil && selection?.scope == target?.scope
            && selection?.conversationID == target?.conversationID && selection?.goalID == target?.goalID
            && selection?.policyID == target?.policyID
        let preserve = sameGoal && (needsExplicitReview || state == .needsReview || state == .submitting)
        invalidate(); selection = target
        if preserve { draft = retained; needsExplicitReview = true; state = .needsReview }
    }
    func invalidate() {
        operation?.cancel(); operation = nil; readOperation?.cancel(); readOperation = nil
        generation = UUID(); traceGeneration += 1; selection = nil
        basis = nil; writeBasis = nil; unavailableReason = nil; pending = nil; draft = NativeTravelIntake(); state = .idle
        needsExplicitReview = false; metadataLoading = false; readOnlyReason = nil
        trace("invalidate", scopeCurrent: false)
    }
    func load(request: @escaping (String, String) async throws -> Data, current: @escaping () -> NativeTravelIntakeSelection?) async {
        guard let target = selection, target.valid, target == current(), !Task.isCancelled else { return }
        guard !metadataLoading else { return }
        readOperation?.cancel()
        let own = UUID(); generation = own; traceGeneration += 1
        let requestGeneration = traceGeneration
        state = needsExplicitReview ? .needsReview : .loading
        basis = nil; writeBasis = nil; pending = nil; readOnlyReason = nil
        trace("intake_read_start", scopeCurrent: current() == target, requestGeneration: requestGeneration)
        let reader = Task { try await request(target.conversationID, target.goalID) }; readOperation = reader
        do {
            let bytes = try await withTaskCancellationHandler(operation: { try await reader.value }, onCancel: { reader.cancel() })
            let reply = try NativeTravelIntakeRead.decode(bytes)
            guard generation == own, selection == target, current() == target, !Task.isCancelled else { return }
            guard case .current(let value) = reply else {
                if case .unavailable(let reason) = reply { unavailableReason = reason }
                state = needsExplicitReview ? .needsReview : .unavailable; return
            }
            unavailableReason = nil
            guard value.conversationId == target.conversationID, value.goalId == target.goalID,
                  value.goalVersion == target.goalVersion, value.messageId == target.parentMessageID else { throw NativeDataError.invalidResponse }
            if let limit = value.correctionLimit {
                basis = value; draft = value.intake; readOnlyReason = limit; state = .readOnly; return
            }
            if needsExplicitReview { basis = nil; state = .needsReview; return }
            basis = value; draft = value.intake; state = .current
        } catch {
            let category: String
            if case NativeDataError.sessionUnavailable = error { category = "session_unavailable" }
            else if case NativeDataError.server(let code) = error, code == "DATA_POLICY_BLOCKED" { category = "policy_blocked" }
            else if reader.isCancelled { category = "cancelled" } else { category = "unavailable" }
            trace("intake_read_failed_" + category, scopeCurrent: current() == target, requestGeneration: requestGeneration)
            guard generation == own, selection == target, current() == target else { return }
            if case NativeDataError.server(let code) = error,
               ["DATA_POLICY_BLOCKED", "UNAUTHENTICATED"].contains(code) { invalidate() }
            state = needsExplicitReview ? .needsReview : .unavailable
        }
    }
    func reviewForCorrection(request: @escaping (String, String) async throws -> Data,
                             current: () -> NativeTravelIntakeSelection?) async {
        guard let target = selection, target.valid, target == current(), !Task.isCancelled else { return }
        guard state != .readOnly else { return }
        guard target.canCorrect else { writeBasis = nil; readOnlyReason = .goalVersion; state = .readOnly; return }
        readOperation?.cancel()
        let own = UUID(); generation = own; traceGeneration += 1; basis = nil; writeBasis = nil; metadataLoading = true
        let reader = Task { try await request(target.conversationID, target.goalID) }; readOperation = reader
        do {
            let bytes = try await withTaskCancellationHandler(operation: { try await reader.value }, onCancel: { reader.cancel() })
            let metadata = try NativeTravelIntakeWriteBasis.decode(bytes)
            guard generation == own, selection == target, target == current(), !Task.isCancelled else { return }
            guard metadata.matches(target) else { throw NativeDataError.invalidResponse }
            metadataLoading = false
            if let limit = metadata.correctionLimit { writeBasis = nil; readOnlyReason = limit; state = .readOnly; return }
            writeBasis = metadata; readOnlyReason = nil; needsExplicitReview = false; state = .current
        } catch {
            guard generation == own, selection == target, target == current() else { return }
            if case NativeDataError.server(let code) = error, ["DATA_POLICY_BLOCKED", "UNAUTHENTICATED"].contains(code) { invalidate(); state = .unavailable }
            else { metadataLoading = false; needsExplicitReview = true; state = .needsReview }
        }
    }
    func submit(locale: String, current: @escaping () -> NativeTravelIntakeSelection?,
                post: @escaping (Data) async throws -> Data,
                read: @escaping (String, String) async throws -> Data,
                accepted: @escaping () async -> Void) {
        guard canSubmit, let target = selection, target == current(), draft.valid,
              basis != nil || writeBasis?.matches(target) == true else { return }
        let request = NativeTravelIntakeSubmission(conversationId: target.conversationID, goalId: target.goalID,
            messageId: UUID().uuidString.lowercased(), idempotencyKey: UUID().uuidString.lowercased(),
            policyId: target.policyID, locale: locale,
            text: locale == "zh" ? "我明确确认已填写的当前旅行需求。" : "I explicitly confirm the current travel requirements I entered.",
            relationship: (basis?.intakeRevision ?? writeBasis?.intakeRevision ?? 0) == 0 ? "follow_up" : "amendment", parentMessageId: target.parentMessageID, expectedGoalVersion: target.goalVersion,
            expectedIntakeRevision: basis?.intakeRevision ?? writeBasis!.intakeRevision, intake: draft, memoryBasis: basis?.memoryBasis ?? [])
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
                self.basis = fresh; writeBasis = nil; draft = fresh.intake; pending = nil
                needsExplicitReview = false; readOnlyReason = fresh.correctionLimit
                state = readOnlyReason == nil ? .current : .readOnly
                await accepted()
            } catch {
                guard generation == own, selection == target, current() == target else { return }
                if case NativeDataError.server(let code) = error,
                   ["DATA_POLICY_BLOCKED", "UNAUTHENTICATED"].contains(code) { invalidate(); state = .unavailable; return }
                self.basis = nil; writeBasis = nil; pending = nil
                // Keep the full draft for explicit re-review, never retry or merge a write.
                needsExplicitReview = true; state = .needsReview
            }
        }
    }
    private func trace(_ phase: String, scopeCurrent: Bool, requestGeneration: Int = 0) {
        #if DEBUG
        guard localTrace else { return }
        let selected = selection != nil, basisVisible = basis != nil, writeQualified = writeBasis != nil
        let emptyDraft = draft == NativeTravelIntake(), generation = traceGeneration
        Logger(subsystem: "space.go2china.intake-auth", category: "local-test").info("phase=\(phase, privacy: .public) generation=\(generation) requestGeneration=\(requestGeneration) scopeCurrent=\(scopeCurrent) selected=\(selected) basis=\(basisVisible) writeBasis=\(writeQualified) draftCleared=\(emptyDraft)")
        #endif
    }
}
