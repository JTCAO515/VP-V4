import SwiftUI

/// Only a verified terminal receipt or exact protected file can complete this
/// selected module row. Merely opening/dismissing this consumer has no effect.
struct NativeNotificationDataConsumer: View {
    let module: NativeDataCoverageModule
    let coverage: NativeDataCoverageStore
    let store: NativeNotificationDataStore
    let client: NativeNotificationDataClient
    let coverageClient: NativeDataCoverageClient
    let chinese: Bool
    @Environment(\.scenePhase) private var phase
    private var actor: NativeCommunitySafetyActor? { phase == .active ? client.current() : nil }
    private var guarded: NativeNotificationDataClient { .init(current: { self.actor }, request: client.request) }

    var body: some View {
        NativeNotificationDataView(store: store, client: guarded, chinese: chinese, completed: completed)
    }

    private func completed(_ value: NativeNotificationDataCompletion, captured: NativeCommunitySafetyActor) {
        guard actor == captured else { return }
        Task {
            if coverage.visibleModules(captured).isEmpty { await coverage.load(coverageClient) }
            guard actor == captured, store.completion?.id == value.id,
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
