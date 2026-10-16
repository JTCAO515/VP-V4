import SwiftUI

struct NativeQAServiceView: View {
    let chinese: Bool
    var isActive: Bool
    var onSignIn: (() -> Void)?
    @Environment(\.scenePhase) private var scenePhase
    @State private var store: NativeQAStore
    @State private var noticeExpanded = false
    @State private var historyPresented = false
    @State private var historyScope: NativeDataScope?

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
                    if readable, store.policy?.consentState == .accepted {
                        Button(action: openHistory) {
                            Label(copy("会话历史", "Conversation history"), systemImage: "clock.arrow.circlepath")
                                .frame(minHeight: 44)
                        }
                        .disabled(store.busy)
                        .accessibilityIdentifier("native.qa.history.open")
                    }
                    if readable, let expectedScope = store.scope, let expectedSession = store.selectedID {
                        ForEach(store.messages) { message in
                            NativeQAMessageCard(message: message, expectedSessionID: expectedSession,
                                                isCurrent: { payloadCurrent(scope: expectedScope, session: expectedSession) },
                                                chinese: chinese)
                        }
                    }
                    Color.clear.frame(height: 1).id("native.qa.end")
                }
                .frame(maxWidth: .infinity, alignment: .leading).padding(VPSpacing.standard)
            }
            .background(Color.vpBackground).scrollDismissesKeyboard(.interactively)
            .accessibilityIdentifier("native.qa.service")
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if readable, store.policy?.consentState == .accepted,
                   let expectedScope = store.scope, let expectedSession = store.selectedID {
                    NativeQAComposer(draft: $store.draft, canSend: store.canSend, isBusy: store.busy,
                                     hasUnconfirmedRequest: hasUnconfirmedRequest, chinese: chinese,
                                     isCurrent: { payloadCurrent(scope: expectedScope, session: expectedSession) },
                                     onSend: { completion in Task { @MainActor in
                                         defer { completion() }
                                         guard payloadCurrent(scope: expectedScope, session: expectedSession) else { return }
                                         await store.send()
                                     } })
                        .id(NativeQAComposerIdentity(scope: expectedScope, session: expectedSession))
                        .accessibilityIdentifier("native.qa.composer")
                }
            }
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
        .sheet(isPresented: $historyPresented) {
            NavigationStack {
                NativeQAHistoryView(source: historySource, chinese: chinese)
                    .toolbar { ToolbarItem(placement: .confirmationAction) {
                        Button(copy("完成", "Done")) { historyPresented = false }
                    } }
            }
        }
        .onChange(of: readIdentity) { _, _ in historyPresented = false; historyScope = nil }
        .onDisappear { historyPresented = false; historyScope = nil; store.invalidate() }
    }

    private struct NativeQAComposerIdentity: Hashable { let scope: NativeDataScope; let session: String }
    private var hasUnconfirmedRequest: Bool {
        store.pending != nil || store.state == .pending || store.state == .unknown || store.messages.contains { $0.status.waiting }
    }
    private func payloadCurrent(scope: NativeDataScope, session: String) -> Bool {
        readable && store.scope == scope && store.selectedID == session && store.policy?.consentState == .accepted
    }
    private func openHistory() {
        guard readable, !store.busy, store.policy?.consentState == .accepted, let scope = store.scope else { return }
        historyScope = scope
        historyPresented = true
    }
    private var historySource: NativeQAHistorySource {
        .init(currentScope: { readable ? store.scope : nil }, expectedScope: { historyScope }, read: {
            guard readable, let scope = store.scope, scope == historyScope, store.policy?.consentState == .accepted else { return nil }
            return .init(scope: scope, sessions: store.sessions, selectedID: store.selectedID,
                         isLoading: store.busy, canSelect: !store.busy && !hasUnconfirmedRequest,
                         canCreate: !store.busy && !hasUnconfirmedRequest)
        }, onSelect: { id in
            let expectedScope = historyScope
            historyPresented = false
            Task {
                guard readable, let expectedScope, store.scope == expectedScope,
                      store.policy?.consentState == .accepted, !hasUnconfirmedRequest else { return }
                await store.select(id)
            }
        }, onCreate: {
            let expectedScope = historyScope
            historyPresented = false
            Task {
                guard readable, let expectedScope, store.scope == expectedScope,
                      store.policy?.consentState == .accepted, !hasUnconfirmedRequest else { return }
                await store.createSession()
            }
        })
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
        case .chooseSession: return openHistory
        case .compose: return { reader.scrollTo("native.qa.end", anchor: .bottom) }
        }
    }
}
