import Foundation
import Observation

@MainActor @Observable
final class NativeQualifiedDelegationStore {
    enum State: Equatable { case unavailable, localPrepared, localReading, localReceipt, needsReview }
    private(set) var context: NativeQualifiedDelegationContext?
    private(set) var state = State.unavailable
    private(set) var request: NativeQualifiedDelegationRPC?
    private(set) var receipt: NativeQualifiedDelegationRPCReceipt?
    private(set) var pendingIdentity: NativeQualifiedDelegationPendingIdentity?
    var draft = ""
    // No worker/claimer/completion channel. This is never lifted by a receipt or fixture.
    var canStartRealWork: Bool { false }
    private var generation = UUID()
    private var readOperation: Task<Data, Error>?
    func bind(_ current: NativeQualifiedDelegationContext?) {
        guard context != current else { return }
        let retained = pendingIdentity
        invalidate(); context = current
        if let current, retained?.scope == current.selection.scope,
           retained?.conversationID == current.selection.conversationID, retained?.goalID == current.selection.goalID {
            pendingIdentity = retained
        }
    }
    func invalidate() {
        readOperation?.cancel(); readOperation = nil; generation = UUID()
        context = nil; request = nil; receipt = nil; pendingIdentity = nil; draft = ""; state = .unavailable
    }
    @discardableResult func prepareLocalFixture(locale: String) throws -> NativeQualifiedDelegationRPC {
        guard let context, context.qualified else { throw NativeDataError.invalidResponse }
        if let request {
            guard request.text == draft, request.locale == locale else { throw NativeDataError.invalidResponse }
            return request // same immutable IDs/body for a deliberate identical local retry
        }
        guard pendingIdentity == nil else { throw NativeDataError.staleSessionResponse }
        let value = try NativeQualifiedDelegationRPC(context: context, locale: locale, text: draft)
        request = value; pendingIdentity = .init(scope: context.selection.scope, request: value)
        receipt = nil; state = .localPrepared; return value
    }
    /// Real entry is closed even with perfect current input. It never invokes the supplied transport.
    func attemptRealSubmission(_ transport: (Data) async throws -> Data) async { state = .unavailable }
    func inspectLocalRPCReceipt(current: @escaping () -> NativeQualifiedDelegationContext?,
                                response: @escaping (NativeQualifiedDelegationRPC) async throws -> Data) async {
        await inspectLocalReceipt(current: current, response: response, decode: NativeQualifiedDelegationRPCReceipt.decode)
    }
    func inspectLocalHTTPReceipt(current: @escaping () -> NativeQualifiedDelegationContext?,
                                 response: @escaping (NativeQualifiedDelegationHTTPRequest) async throws -> Data) async {
        await inspectLocalReceipt(current: current, response: { try await response(.init(rpc: $0)) }, decode: NativeQualifiedDelegationHTTPReceipt.decode)
    }
    private func inspectLocalReceipt(current: @escaping () -> NativeQualifiedDelegationContext?,
                                     response: @escaping (NativeQualifiedDelegationRPC) async throws -> Data,
                                     decode: (Data) throws -> NativeQualifiedDelegationRPCReceipt) async {
        guard let selected = context, selected.qualified, selected == current(), let request else { return }
        readOperation?.cancel(); let own = UUID(); generation = own; state = .localReading
        let previous = receipt
        let reader = Task { try await response(request) }; readOperation = reader
        do {
            let bytes = try await withTaskCancellationHandler(operation: { try await reader.value }, onCancel: { reader.cancel() })
            guard generation == own, context == selected, current() == selected, !Task.isCancelled else { return }
            let value = try decode(bytes)
            guard value.matches(request), previous == nil || value.sameIdentity(as: previous!) else { throw NativeDataError.invalidResponse }
            receipt = value; state = value.current ? .localReceipt : .needsReview
        } catch {
            guard generation == own, context == selected, current() == selected else { return }
            if case NativeDataError.server(let code) = error, ["DATA_POLICY_BLOCKED", "UNAUTHENTICATED"].contains(code) {
                let recoveryIdentity = pendingIdentity
                invalidate(); pendingIdentity = recoveryIdentity
            }
            else { receipt = nil; state = .needsReview }
        }
    }
}
