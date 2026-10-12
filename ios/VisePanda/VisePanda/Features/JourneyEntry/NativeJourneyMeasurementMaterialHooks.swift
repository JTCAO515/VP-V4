import Foundation

/// Domain hooks only; no transport or collection without the qualified #203
/// entry adapter. Direct Trip/anonymous import paths must leave these nil.
@MainActor struct NativeJourneyMeasurementMaterialHooks {
    let explicitSelection: () -> Void
    let qualifies: (NativeCommunitySafetyActor, UUID, Int) -> Bool
    let accepted: (NativeCommunitySafetyActor, UUID, Int, NativeJourneyMeasurementAdmission.Material, TimeInterval) -> Void
    func guardedStart(session: NativeSession, tripID: String, tripVersion: Int,
                      material: NativeJourneyMeasurementAdmission.Material) {
        guard !Task.isCancelled, let id = UUID(uuidString: tripID), let actor = try? session.communitySafetyActor(),
              qualifies(actor, id, tripVersion) else { return }
        accepted(actor, id, tripVersion, material, ProcessInfo.processInfo.systemUptime)
    }
}
