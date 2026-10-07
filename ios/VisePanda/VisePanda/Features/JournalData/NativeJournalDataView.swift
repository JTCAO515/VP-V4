import SwiftUI
import UIKit

struct NativeJournalDataView: View {
    let coverage: NativeDataCoverageStore
    let session: NativeSession
    let chinese: Bool
    @Environment(\.scenePhase) private var phase
    @State private var store: NativeJournalDataStore?
    @State private var original: NativeJournalDataExportRecord?
    @State private var share: ShareSelection?
    private var actor: NativeCommunitySafetyActor? { phase == .active ? try? session.communitySafetyActor() : nil }
    private var registered: Bool { coverage.visibleModules(actor).contains { $0.id == "local_journals" && $0.location == .device } }
    private func t(_ zh: String, _ en: String) -> String { chinese ? zh : en }
    var body: some View {
        Section(t("本人本机未确认操作", "Your device’s unresolved operations")) {
            Text(t("逐项读取当前账号与会话合资格的原请求。读取未确认不视为空；旧会话请求保留且不加入导出。通知令牌、登录凭据、授权及受限正文不导出。", "Each source uses its original current-account and session reader. An unconfirmed read is not empty. Old-session requests remain and are excluded. Device tokens, credentials, authorization and restricted bodies are excluded."))
            Button(t("读取全部原来源", "Read all original sources")) {
                if store == nil { store = NativeJournalDataStore(source: session.journalDataSource()) }
                store?.load(current: actor)
            }.disabled(actor == nil || !registered).accessibilityIdentifier("journals.read")
            if let store {
                ForEach(store.rows, id: \.record.source) { row in
                    VStack(alignment: .leading) {
                        Text(row.record.source.title(chinese: chinese)).font(.headline)
                        Text(row.record.state == .absent ? t("原读取已确认无请求", "The original reader confirmed no request")
                            : row.record.state == .unavailable ? t("资格或读取未确认；不视为空", "Qualification or read unconfirmed; not empty")
                            : t("原请求保留；结果尚未核验", "Original request retained; outcome unverified"))
                        if row.record.state == .pending {
                            Text(row.record.kind == .originalOperation ? t("可导出原操作字节", "Original operation bytes may be exported")
                                : t("仅导出安全操作元数据；正文与授权保持受保护", "Only safe operation metadata is exported; body and authority remain protected")).font(.caption)
                            if let operation = row.record.operationID { Text(operation).font(.caption).textSelection(.enabled) }
                            Button(t("回到对应原模块核验…", "Return to the original module to verify…")) {
                                guard store.canReturnToOriginal(row.record.source, current: actor) else { return }
                                original = row.record
                            }.disabled(!registered || store.selection == nil)
                            Button(t("读取原模块完成证明", "Read the original module’s completion proof")) {
                                guard registered, let receipt = store.inspectCompletion(source: row.record.source, current: actor) else { return }
                                coverage.recordDevice(moduleID: "local_journals", action: .delete, operationID: receipt.id.uuidString,
                                    selection: row.record.source.title(chinese: chinese) + t("：原模块回执与本机请求物理读回已核验；仅此请求", ": original receipt and physical absence verified; this request only"), current: actor)
                            }.disabled(!registered || store.selection == nil)
                        }
                    }
                }
                if !store.rows.isEmpty {
                    Button(t("显选上列准确清单（30秒）", "Select this exact list (30 seconds)")) { store.select(current: actor) }
                        .disabled(!registered).accessibilityIdentifier("journals.select")
                    Button(t("生成受保护的有界导出", "Create a protected, bounded export")) {
                        guard store.export(current: actor), let id = store.exportOperationID else { return }
                        coverage.recordDevice(moduleID: "local_journals", action: .export, operationID: id.uuidString,
                            selection: t("逐源合资格记录及明确未确认项；文件已准备，系统交付未确认", "Qualified records and explicit unconfirmed sources; file prepared, system delivery unconfirmed"), state: .partial, current: actor)
                    }.disabled(!registered || store.selection == nil).accessibilityIdentifier("journals.export")
                }
                ForEach(store.visibleReceipts(current: actor)) { receipt in
                    Text(receipt.source.title(chinese: chinese) + " · " + receipt.id.uuidString).font(.caption)
                    Text(t("仅证明该原请求已由原模块核验并从本机物理读回为空。服务器结果只由原回执证明；其他请求、账户资料、最少审计及外部副本保持原边界。", "Proves only this original request was verified by its module and inspected physically absent on this device. The original receipt alone proves its server outcome. Other requests, account data, minimal audit and external copies retain their own boundaries."))
                    Button(t("导出此最小本机回执", "Export this minimal local receipt")) { _ = store.exportReceipt(receipt, current: actor) }
                        .disabled(!registered)
                }
                if let url = store.exportURL(current: actor), let id = store.exportOperationID, let actor {
                    Button(t("主动保存或分享文件…", "Save or share the file…")) { share = .init(id: id, actor: actor, url: url) }
                        .disabled(!registered).accessibilityIdentifier("journals.share")
                }
                if let delivery = store.delivery {
                    Text(delivery == "completed" ? t("系统已确认交付此文件", "System delivery of this file is confirmed")
                        : delivery == "cancelled" ? t("分享已取消，未完成交付", "Sharing cancelled; delivery incomplete")
                        : delivery == "failed" ? t("系统交付失败", "System delivery failed") : t("文件已准备，交付未确认", "File prepared; delivery unconfirmed"))
                }
                if store.notice != nil || !store.storageReady {
                    Text(t("来源、身份、时限或原模块证明未确认。未知结果的原请求继续保留；请重新读取或回原模块核验。", "Source, identity, lifetime or original proof is unconfirmed. Unknown operations remain retained. Read again or verify in the original module."))
                }
            }
            Text(t("没有批量放弃或重发。打开原模块仍需其原来的权限、同意、行程可见确认和预算。", "No bulk discard or replay runs. The original module still requires its own permissions, consent, visible Trip confirmation and budget."))
        }
        .task(id: actor) {
            while !Task.isCancelled, actor != nil {
                try? await Task.sleep(for: .seconds(1)); guard !Task.isCancelled else { return }
                store?.tick(current: actor)
                if share != nil && store?.exportURL(current: actor) == nil { share = nil }
            }
        }
        .onChange(of: actor) { _, _ in original = nil; share = nil; store?.clear() }
        .onDisappear { original = nil; share = nil; store?.clear() }
        .sheet(item: $original) { record in
            NavigationStack { originalDestination(record) }
        }
        .sheet(item: $share) { item in
            NativeJournalDataActivity(currentURL: {
                actor == item.actor && registered && store?.exportOperationID == item.id && store?.exportURL(current: actor) == item.url ? item.url : nil
            }) { completed, failed in
                guard actor == item.actor, registered else { share = nil; return }
                let accepted = store?.handedOff(operation: item.id, current: actor, completed: completed, failed: failed) == true
                coverage.recordDevice(moduleID: "local_journals", action: .export, operationID: item.id.uuidString,
                    selection: accepted ? t("此本机文件已获系统交付确认", "System delivery confirmed for this device file")
                        : t("系统交付未确认、取消或失败", "System delivery unconfirmed, cancelled or failed"),
                    state: accepted ? .scopedComplete : .partial, current: actor); share = nil
            }
        }
    }
    @ViewBuilder private func originalDestination(_ record: NativeJournalDataExportRecord) -> some View {
        if let moduleID = record.source.coverageModule,
           let module = coverage.visibleModules(actor).first(where: { $0.id == moduleID && $0.location == .server }) {
            NativeDataCoverageModuleView(module: module, store: coverage, session: session, chinese: chinese)
        } else {
            switch record.source {
            case .ask: NativeAskView(isActive: actor != nil)
            case .community: NativeCommunitySubmissionView()
            case .communitySafety: NativeCommunitySafetyView()
            case .experience: NativeExperienceView(access: session.communityExperienceAccess)
            case .reservation: NativeReservationsView(session: session, chinese: chinese, active: actor != nil)
            case .deviceDelete: NativeDeviceMaterialDeleteView(session: session, chinese: chinese)
            case .tripLifecycle: NativeTripLifecycleView(session: session, chinese: chinese, initialTripID: record.tripID)
            case .serviceOperation:
                if let id = record.objectID { NativeServiceOperationsView(caseId: id) }
                else { Text(t("回原服务协作模块核验；对象尚未确认。", "Verify in the original service module; object unconfirmed.")) }
            case .travelerBrief:
                if let id = record.objectID { NativeTravelerBriefView(caseID: id) }
                else { Text(t("回原旅行者简报模块核验；对象尚未确认。", "Verify in the original brief module; object unconfirmed.")) }
            case .recovery:
                if let trip = record.tripID { NativeRecoveryView(tripID: trip) }
                else { Text(t("在原局部恢复模块核验；当前请求范围未确认。", "Verify in the original recovery module; the request scope is unconfirmed.")) }
            default:
                NativeTripView(initialTripID: record.tripID, initialTripScope: actor?.scope)
            }
        }
    }
    private struct ShareSelection: Identifiable { let id: UUID; let actor: NativeCommunitySafetyActor; let url: URL }
}

extension NativeJournalDataExportRecord: Identifiable { var id: String { source.rawValue } }

extension NativeJournalDataSourceID {
    var coverageModule: String? {
        switch self {
        case .profile: "profile"
        case .conversation: "conversations"
        case .turn: "turn"
        case .result: "results"
        case .archive: "archive"
        case .coverageProgress: "coverage_progress"
        case .materialReference: "material_exit_progress"
        case .notificationData: "notification_exit_progress"
        case .memoryDelete: "memory"
        case .deviceDelete: "materials"
        default: nil
        }
    }
    func title(chinese: Bool) -> String {
        let names: [Self: (String, String)] = [
            .coverage: ("覆盖操作", "Coverage operation"), .materialReference: ("材料引用清理", "Material-reference cleanup"),
            .profile: ("档案清理", "Profile cleanup"), .conversation: ("对话清理", "Conversation cleanup"),
            .serviceOperation: ("服务协作", "Service operation"), .turn: ("轮次清理", "Turn cleanup"),
            .reservation: ("订单引用", "Reservation reference"), .community: ("社区提交", "Community submission"),
            .recovery: ("局部恢复", "Local recovery"), .tripLifecycle: ("行程生命周期", "Trip lifecycle"),
            .travelerBrief: ("旅行者简报", "Traveler brief"), .pdf: ("PDF 入库", "PDF intake"),
            .communitySafety: ("社区安全", "Community safety"), .notificationData: ("通知清理", "Notification cleanup"),
            .coverageProgress: ("覆盖进度清理", "Coverage-progress cleanup"), .archive: ("行程归档资料", "Trip archive data"),
            .experience: ("社区发布", "Community publication"), .placeAction: ("地点操作", "Place action"),
            .scopedTrip: ("局部行程修改", "Scoped Trip edit"), .result: ("成果清理", "Result cleanup"),
            .notification: ("提醒操作", "Reminder operation"), .guide: ("讲解追问", "Guide follow-up"),
            .ask: ("助手提问", "Assistant request"), .tripSupport: ("行程依据确认", "Trip support confirmation"),
            .deviceDelete: ("所选本机资料删除", "Selected device-material deletion"), .readinessSave: ("准备状态保存", "Readiness save"),
            .linkedTripDelete: ("关联行程删除", "Linked Trip deletion"), .memoryDelete: ("记忆删除", "Memory deletion"),
            .tripDelete: ("原行程删除请求", "Original Trip deletion request")]
        guard let name = names[self] else { return rawValue }; return chinese ? name.0 : name.1
    }
}

private struct NativeJournalDataActivity: UIViewControllerRepresentable {
    let currentURL: @MainActor () -> URL?
    let completion: @MainActor (Bool, Bool) -> Void
    func makeUIViewController(context: Context) -> UIActivityViewController {
        let controller = UIActivityViewController(activityItems: currentURL().map { [$0] } ?? [], applicationActivities: nil)
        controller.completionWithItemsHandler = { _, completed, _, error in Task { @MainActor in completion(completed, error != nil) } }
        return controller
    }
    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {
        if currentURL() == nil { controller.dismiss(animated: true) }
    }
}
