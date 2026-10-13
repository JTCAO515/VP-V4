import Foundation

/// Original-flow adapters only. Shared store/view hooks are separately leased
/// candidates; this file does not install those hooks or a measurement collector.
@MainActor enum NativeJourneyMaterialOutcomeBridge {
    static func context(store: NativeTripStore, session: NativeSession, active: Bool) -> NativeJourneyMaterialOutcome.Context? {
        guard let actor = session.dataScope, store.scope == actor, let detail = store.detail,
              store.selectedID == detail.trip.id else { return nil }
        return .init(actor: actor, tripID: detail.trip.id, tripVersion: detail.trip.headVersion,
                     active: active, readable: true, editable: store.canEdit)
    }
    /// Runs after the ORIGINAL writer and its authenticated readback succeeded.
    /// Failure only denies the handoff; it never retries or fails the business writer.
    static func confirmed(outcome: NativeJourneyMaterialOutcomeStore, store: NativeTripStore,
                          session: NativeSession, active: () -> Bool, receipt: NativeTripConfirmed? = nil) async -> NativeJourneyMaterialOutcome.Handoff {
        guard !Task.isCancelled, outcome.phase == .confirmationUnknown,
              let selected = outcome.selection, selected.medium == .pdf,
              let journal = outcome.retryJournal(selection: selected, context: selected.context),
              let actor = session.dataScope, actor == selected.context.actor,
              let before = context(store: store, session: session, active: active()),
              before.eligible, before.tripID == journal.tripID, before.tripVersion == selected.context.tripVersion + 1 else {
            outcome.invalidate(context: context(store: store, session: session, active: active()))
            return .continuation(.stale)
        }
        do {
            let bytes = try await session.pdfIntakeRequest(tripID: journal.tripID, action: "operation",
                operationID: journal.command.operationId, actor: actor)
            let operation = try JSONDecoder().decode(NativePDFOperation.self, from: bytes)
            if Task.isCancelled {
                if outcome.selection == selected { outcome.exit(.cancelled) }
                return .continuation(.stale)
            }
            guard outcome.selection == selected, let after = context(store: store, session: session, active: active()), after == before,
                  let detail = store.detail else {
                outcome.invalidate(context: context(store: store, session: session, active: active()))
                return .continuation(.stale)
            }
            return outcome.completePDF(operation: operation, receipt: receipt, readback: detail,
                selectedID: store.selectedID, selection: selected, context: after)
        } catch {
            if outcome.selection == selected {
                if Task.isCancelled { outcome.exit(.cancelled) }
                else { outcome.invalidate(context: context(store: store, session: session, active: active())) }
            }
            return .continuation(.originalProofUnavailable)
        }
    }
}
