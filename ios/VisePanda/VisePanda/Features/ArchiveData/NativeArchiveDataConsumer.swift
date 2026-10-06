import SwiftUI

struct NativeArchiveDataConsumer: View {
    let module: NativeDataCoverageModule
    let coverage: NativeDataCoverageStore
    let session: NativeSession
    let chinese: Bool
    @Environment(\.scenePhase) private var phase
    @Environment(\.dismiss) private var dismiss
    @State private var scope = NativeArchiveDataScope.trip
    @State private var deletion: ArchiveDataDeletionTarget?
    @State private var deletionStore = NativeLinkedTripDeletionStore()
    private var actor: NativeCommunitySafetyActor? { phase == .active ? try? session.communitySafetyActor() : nil }
    private func t(_ zh: String, _ en: String) -> String { chinese ? zh : en }
    var body: some View {
        Form {
            Section {
                Picker(t("明确选择资料范围", "Explicitly select the data scope"), selection: $scope) {
                    Text(t("归档行程资料", "Archived Trip data")).tag(NativeArchiveDataScope.trip)
                    Text(t("本出口请求与进度", "This exit's requests and progress")).tag(NativeArchiveDataScope.progress)
                }
                Text(t("仅记录所选范围的实际文件或核验回执；不代表全部归档资料、全账户或外部副本完成。", "Records only actual files or verified receipts for the selected scope. It does not complete all archived data, the account or external copies."))
            }
            NativeArchiveDataBoundConsumer(module: module, coverage: coverage, session: session, scope: scope,
                chinese: chinese, delete: { selection, captured in
                    guard actor == captured, selection.scope == captured.scope else { return }
                    deletionStore.clear(); deletion = .init(actor: captured, selection: selection)
                }).id(scope)
        }.navigationTitle(t("归档行程资料", "Archived Trip data"))
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(t("完成", "Done")) { dismiss() } } }
            .sheet(item: $deletion) { target in
                NavigationStack {
                    NativeArchiveDataDeletionConsumer(module: module, coverage: coverage, session: session,
                        actor: target.actor, selection: target.selection, deletion: deletionStore, chinese: chinese)
                }
            }
            .onChange(of: actor) { _, _ in deletion = nil; deletionStore.clear() }
            .onDisappear { deletion = nil; deletionStore.clear() }
    }
}
private struct ArchiveDataDeletionTarget: Identifiable {
    let id = UUID()
    let actor: NativeCommunitySafetyActor
    let selection: NativeLinkedTripDeleteSelection
}
private struct NativeArchiveDataBoundConsumer: View {
    let module: NativeDataCoverageModule
    let coverage: NativeDataCoverageStore
    let session: NativeSession
    let scope: NativeArchiveDataScope
    let chinese: Bool
    let delete: (NativeLinkedTripDeleteSelection, NativeCommunitySafetyActor) -> Void
    @Environment(\.scenePhase) private var phase
    @State private var store: NativeArchiveDataStore?
    private var actor: NativeCommunitySafetyActor? { phase == .active ? try? session.communitySafetyActor() : nil }
    private var client: NativeArchiveDataClient { .init(current: { actor }, request: { try await session.archiveDataRequest(body: $0, actor: $1) }) }
    var body: some View {
        Group {
            if let store { NativeArchiveDataView(store: store, client: client, chinese: chinese, completed: completed, delete: delete) }
            else { ProgressView() }
        }.task { if store == nil { store = session.archiveDataStore(scope: scope) } }
    }
    private func completed(_ value: NativeArchiveDataCompletion, captured: NativeCommunitySafetyActor) {
        guard actor == captured else { return }
        Task {
            if coverage.visibleModules(captured).isEmpty { await coverage.load(.init(session: session, active: { phase == .active })) }
            guard actor == captured, let store, store.completion?.id == value.id,
                  NativeArchiveDataWire.catalog(module), coverage.visibleModules(captured).contains(module) else { return }
            if value.action == "export" {
                guard await store.share(client: client) != nil, actor == captured, store.completion?.id == value.id else { return }
            } else {
                guard value.binding.scope == .progress, store.visibleReceipt(captured)?.binding == value.binding else { return }
            }
            let selection: String
            if value.binding.scope == .trip {
                selection = (value.binding.tripID ?? "") + " · v\(value.binding.tripVersion ?? 0) · " + (chinese ? "本机私有文件已核验，外部保存由用户完成" : "Private local file verified; user controls external saving")
            } else {
                selection = (chinese ? "仅本出口请求与进度：" : "Exit requests and progress only: ") + value.binding.objectIDs.joined(separator: ", ")
            }
            coverage.recordLegacy(module: module, action: value.action == "export" ? .export : .delete,
                operationID: value.binding.requestID, selection: selection, state: .scopedComplete, current: captured)
        }
    }
}
