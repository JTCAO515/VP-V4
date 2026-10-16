import SwiftUI

struct NativeQAServiceView: View {
    let chinese: Bool
    var isActive: Bool
    var onSignIn: (() -> Void)?
    @Environment(\.scenePhase) private var scenePhase
    @State private var store: NativeQAStore
    @State private var noticeExpanded = false
    @State private var sessionsExpanded = true
    @FocusState private var composing: Bool

    init(transport: any NativeQATransport, chinese: Bool, isActive: Bool = true, onSignIn: (() -> Void)? = nil) {
        self.chinese = chinese; self.isActive = isActive; self.onSignIn = onSignIn
        _store = State(initialValue: NativeQAStore(transport: transport))
    }
    private struct ReadIdentity: Hashable { let scope: NativeDataScope?; let visible: Bool }
    private var readIdentity: ReadIdentity { .init(scope: store.scope, visible: isActive && scenePhase == .active) }
    private var readable: Bool { readIdentity.visible && store.hasReadableProjection }
    private var presentation: NativeQAWorkPresentation { .current(store: store, chinese: chinese, visible: readIdentity.visible) }
    private func copy(_ zh: String, _ en: String) -> String { chinese ? zh : en }

    var body: some View {
        @Bindable var store = store
        ScrollViewReader { reader in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: VPSpacing.section) {
                    Text(copy("与 VisePanda 对话", "Talk with VisePanda"))
                        .font(.title2.bold()).accessibilityAddTraits(.isHeader)
                    NativeQAWorkCard(presentation: presentation, identifier: "native.qa.status",
                                     actionIdentifier: actionIdentifier,
                                     action: primaryAction(reader: reader))
                        .disabled(store.busy)
                    if readable, let pending = store.pending, store.state == .unknown {
                        VStack(alignment: .leading, spacing: VPSpacing.compact) {
                            Text(copy("正在核对的原问题", "Original question being checked")).font(.headline)
                            Text(pending.originalText ?? "").fixedSize(horizontal: false, vertical: true)
                        }.accessibilityIdentifier("native.qa.pending-question")
                    }
                    if readable, let policy = store.policy {
                        notice(policy)
                    }
                    if readable, store.state == .ready, store.policy?.consentState == .accepted, !store.sessions.isEmpty {
                        DisclosureGroup(copy("已保存的会话", "Saved conversations"), isExpanded: $sessionsExpanded) {
                            VStack(alignment: .leading, spacing: VPSpacing.standard) {
                                ForEach(store.sessions) { session in
                                    Button { Task { await store.select(session.id) } } label: {
                                        VStack(alignment: .leading, spacing: 4) {
                                            Text(session.label).fixedSize(horizontal: false, vertical: true)
                                            Text(session.updatedAt).font(.caption)
                                            if store.selectedID == session.id { Text(copy("当前会话", "Current conversation")).font(.caption) }
                                        }.frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                                    }
                                    .disabled(store.busy || store.pending != nil)
                                    .accessibilityIdentifier("native.qa.session.\(session.id)")
                                }
                                if presentation.action != .createSession {
                                    Button(copy("开始新会话", "Start a new conversation")) { Task { await store.createSession() } }
                                        .disabled(store.busy || store.pending != nil).frame(minHeight: 44)
                                        .accessibilityIdentifier("native.qa.new-session")
                                }
                            }.padding(.top, VPSpacing.standard)
                        }.id("native.qa.sessions")
                    }
                    ForEach(readable ? store.messages : []) { message in
                        VStack(alignment: .leading, spacing: VPSpacing.standard) {
                            Text(message.input).font(.body).fixedSize(horizontal: false, vertical: true)
                            NativeQAWorkCard(presentation: .messageCard(message.status, chinese: chinese),
                                             identifier: "native.qa.message-status.\(message.id)")
                            if let answer = message.text {
                                Text(answer).font(.body).fixedSize(horizontal: false, vertical: true)
                                    .accessibilityIdentifier("native.qa.answer.\(message.id)")
                            }
                        }.frame(maxWidth: .infinity, alignment: .leading)
                    }
                    if readable, store.policy?.consentState == .accepted, store.selectedID != nil,
                       store.pending == nil, store.state == .ready {
                        VStack(alignment: .leading, spacing: VPSpacing.standard) {
                            Text(copy(store.messages.isEmpty ? "你的第一个问题" : "继续同一会话", store.messages.isEmpty ? "Your first question" : "Continue this conversation"))
                                .font(.headline)
                            if let maximum = store.policy?.maxTurns {
                                Text(copy("本会话最多 \(maximum) 次提问。", "This conversation allows up to \(maximum) questions.")).font(.footnote).foregroundStyle(Color.vpSecondaryText)
                            }
                            TextField(copy("开始聊天", "Start chatting"), text: $store.draft, axis: .vertical)
                                .textFieldStyle(.roundedBorder).focused($composing).disabled(store.busy)
                                .accessibilityIdentifier("native.qa.input")
                            if store.draft.utf16.count > 4000 {
                                Text(copy("问题请控制在 4000 字以内。", "Keep the question within 4000 characters.")).font(.footnote)
                            }
                            Button(copy("发送问题", "Send question")) { Task { await store.send() } }
                                .disabled(!store.canSend).frame(minHeight: 44).accessibilityIdentifier("native.qa.send")
                        }.id("native.qa.composer")
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading).padding(VPSpacing.standard)
            }
            .background(Color.vpBackground).scrollDismissesKeyboard(.interactively)
            .accessibilityIdentifier("native.qa.service")
        }
        .task(id: readIdentity) {
            let identity = readIdentity
            await store.activate(identity.visible)
            while identity.visible, !Task.isCancelled, readIdentity == identity {
                do { try await Task.sleep(for: .seconds(3)) } catch { return }
                guard !Task.isCancelled, readIdentity == identity else { return }
                if store.shouldPoll { await store.refresh() }
            }
        }
        .onDisappear { store.invalidate() }
    }

    private var needsNoticeReview: Bool {
        if case .blocked(let code) = store.state { return ["NOTICE_CHANGED", "PENDING_NOTICE_CHANGED"].contains(code) }
        return false
    }
    @ViewBuilder private func notice(_ policy: NativeQAPolicy) -> some View {
        VStack(alignment: .leading, spacing: VPSpacing.standard) {
            if policy.consentState != .accepted || needsNoticeReview {
                Text(copy("服务说明", "Service notice")).font(.headline).accessibilityAddTraits(.isHeader)
                noticeText(policy)
            } else {
                DisclosureGroup(copy("查看服务说明", "View service notice"), isExpanded: $noticeExpanded) {
                    noticeText(policy).padding(.top, VPSpacing.standard)
                }
            }
            if presentation.action == .consent {
                Button { Task { await store.acceptConsent() } } label: {
                    Text(presentation.actionTitle).fixedSize(horizontal: false, vertical: true).frame(minHeight: 44)
                }.buttonStyle(.borderedProminent).disabled(store.busy)
                    .accessibilityIdentifier("native.qa.consent")
            }
        }
    }
    private func noticeText(_ policy: NativeQAPolicy) -> some View {
        VStack(alignment: .leading, spacing: VPSpacing.standard) {
            Text(chinese ? policy.noticeZh : policy.noticeEn).fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("native.qa.notice")
            Text(copy("服务提供方：", "Provider: ") + policy.provider + " · " + policy.recipient)
                .font(.footnote).foregroundStyle(Color.vpSecondaryText)
        }
    }
    private var actionIdentifier: String? {
        switch presentation.action {
        case .signIn: "native.qa.signin"
        case .consent: "native.qa.consent"
        case .refresh: "native.qa.refresh"
        case .createSession: "native.qa.new-session"
        case .chooseSession: "native.qa.choose-session"
        case .compose: "native.qa.continue"
        case .none: nil
        }
    }
    private func primaryAction(reader: ScrollViewProxy) -> (() -> Void)? {
        guard !store.busy else { return nil }
        switch presentation.action {
        case .none, .consent: return nil
        case .signIn: return onSignIn
        case .refresh: return { Task { await store.refresh() } }
        case .createSession: return { Task { await store.createSession() } }
        case .chooseSession: return { sessionsExpanded = true; reader.scrollTo("native.qa.sessions", anchor: .top) }
        case .compose: return { reader.scrollTo("native.qa.composer", anchor: .bottom); composing = true }
        }
    }
}
