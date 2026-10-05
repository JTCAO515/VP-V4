import SwiftUI

/// One visible selection of original material and current owned Trip; login uses the existing Profile consumer.
struct NativeEntryResumeView: View {
    let session: NativeSession
    let coordinator: NativeEntryResumeCoordinator
    let chinese: Bool
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.dismiss) private var dismiss
    @State private var trips = NativeTripStore()
    @State private var selectedReceipt: ShareIntakeInbox.Receipt?
    @State private var showLogin = false
    @State private var notice: String?
    @State private var destination: NativeEntryResumeTrip?
    @State private var opening = false

    private func t(_ zh: String, _ en: String) -> String { chinese ? zh : en }
    var body: some View {
        NavigationStack {
            Form {
                Section(t("接续原材料", "Resume original material")) {
                    Text(t("系统分享仅保存本机副本。选择当前账号和已有行程后，仍需逐页校正并明确确认原行程差异。", "System sharing keeps a device copy. Choose this account and an existing Trip, then correct fields and explicitly confirm the original Trip diff."))
                    if session.dataScope == nil {
                        Text(t("请先登录，再明确接管原材料。链接不会授予新的行程权限。", "Sign in, then explicitly claim the original material. The link grants no Trip permission."))
                        ForEach(coordinator.receipts) { receipt in
                            Button(t("选择原 PDF（\(receipt.pageCount)页）并登录", "Select original PDF (\(receipt.pageCount) pages) and sign in")) {
                                do { try coordinator.selectAnonymous(receipt); showLogin = true; notice = nil }
                                catch { notice = "unavailable" }
                            }.accessibilityIdentifier("entryResume.anonymous.\(receipt.id)")
                        }
                        Button(t("打开账号登录", "Open account sign-in")) { showLogin = true }
                            .accessibilityIdentifier("entryResume.login")
                    } else {
                        Text(t("当前账号：", "Current account: ") + (session.subject ?? ""))
                            .font(.caption).textSelection(.enabled)
                        ForEach(coordinator.receipts) { receipt in
                            VStack(alignment: .leading) {
                                Text(t("PDF · \(receipt.pageCount)页", "PDF · \(receipt.pageCount) pages"))
                                Text(receipt.createdAt, style: .date).font(.caption)
                                Text(t("有效至 ", "Expires ") + receipt.expiresAt.formatted()).font(.caption)
                                Button(t("用当前账号接管并选择行程", "Claim with this account and choose Trip")) {
                                    do { selectedReceipt = try coordinator.claim(receipt, scope: session.dataScope); notice = nil }
                                    catch { selectedReceipt = nil; notice = "unavailable" }
                                }.disabled(opening || selectedReceipt != nil)
                                    .accessibilityIdentifier("entryResume.claim")
                                Button(t("删除本机分享副本", "Delete shared device copy"), role: .destructive) {
                                    do { try coordinator.delete(receipt, scope: session.dataScope); selectedReceipt = nil }
                                    catch { notice = "cleanupRequired" }
                                }.disabled(opening).accessibilityIdentifier("entryResume.delete")
                            }
                        }
                    }
                    if let message = notice ?? coordinator.message { Text(messageText(message)).accessibilityIdentifier("entryResume.status") }
                    if coordinator.state.failure == .cleanupRequired {
                        Button(t("重试清理本机副本", "Retry device-copy cleanup"), role: .destructive) {
                            do { try coordinator.erase(); coordinator.openInbox(scope: session.dataScope); notice = nil }
                            catch { notice = "cleanupRequired" }
                        }.accessibilityIdentifier("entryResume.cleanup.retry")
                    }
                    Text(t("未安装、关联域未配置或链接失效时，请打开 App，从 Files 手动选择原 PDF。安装后不会自动恢复链接参数。", "If the app is missing, associated domains are unconfigured or the link expired, open the app and choose the original PDF from Files. Installation does not automatically restore link parameters."))
                        .font(.footnote)
                }
                if let receipt = selectedReceipt, session.dataScope != nil {
                    Section(t("导出这份本机材料", "Export this local material")) {
                        Button(t("准备本地导出副本", "Prepare local export copy")) {
                            do { try coordinator.prepareExport(receipt, scope: session.dataScope); notice = nil }
                            catch { notice = "unavailable" }
                        }.disabled(opening).accessibilityIdentifier("entryResume.export.prepare")
                        if coordinator.state.failure == nil, let copy = coordinator.exports.current(scope: session.dataScope) {
                            ShareLink(items: copy.files) { Label(t("保存或分享 PDF 与清单", "Save or share PDF and manifest"), systemImage: "square.and.arrow.up") }
                                .accessibilityIdentifier("entryResume.export.share")
                        }
                        Text(t("仅导出这份原 PDF 和最小来源清单，不是全账号数据导出。导出临时副本在关闭、后台或短期到期时删除；已保存到外部的副本无法撤回。", "Exports only this original PDF and a minimal manifest, not all account data. Temporary export copies are deleted on close, background or short expiry; copies saved externally cannot be recalled."))
                            .font(.footnote)
                    }
                }
                if selectedReceipt != nil, session.dataScope != nil {
                    Section(t("明确选择已有行程", "Choose an existing Trip")) {
                        if trips.busy || opening { ProgressView() }
                        ForEach(trips.trips) { trip in
                            Button(trip.title) { Task { await openTrip(trip.id) } }
                                .disabled(opening || trips.busy)
                                .accessibilityIdentifier("entryResume.trip.\(trip.id)")
                        }
                        if trips.trips.isEmpty && !trips.busy { Text(t("当前没有可读行程。可返回行程页创建行程后，再从收件箱继续。", "No readable Trip is available. Create a Trip from Journeys, then continue from the inbox.")) }
                    }
                }
            }
            .navigationTitle(t("系统分享收件箱", "System share inbox"))
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(t("关闭", "Close")) { dismiss() } } }
            .sheet(isPresented: $showLogin) { NavigationStack { ProfileView() } }
            .fullScreenCover(item: $destination) { target in
                NavigationStack {
                    NativeTripView(initialTripID: target.tripID, initialTripScope: target.scope, initialSharedPDF: target)
                        .toolbar { ToolbarItem(placement: .cancellationAction) { Button(t("返回收件箱", "Back to inbox")) { destination = nil } } }
                }
            }
            .task(id: session.dataScope) {
                selectedReceipt = nil; destination = nil; notice = nil
                coordinator.refresh(scope: session.dataScope)
                if let scope = session.dataScope {
                    showLogin = false
                    trips.reset(for: scope); await trips.list(using: session)
                } else { trips.reset(for: nil) }
            }
            .onChange(of: scenePhase) { _, phase in
                if phase == .active { coordinator.refresh(scope: session.dataScope) }
                else { coordinator.hide(); selectedReceipt = nil; destination = nil }
            }
            .onDisappear { coordinator.eraseExports() }
            .task(id: coordinator.exports.copy?.id) {
                guard let copy = coordinator.exports.copy else { return }
                let delay = copy.expiresAt.timeIntervalSinceNow
                if delay > 0 { try? await Task.sleep(for: .seconds(delay)) }
                guard !Task.isCancelled, coordinator.exports.copy?.id == copy.id else { return }
                coordinator.eraseExports()
            }
            .task(id: selectedReceipt?.id) {
                guard let receipt = selectedReceipt else { return }
                let delay = receipt.expiresAt.timeIntervalSinceNow
                if delay > 0 { try? await Task.sleep(for: .seconds(delay)) }
                guard !Task.isCancelled, selectedReceipt?.id == receipt.id else { return }
                selectedReceipt = nil; destination = nil; coordinator.refresh(scope: session.dataScope)
            }
        }
    }
    private func openTrip(_ id: String) async {
        guard !opening, let receipt = selectedReceipt, let scope = session.dataScope else { return }
        opening = true; defer { opening = false }
        await trips.select(id, using: session)
        guard !Task.isCancelled, session.dataScope == scope, selectedReceipt == receipt,
              trips.scope == scope, trips.selectedID == id, trips.detail?.trip.id == id,
              trips.canEdit, trips.pending == nil, !trips.hasUncertainProposal else { notice = "unavailable"; return }
        do {
            let url = try coordinator.sourceURL(receipt, scope: session.dataScope)
            destination = .init(tripID: id, scope: scope, receipt: receipt, sourceURL: url)
        } catch { notice = "unavailable" }
    }
    private func messageText(_ message: String) -> String {
        switch message {
        case "loginRequired": return t("登录后可继续原材料。", "Continue the original material after sign-in.")
        case "unconfigured": return t("此版本尚未配置系统分享收件箱，请从行程页的 Files 入口导入。", "This build has no configured system inbox. Import through Files on the Trip page.")
        case "cleanupRequired": return t("本机清理未完成，暂不能继续导入。请重试清理。", "Device cleanup is incomplete. Retry cleanup before importing.")
        default: return t("原材料已过期、账号已变化或链接不可用。请从当前账号手动入口重新选择原文件。", "The original material expired, the account changed or the link is unavailable. Choose the original file again from this account's manual entry.")
        }
    }
}

struct NativeEntryResumeTrip: Identifiable {
    let id = UUID()
    let tripID: String
    let scope: NativeDataScope
    let receipt: ShareIntakeInbox.Receipt
    let sourceURL: URL
}

struct NativeEntryResumeInboxEntry: View {
    @Environment(AppSettings.self) private var settings
    var body: some View {
        NativeEntryResumeView(session: settings.nativeSession, coordinator: settings.nativeSession.entryResume, chinese: settings.selectedLocale == .zh)
            .task { settings.nativeSession.entryResume.openInbox(scope: settings.nativeSession.dataScope) }
    }
}
