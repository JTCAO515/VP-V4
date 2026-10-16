import SwiftUI

struct NativeQAServiceView: View {
    let chinese: Bool
    var isActive: Bool
    var onSignIn: (() -> Void)?
    @Environment(\.scenePhase) private var scenePhase
    @State private var store: NativeQAStore

    init(transport: any NativeQATransport, chinese: Bool, isActive: Bool = true, onSignIn: (() -> Void)? = nil) {
        self.chinese = chinese; self.isActive = isActive; self.onSignIn = onSignIn
        _store = State(initialValue: NativeQAStore(transport: transport))
    }
    private struct ReadIdentity: Hashable { let scope: NativeDataScope?; let visible: Bool }
    private var readIdentity: ReadIdentity { .init(scope: store.scope, visible: isActive && scenePhase == .active) }
    private func copy(_ zh: String, _ en: String) -> String { chinese ? zh : en }

    var body: some View {
        @Bindable var store = store
        ScrollView {
            LazyVStack(alignment: .leading, spacing: VPSpacing.section) {
                Text(copy("真实服务", "Real service")).font(.title2.bold()).accessibilityAddTraits(.isHeader)
                Text(status).font(.body).accessibilityIdentifier("native.qa.status")
                if store.scope == nil {
                    Text(copy("请通过账户入口登录后继续。", "Sign in through the account entry to continue."))
                    if let onSignIn {
                        Button(copy("前往登录", "Go to sign in"), action: onSignIn)
                            .frame(minHeight: 44).accessibilityIdentifier("native.qa.signin")
                    }
                }
                if readIdentity.visible, store.hasReadableProjection, let policy = store.policy {
                    VStack(alignment: .leading, spacing: VPSpacing.standard) {
                        Text(chinese ? policy.noticeZh : policy.noticeEn).fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("native.qa.notice")
                        Text(copy("服务提供方：", "Provider: ") + policy.provider + " · " + policy.recipient).font(.footnote)
                        if policy.consentState != .accepted {
                            Button(copy("同意以上说明并继续", "Agree to this notice and continue")) { Task { await store.acceptConsent() } }
                                .disabled(store.busy).frame(minHeight: 44).accessibilityIdentifier("native.qa.consent")
                        }
                    }
                }
                if readIdentity.visible, store.hasReadableProjection, store.policy?.consentState == .accepted {
                    VStack(alignment: .leading, spacing: VPSpacing.standard) {
                        Text(copy("已保存的会话", "Saved sessions")).font(.headline)
                        ForEach(store.sessions) { session in
                            Button {
                                Task { await store.select(session.id) }
                            } label: {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(session.label)
                                    Text(session.updatedAt).font(.caption)
                                    if store.selectedID == session.id { Text(copy("当前会话", "Current session")).font(.caption) }
                                }.frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                            }
                            .disabled(store.busy || store.pending != nil)
                            .accessibilityIdentifier("native.qa.session.\(session.id)")
                        }
                        Button(copy("新建会话", "New session")) { Task { await store.createSession() } }
                            .disabled(store.busy || store.pending != nil).frame(minHeight: 44)
                            .accessibilityIdentifier("native.qa.new-session")
                    }
                }
                ForEach(readIdentity.visible && store.hasReadableProjection ? store.messages : []) { message in
                    VStack(alignment: .leading, spacing: VPSpacing.standard) {
                        Text(message.input).fixedSize(horizontal: false, vertical: true)
                        Text(messageStatus(message.status)).font(.caption).foregroundStyle(Color.vpSecondaryText)
                            .accessibilityIdentifier("native.qa.message-status.\(message.id)")
                        if let answer = message.text {
                            Text(answer).fixedSize(horizontal: false, vertical: true)
                                .accessibilityIdentifier("native.qa.answer.\(message.id)")
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(VPSpacing.standard).background(Color.vpSurface, in: RoundedRectangle(cornerRadius: 16))
                }
                if readIdentity.visible, store.hasReadableProjection, store.policy?.consentState == .accepted, store.selectedID != nil {
                    VStack(alignment: .leading, spacing: VPSpacing.standard) {
                        if let maximum = store.policy?.maxTurns {
                            Text(copy("本会话最多 \(maximum) 次提问。", "This session allows up to \(maximum) questions.")).font(.footnote)
                        }
                        TextField(copy("输入问题", "Ask a question"), text: $store.draft, axis: .vertical)
                            .textFieldStyle(.roundedBorder).disabled(store.busy || store.pending != nil)
                            .accessibilityIdentifier("native.qa.input")
                        if store.draft.utf16.count > 4000 {
                            Text(copy("问题请控制在 4000 字以内。", "Keep the question within 4000 characters.")).font(.footnote)
                        }
                        Button(copy("发送", "Send")) { Task { await store.send() } }
                            .disabled(!store.canSend).frame(minHeight: 44).accessibilityIdentifier("native.qa.send")
                    }
                }
                if store.scope != nil {
                    Button(copy("读取已保存状态", "Read saved state")) { Task { await store.refresh() } }
                        .disabled(store.busy).frame(minHeight: 44).accessibilityIdentifier("native.qa.refresh")
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading).padding(VPSpacing.standard)
        }
        .background(Color.vpBackground).scrollDismissesKeyboard(.interactively)
        .accessibilityIdentifier("native.qa.service")
        .task(id: readIdentity) {
            let identity = readIdentity
            await store.activate(identity.visible)
            while identity.visible, !Task.isCancelled, readIdentity == identity {
                do { try await Task.sleep(for: .seconds(3)) } catch { return }
                guard !Task.isCancelled, readIdentity == identity else { return }
                if store.state == .pending { await store.refresh() }
            }
        }
        .onDisappear { store.invalidate() }
    }
    private var status: String {
        if !readIdentity.visible { return copy("服务页面已暂停。", "This service page is paused.") }
        if store.scope == nil { return copy("尚未登录", "Signed out") }
        return switch store.state {
        case .inactive: copy("服务页面已暂停。", "This service page is paused.")
        case .signedOut: copy("尚未登录", "Signed out")
        case .ready: copy("已读取当前会话状态。", "Current session state loaded.")
        case .loading: copy("正在核对服务状态…", "Checking service state…")
        case .pending: copy("请求仍在处理中，尚未完成。", "The request is pending and has not completed.")
        case .unknown: copy("尚未确认请求结果。原请求已保留，请读取已保存状态，避免重复发送。", "The request outcome is unknown. Its original identity is retained. Read saved state before sending again.")
        case .unavailable: copy("服务暂不可用，请稍后读取已保存状态。", "The service is unavailable. Read saved state again later.")
        case .blocked(let code):
            if code == "CONSENT_REQUIRED" { copy("请先阅读服务说明并明确同意。", "Read the service notice and explicitly agree to continue.") }
            else { copy("当前无法继续，请重新核对登录、权限或服务说明。未确认请求仍保留。", "Cannot continue. Recheck sign-in, access or the service notice. Unconfirmed requests remain retained.") }
        }
    }
    private func messageStatus(_ status: NativeQAMessage.Status) -> String {
        switch status {
        case .pending: copy("处理中", "Pending")
        case .reconciliationRequired: copy("结果尚待核对", "Reconciliation required")
        case .answered: copy("已回答", "Answered")
        case .partial: copy("部分回答", "Partial answer")
        case .clarification: copy("需要澄清", "Clarification needed")
        case .blocked: copy("暂时受阻", "Blocked")
        case .technicalFailure: copy("技术失败", "Technical failure")
        }
    }
}
