import SwiftUI

struct NativeDataCoverageView: View {
    @State private var store: NativeDataCoverageStore?
    var body: some View {
        Group {
            if let store { NativeDataCoverageContentView(store: store) }
            else { ProgressView() }
        }.task { if store == nil { store = NativeDataCoverageStore() } }
    }
}

private struct NativeDataCoverageContentView: View {
    @Environment(AppSettings.self) private var settings
    @Environment(\.scenePhase) private var phase
    let store: NativeDataCoverageStore
    @State private var selected: NativeDataCoverageModule?
    @State private var actionTask: Task<Void, Never>?
    @State private var retryConfirmed = false
    @State private var stopConfirmed = false
    private var session: NativeSession { settings.nativeSession }
    private var chinese: Bool { settings.selectedLocale == .zh }
    private var actor: NativeCommunitySafetyActor? { phase == .active ? try? session.communitySafetyActor() : nil }
    private var client: NativeDataCoverageClient { .init(session: session, active: { phase == .active }) }
    private func t(_ zh: String, _ en: String) -> String { chinese ? zh : en }

    var body: some View {
        Form {
            Section {
                Text(t("逐一查看并选择导出或删除范围。每条回执只证明你确认的范围；缺项、排队和未知结果继续列出，不代表全部账户数据完成。", "Review and select each export/deletion scope. Each receipt proves only the scope you confirmed. Missing, queued and unknown outcomes remain listed; this does not complete all account data."))
                Button(t("读取当前账户覆盖清单", "Read this account’s current coverage")) { run { await store.load(client) } }
                    .disabled(actor == nil || store.busy).accessibilityIdentifier("coverage.refresh")
                if actor == nil { Text(t("请先返回账号页登录并验证会话。", "Return to Account to sign in and verify your session.")) }
                if let notice = store.notice {
                    Text(notice == "RECOVERY_REQUIRED" ? t("有原请求待核对；不会自动再次删除。", "An original request needs verification. Deletion is never retried automatically.") : t("当前权限、接口或受保护文件未确认。请刷新；尚未宣称完成。", "Authority, API or protected-file state is unconfirmed. Refresh; no completion is claimed."))
                }
                if !store.storageReady {
                    Button(t("重试受保护临时文件与请求读取", "Retry protected-file cleanup and request read")) { store.retryCleanup(client) }.disabled(actor == nil || store.busy)
                }
            }
            if store.pending != nil {
                Section(t("核对原请求", "Check the original request")) {
                    Button(t("只读查询原操作回执", "Read the original operation receipt")) { run { await store.recover(client) } }.disabled(store.busy || actor == nil)
                    Button(t("明确重试同一原始请求…", "Explicitly retry the original request…")) { retryConfirmed = true }.disabled(store.busy || actor == nil)
                    Button(t("停止本入口恢复…", "Stop recovery from this entry…"), role: .destructive) { stopConfirmed = true }.disabled(store.busy || actor == nil)
                    Text(t("停止只擦除本入口的恢复字节；原模块记录和服务器结果仍需在原模块核对。", "Stopping erases only this entry’s recovery bytes. Original module records and server outcomes still need verification in their own module.")).font(.footnote)
                }
            }
            TimelineView(.periodic(from: .now, by: 1)) { _ in
                coverageSection(.server, title: t("服务器资料", "Server data"))
                coverageSection(.device, title: t("本机资料", "Device data"))
                coverageSection(.external, title: t("外部范围与留存边界", "External scopes and retention boundaries"))
            }
        }.navigationTitle(t("资料导出与删除覆盖", "Data export and deletion coverage"))
            .task(id: actor) { selected = nil; await store.load(client) }
            .onChange(of: actor) { _, next in actionTask?.cancel(); selected = nil; store.bind(next) }
            .onChange(of: phase) { _, next in if next != .active { actionTask?.cancel(); selected = nil; store.suspend() } }
            .onDisappear { actionTask?.cancel(); store.suspend() }
            .task(id: actor) {
                while !Task.isCancelled, actor != nil {
                    try? await Task.sleep(for: .seconds(1)); if !Task.isCancelled { store.tick(client) }
                }
            }
            .sheet(item: $selected) { module in
                NavigationStack {
                    NativeDataCoverageModuleView(module: module, store: store, session: session, chinese: chinese)
                }
            }
            .confirmationDialog(t("重试同一明确确认的范围？", "Retry the same confirmed scope?"), isPresented: $retryConfirmed, titleVisibility: .visible) {
                Button(t("原字节、原操作重试", "Retry the same bytes and operation"), role: .destructive) { run { await store.retry(client) } }
            } message: { Text(t("不会生成新操作或扩大范围；仍由原模块重新检查权限及版本。讲解删除缺少恢复接口时不会重放。", "No new operation or wider scope is created. The original module rechecks authority and version. Guide deletion is not replayed without its recovery API.")) }
            .confirmationDialog(t("停止本入口恢复？", "Stop recovery from this entry?"), isPresented: $stopConfirmed, titleVisibility: .visible) {
                Button(t("擦除本入口原请求，结果保持未知", "Erase this entry’s request; keep outcome unknown"), role: .destructive) { store.stopRecovery(client) }
            }
    }

    @ViewBuilder private func coverageSection(_ location: NativeDataCoverageModule.Location, title: String) -> some View {
        Section(title) {
            let modules = store.visibleModules(actor)
            let rows = store.visibleRows(actor)
            ForEach(NativeDataCoverageCopy.order.filter { fallbackLocation($0) == location }, id: \.self) { id in
                if let module = modules.first(where: { $0.id == id }) {
                    Button { selected = module } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(NativeDataCoverageCopy.title(id, chinese: chinese)).foregroundStyle(.primary)
                            Text(t("导出", "Export") + ": " + NativeDataCoverageCopy.state(rows.first(where: { $0.id == id + "/export" })?.state, chinese: chinese)).font(.caption)
                            Text(t("删除", "Delete") + ": " + NativeDataCoverageCopy.state(rows.first(where: { $0.id == id + "/delete" })?.state, chinese: chinese)).font(.caption)
                        }
                    }.accessibilityIdentifier("coverage.module." + id)
                } else {
                    VStack(alignment: .leading) {
                        Text(NativeDataCoverageCopy.title(id, chinese: chinese))
                        Text(t("覆盖注册尚未读取／已到期，不能确认完成。", "Coverage registration unread/expired; completion cannot be confirmed.")).font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
        }
    }
    private func fallbackLocation(_ id: String) -> NativeDataCoverageModule.Location {
        if ["provider", "backup", "external_copies", "financial_records"].contains(id) { return .external }
        if ["materials", "app_group", "local_share", "guide_cache", "offline", "local_journals"].contains(id) { return .device }
        return .server
    }
    private func run(_ operation: @escaping @MainActor () async -> Void) { actionTask?.cancel(); actionTask = Task { await operation() } }
}
