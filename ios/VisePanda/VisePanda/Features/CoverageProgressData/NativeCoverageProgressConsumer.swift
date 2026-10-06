import SwiftUI

struct NativeCoverageProgressConsumer: View {
    let module: NativeDataCoverageModule
    let coverage: NativeDataCoverageStore
    let session: NativeSession
    let chinese: Bool
    @Environment(\.scenePhase) private var phase
    @State private var store: NativeCoverageProgressStore?
    private var actor: NativeCommunitySafetyActor? { phase == .active ? try? session.communitySafetyActor() : nil }
    private var client: NativeCoverageProgressClient {
        .init(current: { actor }, request: { try await session.coverageProgressRequest(body: $0, actor: $1) })
    }
    var body: some View {
        Group {
            if let store { NativeCoverageProgressView(store: store, client: client, chinese: chinese, completed: completed) }
            else { ProgressView() }
        }.task { if store == nil { store = session.coverageProgressStore() } }
    }
    private func completed(_ value: NativeCoverageProgressCompletion, captured: NativeCommunitySafetyActor) {
        guard actor == captured else { return }
        Task {
            if coverage.visibleModules(captured).isEmpty {
                await coverage.load(.init(session: session, active: { phase == .active }))
            }
            guard actor == captured, let store, store.completion?.id == value.id,
                  coverage.visibleModules(captured).contains(module), NativeCoverageProgressWire.catalog(module) else { return }
            if value.action == "export", store.exportURL(captured) == nil { return }
            if value.action == "delete", store.visibleReceipt(captured)?.binding.requestID != value.requestID { return }
            coverage.recordLegacy(module: module, action: value.action == "export" ? .export : .delete,
                operationID: value.requestID, selection: value.objectIDs.joined(separator: ", "), state: .scopedComplete, current: captured)
        }
    }
}
