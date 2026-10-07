import SwiftUI

struct NativeTurnDataConsumer: View {
    let module: NativeDataCoverageModule
    let coverage: NativeDataCoverageStore
    let client: NativeTurnDataClient
    let makeStore: (NativeTurnDataScope) -> NativeTurnDataStore
    let chinese: Bool
    @Environment(\.scenePhase) private var phase
    @Environment(\.dismiss) private var dismiss
    @State private var scope = NativeTurnDataScope.sensitive
    @State private var store: NativeTurnDataStore?
    private var actor: NativeCommunitySafetyActor? { phase == .active ? client.current() : nil }
    private func t(_ zh: String, _ en: String) -> String { chinese ? zh : en }

    var body: some View {
        Form {
            Section {
                Picker(t("明确选择资料范围", "Explicitly select the data scope"), selection: $scope) {
                    ForEach(NativeTurnDataScope.allCases, id: \.self) { value in
                        Text(NativeTurnDataCopy.scope(value == .sensitive, chinese: chinese)).tag(value)
                    }
                }
                Text(t("只记录本人所选已完成轮次的真实清理回执。原会话、任务身份和其他轮次保留；临时预览进度有独立出口。", "Records verified cleanup receipts for my selected completed Turn. Parent conversation and Task identities and other Turns remain. Transient preview progress has its own exit."))
            }
            if let store, store.scope == scope {
                NativeTurnDataBoundConsumer(module: module, coverage: coverage, client: client,
                    store: store, chinese: chinese).id(scope)
            } else { ProgressView() }
        }
        .task(id: scope) {
            if store?.scope != scope { store?.suspend(); store = makeStore(scope) }
        }
        .onDisappear { store?.suspend(); store = nil }
        .navigationTitle(t("本人所选轮次资料清理", "My selected Turn data cleanup"))
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button(t("完成", "Done")) { dismiss() } } }
    }
}

private struct NativeTurnDataBoundConsumer: View {
    let module: NativeDataCoverageModule
    let coverage: NativeDataCoverageStore
    let client: NativeTurnDataClient
    let store: NativeTurnDataStore
    let chinese: Bool
    @Environment(\.scenePhase) private var phase
    private var actor: NativeCommunitySafetyActor? { phase == .active ? client.current() : nil }

    var body: some View {
        NativeTurnDataView(store: store, client: client, chinese: chinese, completed: completed)
    }
    private func completed(_ value: NativeTurnDataCompletion, captured: NativeCommunitySafetyActor) {
        guard actor == captured, store.completion?.id == value.id,
              store.visibleReceipt(captured)?.requestDigest == value.receipt.requestDigest,
              value.receipt.binding.actor == captured else { return }
        guard NativeTurnDataWire.catalog(module), coverage.visibleModules(captured).contains(module) else { return }
        let binding = value.receipt.binding
        let selection = NativeTurnDataCopy.scope(binding.scope == .sensitive, chinese: chinese) + " · " +
            (binding.turnID ?? binding.objectIDs.joined(separator: ", ")) + " · " +
            (chinese ? "保留已声明的领域资料与永久围栏" : "Declared domain data and permanent fences retained")
        coverage.recordLegacy(module: module, action: .delete, operationID: binding.requestID,
            selection: selection, state: .scopedComplete, current: captured)
    }
}

extension NativeTurnDataWire {
    static func catalog(_ module: NativeDataCoverageModule) -> Bool {
        let sensitive = boundaries[.sensitive] ?? [:], progress = boundaries[.progress] ?? [:]
        func unique(_ values: [String]) -> [String] {
            var seen = Set<String>(); return values.filter { seen.insert($0).inserted }
        }
        return module.id == "turn" && module.location == .server && module.version == schema && module.scope == schema &&
            module.exportHandler == "core" && module.deleteHandler == "turn_data" && module.selection == "owner" &&
            module.capacity == "one explicitly selected completed owner Turn; bounded4100 graph/1MB; fixed30s source CAS; active/shared/independent domains rejected; own1..20 preview metadata exit" &&
            module.retention == unique((sensitive["retained"] ?? []) + (progress["retained"] ?? [])) &&
            module.missing == unique((sensitive["missing"] ?? []) + (progress["missing"] ?? []))
    }
}
