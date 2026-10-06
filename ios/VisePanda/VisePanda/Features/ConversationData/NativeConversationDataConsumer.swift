import SwiftUI

struct NativeConversationDataConsumer: View {
    let module: NativeDataCoverageModule
    let coverage: NativeDataCoverageStore
    let client: NativeConversationDataClient
    let makeStore: (NativeConversationDataScope) -> NativeConversationDataStore
    let chinese: Bool
    @Environment(\.scenePhase) private var phase
    @Environment(\.dismiss) private var dismiss
    @State private var scope = NativeConversationDataScope.sensitive
    private var actor: NativeCommunitySafetyActor? { phase == .active ? client.current() : nil }
    private func t(_ zh: String, _ en: String) -> String { chinese ? zh : en }

    var body: some View {
        Form {
            Section {
                Picker(t("明确选择资料范围", "Explicitly select the data scope"), selection: $scope) {
                    ForEach(NativeConversationDataScope.allCases, id: \.self) { value in
                        Text(NativeConversationDataCopy.scope(value, chinese: chinese)).tag(value)
                    }
                }
                Text(t("只记录所选对象经核验的回执，其他会话与未支持范围保留。临时预览进度有独立出口，永久围栏与最小决策保留。", "Records verified receipts only for selected objects; other conversations and unsupported scope remain. Transient preview progress has its own exit, while permanent fences and minimal decisions remain."))
            }
            NativeConversationDataBoundConsumer(module: module, coverage: coverage, client: client,
                store: makeStore(scope), chinese: chinese).id(scope)
        }
        .navigationTitle(t("本人会话资料清理", "My conversation data cleanup"))
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button(t("完成", "Done")) { dismiss() } } }
    }
}

private struct NativeConversationDataBoundConsumer: View {
    let module: NativeDataCoverageModule
    let coverage: NativeDataCoverageStore
    let client: NativeConversationDataClient
    @State var store: NativeConversationDataStore
    let chinese: Bool
    @Environment(\.scenePhase) private var phase
    private var actor: NativeCommunitySafetyActor? { phase == .active ? client.current() : nil }

    var body: some View {
        NativeConversationDataView(store: store, client: client, chinese: chinese, completed: completed)
    }
    private func completed(_ value: NativeConversationDataCompletion, captured: NativeCommunitySafetyActor) {
        guard actor == captured, store.completion?.id == value.id,
              store.visibleReceipt(captured)?.requestDigest == value.receipt.requestDigest,
              value.receipt.binding.actor == captured else { return }
        guard NativeConversationDataWire.catalog(module), coverage.visibleModules(captured).contains(module) else { return }
        let binding = value.receipt.binding
        let selection = NativeConversationDataCopy.scope(binding.scope, chinese: chinese) + " · " +
            (binding.rootID ?? binding.objectIDs.joined(separator: ", ")) + " · " +
            (chinese ? "保留已声明的领域资料与永久围栏" : "Declared domain data and permanent fences retained")
        coverage.recordLegacy(module: module, action: .delete, operationID: binding.requestID,
            selection: selection, state: .scopedComplete, current: captured)
    }
}

extension NativeConversationDataWire {
    static func catalog(_ module: NativeDataCoverageModule) -> Bool {
        let sensitive = boundaries[.sensitive] ?? [:], progress = boundaries[.progress] ?? [:]
        func unique(_ values: [String]) -> [String] {
            var seen = Set<String>(); return values.filter { seen.insert($0).inserted }
        }
        return module.id == "conversations" && module.location == .server && module.version == schema && module.scope == schema &&
            module.exportHandler == "core" && module.deleteHandler == "conversation_data" && module.selection == "owner" &&
            module.capacity == "one explicitly selected owner conversation or standalone thread; bounded4100 graph/1MB; fixed30s source CAS; active/shared/independent domains rejected; own1..20 preview metadata exit" &&
            module.retention == unique((sensitive["retained"] ?? []) + (progress["retained"] ?? [])) &&
            module.missing == unique((sensitive["missing"] ?? []) + (progress["missing"] ?? []))
    }
}
