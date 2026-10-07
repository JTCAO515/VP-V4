import SwiftUI
import UIKit

struct NativeOfflineDataView: View {
    let coverage: NativeDataCoverageStore
    let session: NativeSession
    let chinese: Bool
    @Environment(\.scenePhase) private var phase
    @State private var store: NativeOfflineDataStore?
    @State private var confirmation = false
    @State private var share: OfflineShareSelection?
    private var actor: NativeCommunitySafetyActor? { phase == .active ? try? session.communitySafetyActor() : nil }
    private var registered: Bool { coverage.visibleModules(actor).contains { $0.id == "offline" && $0.location == .device } }
    private func t(_ zh: String, _ en: String) -> String { chinese ? zh : en }

    var body: some View {
        Section(t("所选行程的本机离线资料", "Device offline data for a selected Trip")) {
            Text(t("只处理所选行程在本机的用户改稿、获准确认文字及住宿记录。服务器行程、其他行程、待确认命令和外部已保存副本保留。", "Handles only this Trip’s device user draft, permitted confirmed text and lodging record. Server Trips, other Trips, pending commands and external saved copies remain."))
            if let store {
                Button(t("读取自己的离线行程与清理回执", "Read your offline Trips and cleanup receipts")) { store.load(current: actor) }
                    .disabled(actor == nil || !registered).accessibilityIdentifier("offline.data.load")
                ForEach(store.ids, id: \.self) { id in
                    Button { share = nil; confirmation = false; store.select(id, current: actor) } label: {
                        HStack { Text(id).font(.caption); if store.selected == id { Image(systemName: "checkmark") } }
                    }.disabled(actor == nil || !registered).accessibilityIdentifier("offline.data.select." + id)
                }
                if store.loaded && store.ids.isEmpty { Text(t("当前账号的真实本机索引为空；不代表全机或服务器资料已清除。", "This account’s actual local index is empty. This does not prove erasure of all device or server data.")) }
                TimelineView(.periodic(from: .now, by: 1)) { _ in
                    if store.currentSelection(actor) {
                        ForEach(store.receipts) { receipt in
                            VStack(alignment: .leading) {
                                Text(sourceTitle(receipt.source))
                                Text(receipt.state == .included ? t("原记录可导出", "Original record can be exported") : receipt.state == .absent ? t("本机文件不存在", "Device file is absent") : t("许可未确认或清理中；内容不读取、不导出，密文保留至明确清理", "Permit unavailable or cleanup pending: content is not read or exported; ciphertext remains until explicit cleanup"))
                                    .font(.caption)
                            }
                        }
                        if store.pendingCleanup == nil {
                            Button(t("明确生成所选资料的受保护导出文件", "Create a protected export of the selected data explicitly")) {
                                if store.export(current: actor), let operation = store.exportOperationID {
                                    coverage.recordDevice(moduleID: "offline", action: .export, operationID: operation,
                                        selection: (store.selected ?? "") + t(" · 文件已核验，系统交付尚未确认", " · file verified; system handoff unconfirmed"), state: .partial, current: actor)
                                }
                            }.disabled(!registered).accessibilityIdentifier("offline.data.export")
                        }
                        if let url = store.exportURL(current: actor), let actor, let operation = store.exportOperationID, let selected = store.selected {
                            Button(t("主动保存或分享已核验文件…", "Save or share the verified file…")) {
                                share = .init(id: operation, tripID: selected, actor: actor, url: url, complete: store.exportComplete)
                            }.accessibilityIdentifier("offline.data.share")
                        }
                        Button(store.pendingCleanup == nil ? t("明确清理所选行程的本机副本…", "Clean this Trip’s device copies explicitly…") : t("核对原操作并继续清理…", "Review and resume the original cleanup…"), role: .destructive) { confirmation = true }
                            .disabled(!registered).accessibilityIdentifier("offline.data.clean")
                    }
                }
                if let receipt = store.cleanupReceipt {
                    Text(t("最小本机回执：三类文件与索引在下列时间核验不存在；服务器和外部副本未删除。", "Minimal local receipt: all three source files and index were verified absent at the time below. Server and external copies were not deleted."))
                    Text(receipt.operationID + " · " + receipt.verifiedAt.formatted()).font(.caption).textSelection(.enabled)
                }
                Text(t("本机保留最小操作号、命名空间代次和清理回执，不保留被清理内容；阻止旧请求复活。后续明确新保存仍可用。导出含私有文字，最多30秒，许可更早到期时提前移除。", "The device retains minimal operation, namespace generation and cleanup receipt without erased content, blocking old requests. Explicit new saves remain available. Exports contain private text, expire within 30 seconds, and are removed earlier when the permit expires."))
                    .font(.footnote)
                if store.notice != nil || !store.storageReady {
                    Text(t("选择已变化、许可不可读或受保护存储未确认。重读真实索引后核对；错误不当作空集合或成功。", "Selection changed, permit is unreadable, or protected storage is unconfirmed. Reread the actual index and review; errors are not empty data or success."))
                }
            }
        }
        .task { if store == nil { store = NativeOfflineDataStore(original: session.offlineTrips) } }
        .task(id: actor) {
            while !Task.isCancelled, actor != nil {
                try? await Task.sleep(for: .seconds(1))
                if !Task.isCancelled {
                    store?.tick(current: actor)
                    if share != nil && store?.exportURL(current: actor) == nil { share = nil }
                    if store?.selected == nil { confirmation = false }
                }
            }
        }
        .onChange(of: actor) { _, _ in share = nil; confirmation = false; store?.clear() }
        .onDisappear { share = nil; confirmation = false; store?.clear() }
        .confirmationDialog(t("只清理所选行程的本机离线资料？", "Clean only this Trip’s device offline data?"), isPresented: $confirmation, titleVisibility: .visible) {
            Button(t("确认此行程并清理本机副本", "Confirm this Trip and clean device copies"), role: .destructive) {
                guard registered, let actor, let receipt = store?.clean(current: actor) else { return }
                coverage.recordDevice(moduleID: "offline", action: .delete, operationID: receipt.operationID,
                    selection: receipt.namespace.tripID + t(" · 三类受管文件和原索引已独立核验不存在", " · all three managed files and original index independently verified absent"), current: actor)
            }
        } message: { Text((store?.selected ?? "") + t("。密文也会删除，原命令不重放；失败可继续同一原操作。", ". Ciphertext is also erased; original commands are not replayed. Failure can resume this same operation.")) }
        .sheet(item: $share) { value in
            NativeOfflineDataActivity(currentURL: { store?.exportURL(current: actor) == value.url && actor == value.actor ? value.url : nil }) { completed in
                if completed, registered, actor == value.actor, store?.exportOperationID == value.id,
                   store?.exportURL(current: actor) == value.url {
                    coverage.recordDevice(moduleID: "offline", action: .export, operationID: value.id,
                        selection: value.tripID + t(" · 原源回执及系统完成回执", " · original source receipts and system completion receipt"),
                        state: value.complete ? .scopedComplete : .partial, current: actor)
                }
                share = nil
            }
        }
    }
    private func sourceTitle(_ source: NativeOfflineDataSource) -> String {
        switch source {
        case .userDraft: return t("用户编辑草稿", "User-edit draft")
        case .confirmedText: return t("原许可确认文字缓存", "Original permitted confirmed-text cache")
        case .lodging: return t("用户住宿本机记录", "User lodging device record")
        }
    }
}
private struct OfflineShareSelection: Identifiable {
    let id: String
    let tripID: String
    let actor: NativeCommunitySafetyActor
    let url: URL
    let complete: Bool
}
/// Existing private-file/system-completion pattern, with authority rechecked at presentation.
private struct NativeOfflineDataActivity: UIViewControllerRepresentable {
    let currentURL: () -> URL?
    let result: (Bool) -> Void
    func makeUIViewController(context: Context) -> UIActivityViewController {
        let controller = UIActivityViewController(activityItems: currentURL().map { [$0] } ?? [], applicationActivities: nil)
        controller.completionWithItemsHandler = { _, completed, _, error in result(completed && error == nil) }
        return controller
    }
    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {
        if currentURL() == nil { controller.dismiss(animated: false) }
    }
}
