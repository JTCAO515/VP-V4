import SwiftUI

/// Only a verified terminal receipt or exact protected file can complete this
/// selected module row. Merely opening/dismissing this consumer has no effect.
struct NativeNotificationDataConsumer: View {
    let module: NativeDataCoverageModule
    let coverage: NativeDataCoverageStore
    let session: NativeSession
    let scope: NativeNotificationDataScope
    let chinese: Bool
    @Environment(\.scenePhase) private var phase
    @State private var store: NativeNotificationDataStore?
    private var actor: NativeCommunitySafetyActor? { phase == .active ? try? session.communitySafetyActor() : nil }
    private var client: NativeNotificationDataClient {
        .init(current: { self.actor }, request: { try await session.notificationDataRequest(body: $0, actor: $1) })
    }

    var body: some View {
        Group {
            if let store { NativeNotificationDataView(store: store, client: client, chinese: chinese, completed: completed) }
            else { ProgressView() }
        }.task { if store == nil { store = session.notificationDataStore(scope: scope) } }
    }

    private func completed(_ value: NativeNotificationDataCompletion, captured: NativeCommunitySafetyActor) {
        guard actor == captured else { return }
        Task {
            let coverageClient = NativeDataCoverageClient(session: session, active: { phase == .active })
            if coverage.visibleModules(captured).isEmpty { await coverage.load(coverageClient) }
            guard actor == captured, let store, store.completion?.id == value.id,
                  coverage.visibleModules(captured).contains(module), module.version == NativeNotificationDataWire.schema,
                  module.scope == value.scope.rawValue, module.exportHandler != nil, module.deleteHandler != nil else { return }
            if value.action == "export", store.exportURL(captured) == nil { return }
            if value.action == "delete", store.visibleReceipt(captured)?.binding.requestID != value.requestID { return }
            coverage.recordLegacy(module: module, action: value.action == "export" ? .export : .delete,
                operationID: value.requestID, selection: value.objectIDs.joined(separator: ", "),
                state: .scopedComplete, current: captured)
        }
    }
}
