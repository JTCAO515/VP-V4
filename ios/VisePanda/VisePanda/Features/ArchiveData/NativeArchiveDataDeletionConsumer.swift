import SwiftUI

/// Inject the original deletion engine. Only its verified request-bound receipt
/// can update coverage; selecting a Trip or navigating never records completion.
struct NativeArchiveDataDeletionConsumer: View {
    let module: NativeDataCoverageModule
    let coverage: NativeDataCoverageStore
    let session: NativeSession
    let actor: NativeCommunitySafetyActor
    let selection: NativeLinkedTripDeleteSelection
    let deletion: NativeLinkedTripDeletionStore
    let chinese: Bool
    @Environment(\.scenePhase) private var phase

    private var current: NativeCommunitySafetyActor? {
        phase == .active ? try? session.communitySafetyActor() : nil
    }

    var body: some View {
        Group {
            if current == actor, selection.scope == actor.scope {
                NativeLinkedTripDeletionView(tripID: selection.tripID, headVersion: selection.headVersion, store: deletion)
            } else {
                Text(chinese ? "会话已变化，请刷新归档行程选择。" : "Session changed. Refresh the archived Trip selection.")
            }
        }
        .onChange(of: deletion.receipt.map { $0.requestId + "/" + $0.state }) { _, _ in
            guard current == actor, let receipt = deletion.receipt,
                  deletion.selection == selection, receipt.tripId == selection.tripID,
                  ["queued", "completed"].contains(receipt.state) else { return }
            Task {
                let client = NativeDataCoverageClient(session: session, active: { phase == .active })
                if coverage.visibleModules(actor).isEmpty { await coverage.load(client) }
                guard current == actor, deletion.selection == selection,
                      let latest = deletion.receipt, latest.requestId == receipt.requestId,
                      latest.planId == receipt.planId, latest.scopeDigest == receipt.scopeDigest,
                      latest.state == receipt.state, latest.selection == receipt.selection,
                      coverage.visibleModules(actor).contains(module) else { return }
                if receipt.state == "completed" {
                    do { guard try session.pendingLinkedTripDeletion(target: selection) == nil else { return } }
                    catch { return }
                }
                coverage.recordLegacy(module: module, action: .delete, operationID: receipt.requestId,
                    selection: selection.tripID + " · v\(selection.headVersion) · " + receipt.scope,
                    state: receipt.state == "completed" ? .scopedComplete : .queued, current: actor)
            }
        }
        .onChange(of: current) { _, next in if next != actor { deletion.clear() } }
        .onDisappear { deletion.clear() }
    }
}
