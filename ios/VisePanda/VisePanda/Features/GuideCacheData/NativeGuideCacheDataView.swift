import SwiftUI
import UIKit

struct NativeGuideCacheDataView: View {
    let coverage: NativeDataCoverageStore
    let session: NativeSession
    let chinese: Bool
    @Environment(\.scenePhase) private var phase
    @State private var store: NativeGuideCacheDataStore?
    @State private var confirmation = false
    @State private var share: GuideCacheShareSelection?
    private var actor: NativeCommunitySafetyActor? { phase == .active ? try? session.communitySafetyActor() : nil }
    private var registered: Bool { coverage.visibleModules(actor).contains { $0.id == "guide_cache" && $0.location == .device } }
    private func t(_ zh: String, _ en: String) -> String { chinese ? zh : en }

    var body: some View {
        Section(t("本人实际本机讲解缓存", "Your actual device Guide cache")) {
            Text(t("仅处理当前会话实际保留的讲解实例。服务器 Guide、其他行程与未确认追问保持原状；外部音频或已保存副本无法召回。", "Handles only actual Guide instances retained by this session. Server Guide data, other Trips and unconfirmed questions remain; external audio and saved copies cannot be recalled."))
            Text(t("原许可只有展示、语音、缓存与追问用途，没有讲解正文或音频导出权。本出口只含本人进度、已许可来源 ID 和必要选择／摘要元数据。", "Existing rights cover display, speech, cache and questions, with no published-text or audio export right. This export contains only your progress, permitted source IDs and necessary selection/digest metadata."))
                .font(.footnote)
            if let store {
                Button(t("读取实际保留实例", "Read actual retained instances")) { confirmation = false; share = nil; store.load(current: actor) }
                    .disabled(actor == nil || !registered).accessibilityIdentifier("guide.cache.load")
                ForEach(store.available, id: \.instanceID) { row in
                    VStack(alignment: .leading) {
                        Text(row.selection.tripID + " · " + row.selection.placeReferenceID).font(.caption)
                        Text(t("本机实例：", "Device instance: ") + row.instanceID.uuidString).font(.caption)
                        Text(row.hasReady ? t("讲解正文在内存中；不导出正文", "Published text is in memory; text is excluded from export") : t("没有当前讲解正文；只核对实际保留元数据", "No current published text; only actual retained metadata is inspected"))
                        Text(t("已许可来源 ID：", "Permitted source IDs: ") + String(row.sourceIdentifiers.count)
                             + t(" · 已完成段落：", " · completed segments: ") + String(row.completedSegmentIDs.count)).font(.caption)
                    }
                }
                if store.loaded && store.available.isEmpty {
                    Text(t("当前本人实际实例没有可选择的 Guide 绑定；不表示服务器或全机已清空。", "No selectable Guide binding exists in the current owner’s actual instances. This does not prove server or device-wide erasure."))
                }
                if !store.available.isEmpty {
                    Button(t("显式选择上列全部本机讲解实例并预览（30秒）", "Explicitly select all listed device Guide instances and preview (30 seconds)")) {
                        confirmation = false; share = nil; store.select(current: actor)
                    }.disabled(actor == nil || !registered).accessibilityIdentifier("guide.cache.select")
                }
                TimelineView(.periodic(from: .now, by: 1)) { _ in
                    if store.currentSelection(actor) {
                        Text(t("将清理所选实例的讲解正文、摘要、已许可来源 ID、语音进度及 Guide 播放回调；清理后自动刷新不会恢复缓存，后续明确重新核对仍可用。", "Cleanup removes the selected instances’ published text, digest, permitted source IDs, speech progress and Guide playback callbacks. Automatic refresh cannot revive it; a later explicit source recheck remains available."))
                        Button(t("生成受保护的本机元数据导出", "Create a protected device metadata export")) {
                            guard store.export(current: actor), let operation = store.exportOperationID else { return }
                            coverage.recordDevice(moduleID: "guide_cache", action: .export, operationID: operation.uuidString,
                                selection: t("实际本机 Guide 元数据；正文／音频未导出，系统交付未确认", "Actual device Guide metadata; text/audio excluded, system handoff unconfirmed"), state: .partial, current: actor)
                        }.disabled(!registered).accessibilityIdentifier("guide.cache.export")
                        Button(t("确认并清理上列本机缓存…", "Confirm and clean the listed device caches…"), role: .destructive) { confirmation = true }
                            .disabled(!registered).accessibilityIdentifier("guide.cache.clean")
                    }
                    if let url = store.exportURL(current: actor), let operation = store.exportOperationID, let actor {
                        Button(t("主动保存或分享已核验文件…", "Save or share the verified file…")) { share = .init(id: operation, actor: actor, url: url) }
                            .accessibilityIdentifier("guide.cache.share")
                    }
                    if let receipt = store.visibleReceipt(current: actor) {
                        Text(t("不可变本机回执：", "Immutable local receipt: ") + receipt.operationID.uuidString).font(.caption).textSelection(.enabled)
                        Text("\(receipt.inspectedEmptyCount)/\(receipt.instanceCount) · " + receipt.completedAt.formatted()).font(.caption)
                        Text(t("只证明上述本机实例和 Guide 渲染状态在此时已核验清空；未执行服务器删除。回执在本界面生命周期内保留。", "Proves only that the listed device instances and Guide renderer state were inspected empty at this time. No server deletion ran. The receipt remains for this screen’s lifetime."))
                        Button(t("生成此最小回执的受保护文件", "Create a protected file for this minimal receipt")) { _ = store.exportReceipt(current: actor) }
                            .disabled(!registered).accessibilityIdentifier("guide.cache.receipt.export")
                    }
                }
                if let delivery = store.delivery {
                    Text(delivery == "completed" ? t("系统已确认交付所选文件。", "The system confirmed delivery of the selected file.")
                        : delivery == "cancelled" ? t("系统分享已取消；不报交付完成。", "System sharing was cancelled; delivery is not complete.")
                        : delivery == "failed" ? t("系统交付失败。", "System delivery failed.") : t("文件已准备；系统交付尚未确认。", "File prepared; system delivery is unconfirmed."))
                }
                if store.notice != nil || !store.storageReady { Text(t("范围、来源、身份或受保护文件未确认；请重新读取。部分清理或错误不当作成功回执。", "Scope, source, identity or protected file is unconfirmed; reread. Partial cleanup or errors do not become a successful receipt.")) }
            }
        }
        .task { if store == nil { store = NativeGuideCacheDataStore(sources: [session.placeGuide], renderer: session.voiceAudio) } }
        .task(id: actor) {
            while !Task.isCancelled, actor != nil {
                try? await Task.sleep(for: .seconds(1))
                guard !Task.isCancelled else { return }
                store?.tick(current: actor)
                if share != nil && store?.exportURL(current: actor) == nil { share = nil }
                if store?.currentSelection(actor) != true { confirmation = false }
            }
        }
        .onChange(of: actor) { _, _ in confirmation = false; share = nil; store?.clear() }
        .onDisappear { confirmation = false; share = nil; store?.clear() }
        .confirmationDialog(t("清理已预览的本人本机 Guide 缓存？", "Clean your previewed device Guide cache?"), isPresented: $confirmation, titleVisibility: .visible) {
            Button(t("确认此准确范围并清理", "Confirm this exact scope and clean"), role: .destructive) {
                guard registered, let receipt = store?.clean(current: actor) else { return }
                coverage.recordDevice(moduleID: "guide_cache", action: .delete, operationID: receipt.operationID.uuidString,
                    selection: "\(receipt.instanceCount)" + t(" 个实际本机 Guide 实例及 Guide 渲染状态已独立核验清空", " actual device Guide instances and Guide renderer state inspected empty"), current: actor)
            }
        } message: { Text(t("仅上列实际实例，30秒准确状态匹配；不删除服务器、原追问请求、其他模块或外部副本。", "Only the listed actual instances, with an exact-state match within 30 seconds. Server data, original pending questions, other modules and external copies remain.")) }
        .sheet(item: $share) { item in
            NativeGuideCacheDataActivity(currentURL: { actor == item.actor && registered && store?.exportOperationID == item.id && store?.exportURL(current: actor) == item.url ? item.url : nil }) { completed, failed in
                guard actor == item.actor, registered else { share = nil; return }
                let accepted = store?.handedOff(operation: item.id, current: actor, completed: completed, failed: failed) == true
                coverage.recordDevice(moduleID: "guide_cache", action: .export, operationID: item.id.uuidString,
                    selection: accepted ? t("所选本机 Guide 文件已获系统交付确认", "Selected device Guide file received system delivery confirmation")
                        : t("系统交付未确认或已取消／失败", "System delivery unconfirmed, cancelled or failed"), state: accepted ? .scopedComplete : .partial, current: actor)
                share = nil
            }
        }
    }
}

private struct GuideCacheShareSelection: Identifiable { let id: UUID; let actor: NativeCommunitySafetyActor; let url: URL }
private struct NativeGuideCacheDataActivity: UIViewControllerRepresentable {
    let currentURL: @MainActor () -> URL?
    let completion: @MainActor (Bool, Bool) -> Void
    func makeUIViewController(context: Context) -> UIActivityViewController {
        let controller = UIActivityViewController(activityItems: currentURL().map { [$0] } ?? [], applicationActivities: nil)
        controller.completionWithItemsHandler = { _, completed, _, error in
            Task { @MainActor in completion(completed, error != nil) }
        }
        return controller
    }
    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {
        if currentURL() == nil { controller.dismiss(animated: true) }
    }
}
