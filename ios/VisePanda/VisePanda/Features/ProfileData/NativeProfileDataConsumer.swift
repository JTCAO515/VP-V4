import SwiftUI

struct NativeProfileDataConsumer: View {
    let module: NativeDataCoverageModule?
    let coverage: NativeDataCoverageStore?
    let client: NativeProfileDataClient
    let makeStore: (NativeProfileDataScope) -> NativeProfileDataStore
    let chinese: Bool
    @Environment(\.scenePhase) private var phase
    @Environment(\.dismiss) private var dismiss
    @State private var scope = NativeProfileDataScope.sensitive
    @State private var store: NativeProfileDataStore?
    private var actor: NativeCommunitySafetyActor? { phase == .active ? client.current() : nil }
    private func t(_ zh: String, _ en: String) -> String { chinese ? zh : en }

    var body: some View {
        Form {
            Section {
                Picker(t("明确选择资料范围", "Explicitly select the data scope"), selection: $scope) {
                    ForEach(NativeProfileDataScope.allCases, id: \.self) { value in
                        Text(NativeProfileDataCopy.scope(value == .sensitive, chinese: chinese)).tag(value)
                    }
                }
                Text(t("明确选择本人 Profile 资料或本出口的临时进度。核对完整保存字段与节奏历史，显式确认后清理；账号、会话与原领域资料保留。", "Explicitly select your Profile or this exit’s transient progress. Review every saved field and pace history before confirming cleanup; account, sessions and original domain data remain."))
            }
            if let store, store.scope == scope {
                NativeProfileDataBoundConsumer(module: module, coverage: coverage, client: client,
                    store: store, chinese: chinese).id(scope)
            } else { ProgressView() }
        }
        .task(id: scope) {
            if store?.scope != scope { store?.suspend(); store = makeStore(scope) }
        }
        .onDisappear { store?.suspend(); store = nil }
        .navigationTitle(t("本人 Profile 资料清理", "My Profile data cleanup"))
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button(t("完成", "Done")) { dismiss() } } }
    }
}

private struct NativeProfileDataBoundConsumer: View {
    let module: NativeDataCoverageModule?
    let coverage: NativeDataCoverageStore?
    let client: NativeProfileDataClient
    let store: NativeProfileDataStore
    let chinese: Bool
    @Environment(\.scenePhase) private var phase
    private var actor: NativeCommunitySafetyActor? { phase == .active ? client.current() : nil }

    var body: some View {
        NativeProfileDataView(store: store, client: client, chinese: chinese, completed: completed)
    }
    private func completed(_ value: NativeProfileDataCompletion, captured: NativeCommunitySafetyActor) {
        guard actor == captured, store.completion?.id == value.id,
              store.visibleReceipt(captured)?.requestDigest == value.receipt.requestDigest,
              value.receipt.binding.actor == captured else { return }
        guard let module, let coverage, NativeProfileDataWire.catalog(module), coverage.visibleModules(captured).contains(module) else { return }
        let binding = value.receipt.binding
        let selection = NativeProfileDataCopy.scope(binding.scope == .sensitive, chinese: chinese) + " · " +
            (binding.profileID ?? binding.objectIDs.joined(separator: ", ")) + " · " +
            (chinese ? "保留已声明的领域资料与永久围栏" : "Declared domain data and permanent fences retained")
        coverage.recordLegacy(module: module, action: .delete, operationID: binding.requestID,
            selection: selection, state: .scopedComplete, current: captured)
    }
}

extension NativeProfileDataWire {
    static func catalog(_ module: NativeDataCoverageModule) -> Bool {
        let sensitive = boundaries[.sensitive] ?? [:], progress = boundaries[.progress] ?? [:]
        func unique(_ values: [String]) -> [String] {
            var seen = Set<String>(); return values.filter { seen.insert($0).inserted }
        }
        return module.id == "profile" && module.location == .server && module.version == schema && module.scope == schema &&
            module.exportHandler == "core" && module.deleteHandler == "profile_data" && module.selection == "owner" &&
            module.capacity == "one explicitly selected owner Profile, all saved fields and pace history; fixed30s source CAS; declared mixed copies retained under original controls; own1..20 preview metadata exit" &&
            module.retention == unique((sensitive["retained"] ?? []) + (progress["retained"] ?? [])) &&
            module.missing == unique((sensitive["missing"] ?? []) + (progress["missing"] ?? []))
    }
}
