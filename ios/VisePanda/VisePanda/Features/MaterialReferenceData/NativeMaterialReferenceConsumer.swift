import SwiftUI

/// A completion is recorded only after validated receipt + journal cleanup, or
/// actual protected file readback. Navigation and dismissal never complete data.
struct NativeMaterialReferenceConsumer: View {
    let coverage: NativeDataCoverageStore
    let session: NativeSession
    let scope: NativeMaterialReferenceScope
    let chinese: Bool
    @Environment(\.scenePhase) private var phase
    @State private var store: NativeMaterialReferenceStore?
    @State private var trips = NativeMaterialReferenceTrips()
    private var actor: NativeCommunitySafetyActor? { phase == .active ? try? session.communitySafetyActor() : nil }
    private var client: NativeMaterialReferenceClient {
        .init(current: { self.actor }, request: { try await session.materialReferenceRequest(body: $0, actor: $1) })
    }

    var body: some View {
        Group {
            if let store {
                NativeMaterialReferenceView(store: store, trips: trips, client: client, chinese: chinese, completed: completed)
            } else { ProgressView() }
        }.task { if store == nil { store = session.materialReferenceStore(scope: scope) } }
    }

    private func completed(_ value: NativeMaterialReferenceCompletion, captured: NativeCommunitySafetyActor) {
        guard actor == captured else { return }
        Task {
            let client = NativeDataCoverageClient(session: session, active: { phase == .active })
            if coverage.visibleModules(captured).isEmpty { await coverage.load(client) }
            guard actor == captured, let store, store.completion?.id == value.id else { return }
            if value.action == "export", store.exportURL(captured) == nil { return }
            if value.action == "delete", store.visibleReceipt(captured)?.binding.requestID != value.requestID { return }
            let moduleID: String
            switch value.scope { case .reservations: moduleID = "order_references"; case .pdf: moduleID = "pdf_intake"; case .progress: moduleID = "material_exit_progress" }
            guard let module = coverage.visibleModules(captured).first(where: { $0.id == moduleID }),
                  module.version == NativeMaterialReferenceWire.schema, module.scope == value.scope.rawValue,
                  module.exportHandler == "materials", module.deleteHandler == "materials" else { return }
            coverage.recordLegacy(module: module, action: value.action == "export" ? .export : .delete,
                operationID: value.requestID, selection: value.tripID + " / " + value.objectIDs.joined(separator: ", "),
                state: .scopedComplete, current: captured)
        }
    }
}
