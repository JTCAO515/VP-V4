import SwiftUI

struct NativeResultDataConsumer: View {
    let module: NativeDataCoverageModule
    let coverage: NativeDataCoverageStore
    let client: NativeResultDataClient
    let makeStore: (NativeResultDataScope) -> NativeResultDataStore
    let chinese: Bool
    @Environment(\.scenePhase) private var phase
    @Environment(\.dismiss) private var dismiss
    @State private var scope = NativeResultDataScope.sensitive
    @State private var store: NativeResultDataStore?
    private var actor: NativeCommunitySafetyActor? { phase == .active ? client.current() : nil }
    private func t(_ zh: String, _ en: String) -> String { chinese ? zh : en }

    var body: some View {
        Form {
            Section {
                Picker(t("明确选择资料范围", "Explicitly select the data scope"), selection: $scope) {
                    ForEach(NativeResultDataScope.allCases, id: \.self) { value in
                        Text(NativeResultDataCopy.scope(value == .sensitive, chinese: chinese)).tag(value)
                    }
                }
                Text(t("只记录所选成果及其全部版本经核验的回执。原会话与领域资料保留；临时预览进度有独立出口，永久身份围栏与最小决策保留。", "Records verified receipts for the selected result and all its revisions. Original conversations and domain data remain. Transient preview progress has its own exit; permanent identity fences and minimal decisions remain."))
            }
            if let store, store.scope == scope {
                NativeResultDataBoundConsumer(module: module, coverage: coverage, client: client,
                    store: store, chinese: chinese).id(scope)
            } else { ProgressView() }
        }
        .task(id: scope) {
            if store?.scope != scope { store?.suspend(); store = makeStore(scope) }
        }
        .onDisappear { store?.suspend(); store = nil }
        .navigationTitle(t("本人所选成果资料清理", "My selected result data cleanup"))
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button(t("完成", "Done")) { dismiss() } } }
    }
}

private struct NativeResultDataBoundConsumer: View {
    let module: NativeDataCoverageModule
    let coverage: NativeDataCoverageStore
    let client: NativeResultDataClient
    let store: NativeResultDataStore
    let chinese: Bool
    @Environment(\.scenePhase) private var phase
    private var actor: NativeCommunitySafetyActor? { phase == .active ? client.current() : nil }

    var body: some View {
        NativeResultDataView(store: store, client: client, chinese: chinese, completed: completed)
    }
    private func completed(_ value: NativeResultDataCompletion, captured: NativeCommunitySafetyActor) {
        guard actor == captured, store.completion?.id == value.id,
              store.visibleReceipt(captured)?.requestDigest == value.receipt.requestDigest,
              value.receipt.binding.actor == captured else { return }
        guard NativeResultDataWire.catalog(module), coverage.visibleModules(captured).contains(module) else { return }
        let binding = value.receipt.binding
        let selection = NativeResultDataCopy.scope(binding.scope == .sensitive, chinese: chinese) + " · " +
            (binding.rootID ?? binding.objectIDs.joined(separator: ", ")) + " · " +
            (chinese ? "保留已声明的领域资料与永久围栏" : "Declared domain data and permanent fences retained")
        coverage.recordLegacy(module: module, action: .delete, operationID: binding.requestID,
            selection: selection, state: .scopedComplete, current: captured)
    }
}

extension NativeResultDataWire {
    static func catalog(_ module: NativeDataCoverageModule) -> Bool {
        let sensitive = boundaries[.sensitive] ?? [:], progress = boundaries[.progress] ?? [:]
        func unique(_ values: [String]) -> [String] {
            var seen = Set<String>(); return values.filter { seen.insert($0).inserted }
        }
        return module.id == "results" && module.location == .server && module.version == schema && module.scope == schema &&
            module.exportHandler == "core" && module.deleteHandler == "result_data" && module.selection == "owner" &&
            module.capacity == "one explicitly selected owner artifact and all revisions/events; bounded4100 graph/1MB; fixed30s source CAS; active/shared/cross-result/domain copies rejected; own1..20 preview metadata exit" &&
            module.retention == unique((sensitive["retained"] ?? []) + (progress["retained"] ?? [])) &&
            module.missing == unique((sensitive["missing"] ?? []) + (progress["missing"] ?? []))
    }
}
