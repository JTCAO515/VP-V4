import SwiftUI

struct NativeAskView: View {
    var isActive: Bool
    @Environment(AppSettings.self) private var settings
    @Environment(\.scenePhase) private var scenePhase
    @State private var store = NativeAskStore()
    @State private var reviewed = false
    @State private var showNotice = true
    @State private var showReviewedQuestion = false
    @FocusState private var composing: Bool
    init(store: NativeAskStore = NativeAskStore(), isActive: Bool = true) { _store = State(initialValue: store); self.isActive = isActive }

    private var session: NativeSession { settings.nativeSession }
    private var visible: Bool { isActive && !showReviewedQuestion && scenePhase == .active }
    private var groundedReadKey: String { "\(visible):\(String(describing: session.dataScope)):\(store.pollKey)" }
    private var active: Bool { session.dataScope != nil && store.scope == session.dataScope }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: VPSpacing.section) {
                BrandHeader()
                Text("ask.local.title").font(.headline).foregroundStyle(Color.vpSecondaryText)
                if !active {
                    Text("ask.local.signin")
                } else {
                    if let policy = store.policy { consent(policy) }
                    else { Text("ask.local.unavailable").accessibilityIdentifier("native-ask.unavailable") }
                    if store.hasObsoletePending {
                        Text("ask.task.uncertain").font(.footnote)
                        Button("ask.task.stop_previous") { Task { await store.stopPreviousRequest(using: session) } }
                            .disabled(store.busy).accessibilityIdentifier("native-ask.stop-previous")
                    }
                    if store.notice != nil { Text("ask.local.retry_hint").font(.footnote).accessibilityIdentifier("native-ask.error") }
                    Text("ask.local.history").font(.title2.bold())
                    TimelineView(.periodic(from: .now, by: 1)) { _ in
                        let readable = store.mode != .grounded || (visible && store.groundedCurrent)
                        // Keep the layout while evidence expires and is rechecked. Removing
                        // the entire history collapses the scroll view to its beginning.
                        VStack(alignment: .leading, spacing: VPSpacing.section) {
                            ForEach(store.turns) { turn in result(turn) }
                        }
                        .opacity(readable ? 1 : 0)
                        .accessibilityHidden(!readable)
                        .allowsHitTesting(readable)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(VPSpacing.standard)
        }
        .background(Color.vpBackground)
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom) {
            if active && store.policy?.consentState == .accepted { composer }
        }
        .overlay(alignment: .top) {
            TimelineView(.periodic(from: .now, by: 1)) { _ in
                if active && visible && store.mode == .grounded && !store.groundedCurrent && !store.turns.isEmpty {
                    // Anchor the notice to the viewport, not the beginning of a
                    // long history. Evidence remains hidden without moving it.
                    Text(settings.selectedLocale == .zh ? "正在重新核对已保存答案的依据。" : "Rechecking the evidence for saved answers.")
                        .padding(VPSpacing.standard)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.vpSurface, in: RoundedRectangle(cornerRadius: 16))
                        .padding(VPSpacing.standard)
                        .accessibilityIdentifier("grounded.rechecking")
                }
            }
            .allowsHitTesting(false)
        }
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button { showReviewedQuestion = true } label: {
                    Text(settings.selectedLocale == .zh ? "乘车证件" : "Boarding documents")
                }.accessibilityIdentifier("native-ask.reviewed-question")
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button("ask.local.reload") { Task { await store.reload(using: session) } }
                    .disabled(store.busy || session.dataScope == nil)
                    .accessibilityIdentifier("native-ask.reload")
            }
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("ask.done") { composing = false }
            }
        }
        .navigationDestination(isPresented: $showReviewedQuestion) {
            NativeKnowledgeView(isActive: isActive && showReviewedQuestion, question: true)
        }
        .vpNavigationTitle("tab.ask")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: session.dataScope) {
            guard store.mode != .grounded else { return }
            reviewed = false
            store.reset(for: session.retainedDataScope)
            if session.dataScope == nil { store.suspendReads() }
            else if !session.busy { await store.reload(using: session) }
        }
        .task(id: store.pollKey) {
            guard store.mode != .grounded else { return }
            guard !store.pollKey.isEmpty else { return }
            let initial = session.dataScope
            for _ in 0..<60 {
                do { try await Task.sleep(for: .seconds(1)) } catch { return }
                guard !Task.isCancelled, initial == session.dataScope, !store.pollKey.isEmpty else { return }
                if !store.busy { await store.reload(using: session) }
            }
        }
        .task(id: groundedReadKey) {
            guard store.mode == .grounded else { return }
            store.reset(for: session.retainedDataScope)
            guard visible, session.dataScope != nil else { store.suspendReads(); return }
            let initial = session.dataScope
            repeat {
                if !store.busy && !session.busy {
                    if store.policy != nil && store.groundedCurrent && store.hasWaitingTurn {
                        await store.receiveEvents(using: session)
                    } else { await store.reload(using: session) }
                }
                guard !Task.isCancelled, visible, session.dataScope == initial else { return }
                let delay = !store.pollKey.isEmpty || store.busy || session.busy ? 1 : store.policy == nil ? 30 : store.groundedRefreshDelay
                do { try await Task.sleep(for: .seconds(delay)) } catch { return }
            } while !Task.isCancelled && visible && session.dataScope == initial
        }
        .onChange(of: session.retainedDataScope) { _, retained in
            store.reset(for: retained)
            reviewed = false
        }
        .onChange(of: session.busy) { wasBusy, busy in
            if store.mode != .grounded && wasBusy && !busy && session.dataScope != nil {
                Task { await store.reload(using: session) }
            }
        }
        .onChange(of: store.noticeIdentity) { _, _ in reviewed = false; showNotice = true }
    }

    private func consent(_ policy: NativeTextPolicy) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            DisclosureGroup("ask.local.notice", isExpanded: $showNotice) {
                Text(settings.selectedLocale == .zh ? policy.noticeZh : policy.noticeEn)
                    .font(.body)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, 8)
                    .accessibilityIdentifier("native-ask.notice")
                Text("ask.local.recovery")
                    .font(.footnote)
                    .accessibilityIdentifier("native-ask.recovery-notice")
            }
            switch policy.consentState {
            case .notAccepted:
                Toggle("ask.local.agree", isOn: $reviewed)
                    .accessibilityIdentifier("native-ask.agree")
                Button("ask.local.accept") { Task { await store.accept(reviewed: policy, using: session) } }
                    .buttonStyle(.borderedProminent)
                    .disabled(!reviewed || store.busy)
                    .accessibilityIdentifier("native-ask.accept")
            case .accepted:
                Button("ask.local.withdraw", role: .destructive) { Task { await store.withdraw(using: session) } }
                    .disabled(store.busy)
                    .accessibilityIdentifier("native-ask.withdraw")
            case .withdrawn:
                Text("ask.local.withdrawn").accessibilityIdentifier("native-ask.withdrawn")
            }
        }
        .padding(16)
        .background(Color.vpSurface, in: RoundedRectangle(cornerRadius: 16))
    }

    private func result(_ turn: NativeTextTurn) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(turn.input).font(.headline)
            if store.mode == .grounded, let result = turn.result {
                groundedResult(turn, result)
            } else {
                Text(LocalizedStringKey(label(turn))).font(.caption.bold()).foregroundStyle(Color.vpSecondaryText)
            }
            if store.mode != .grounded, let output = turn.output {
                Text(output).textSelection(.enabled).accessibilityIdentifier("native-ask.answer.\(turn.id)")
            }
            if turn.waiting {
                Button("ask.local.cancel") { Task { await store.cancel(turn, using: session) } }
                    .disabled(store.busy)
                    .accessibilityIdentifier("native-ask.cancel.\(turn.id)")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(Color.vpSurface, in: RoundedRectangle(cornerRadius: 16))
    }

    private func interpretedQuestion(_ intent: String, chinese: Bool) -> String {
        switch intent {
        case "payment_card_acceptance": return chinese ? "识别的问题：如何核对外卡受理？" : "Interpreted question: How do I check card acceptance?"
        case "payment_mobile_setup": return chinese ? "识别的问题：如何开始使用手机商户支付？" : "Interpreted question: How do I get started with mobile merchant payments?"
        case "payment_cash_access": return chinese ? "识别的问题：如何取得人民币现金？" : "Interpreted question: How can I obtain RMB cash?"
        case "payment_card_and_mobile": return chinese ? "识别的问题：如何核对外卡受理并开始使用手机支付？" : "Interpreted question: How do I check card acceptance and get started with mobile payments?"
        case "payment_card_and_cash": return chinese ? "识别的问题：如何核对外卡受理并取得人民币现金？" : "Interpreted question: How do I check card acceptance and obtain RMB cash?"
        case "payment_mobile_and_cash": return chinese ? "识别的问题：如何开始使用手机支付并取得人民币现金？" : "Interpreted question: How do I get started with mobile payments and obtain RMB cash?"
        case "payment_getting_started": return chinese ? "识别的问题：在中国大陆旅游有哪些支付方式？" : "Interpreted question: What payment options can I use in mainland China?"
        case "connectivity_sim_documents": return chinese ? "识别的问题：办理本地SIM卡需什么证件、可去哪些运营商？" : "Interpreted question: What ID and carrier outlets are used for a local SIM application?"
        case "connectivity_plan_allowances": return chinese ? "识别的问题：选择SIM套餐时需核对哪些通话和流量额度？" : "Interpreted question: What call and data allowances should I check for a SIM plan?"
        case "connectivity_getting_started": return chinese ? "识别的问题：如何开始办理本地SIM卡并核对套餐？" : "Interpreted question: How do I get started with a local SIM and check its plan?"
        default: return chinese ? "识别的问题：乘车需要哪些证件？" : "Interpreted question: Which documents do I need to board?"
        }
    }

    @ViewBuilder private func groundedResult(_ turn: NativeTextTurn, _ result: NativeGroundedResult) -> some View {
        let chinese = turn.locale == "zh"
        if let intent = result.intent, NativeKnowledgeAnswer.definition(intent) != nil {
            Text(interpretedQuestion(intent, chinese: chinese))
                .font(.subheadline.bold()).accessibilityIdentifier("grounded.interpreted")
            Text(chinese ? "下面仅核对已保存答案原有依据，不扩展为其他问题的完整回答。" : "This rechecks the saved answer's original evidence. It is not a complete answer to other questions.").font(.caption)
            if result.requestScope == "additional_needs" {
                Text(chinese ? "你的问题还包含范围外的需求，这部分尚未回答。" : "Your question also includes needs outside this scope; those remain unanswered.")
                    .accessibilityIdentifier("grounded.additional-needs")
            }
            if let knowledge = result.knowledge {
                NativeKnowledgeCards(rows: knowledge.statements, answer: knowledge.answer, chinese: chinese)
            } else {
                Text(chinese ? "当前无法重新核对原答案，已隐藏事实内容，请稍后重试。" : "The saved evidence cannot be rechecked right now. Factual content is hidden; try again later.")
                    .accessibilityIdentifier("grounded.unavailable")
            }
        } else if result.intent == "clarification" {
            Text(chinese ? "请完整重述你想核对的问题，包括支付、SIM卡或乘车证件需求。本模式不读取上一轮内容。" : "Please restate your complete payment, SIM-card or boarding-document question. This mode does not read earlier messages.")
                .accessibilityIdentifier("grounded.clarification")
        } else if result.intent == "unsupported" {
            Text(chinese ? "这个问题超出当前支持的支付、SIM卡和乘车证件指引范围，尚未提供答案。请向相关官方渠道或服务方核对。" : "This question is outside the supported payment, SIM-card and boarding-document guidance and has not been answered. Check the relevant official or service provider guidance.")
                .accessibilityIdentifier("grounded.unsupported")
        } else {
            Text(LocalizedStringKey(label(turn))).accessibilityIdentifier("grounded.status")
        }
    }

    private var composer: some View {
        VStack(spacing: 8) {
            if store.mode.usesTask {
                HStack {
                    Text(LocalizedStringKey(store.intentLabel)).font(.caption)
                        .accessibilityIdentifier("native-ask.intent")
                    Spacer()
                    Button("ask.task.new") { store.startNewQuestion() }
                        .disabled(!store.canStartNew)
                        .accessibilityIdentifier("native-ask.new-question")
                }
            }
            if store.mode == .grounded {
                Text(settings.selectedLocale == .zh ? "当前支持：中国大陆旅游支付、SIM卡申请证件与套餐额度核对，以及成年外籍护照旅客的境内铁路乘车证件。模型只识别本次问题；费用、受理和服务可用性须向当前服务方核对。" : "Supports general mainland China payments, SIM application documents and plan-allowance checks, and domestic railway boarding documents for adult foreign-passport travellers. The model classifies only this message; confirm fees, acceptance and availability with the current service provider.")
                    .font(.caption).accessibilityIdentifier("grounded.scope")
                Picker(settings.selectedLocale == .zh ? "城市" : "City", selection: $store.city) {
                    ForEach(Array(NativeKnowledgeSelection.cities.enumerated()), id: \.element) { index, city in
                        Text(settings.selectedLocale == .zh ? ["上海", "北京", "广州", "重庆"][index] : city.capitalized).tag(city)
                    }
                }.disabled(store.pending != nil || store.busy || store.intent != .newGoal)
                    .accessibilityIdentifier("grounded.city")
            }
            TextField("ask.placeholder", text: $store.draft, axis: .vertical)
                .lineLimit(1...5).focused($composing)
                .disabled(store.busy || store.pending != nil)
                .accessibilityIdentifier("native-ask.input")
            HStack {
                Text("\(store.draft.utf16.count)/4000").font(.caption).monospacedDigit()
                Spacer()
                Button(LocalizedStringKey(store.pending == nil ? "ask.send" : "ask.local.retry_original")) {
                    composing = false
                    Task { await store.send(locale: settings.selectedLocale == .zh ? "zh" : settings.selectedLocale.rawValue, using: session) }
                }
                .buttonStyle(.borderedProminent).disabled(!store.canSend)
                .accessibilityIdentifier("native-ask.send")
            }
        }
        .padding(VPSpacing.standard)
        .background(.bar)
    }
    private func label(_ turn: NativeTextTurn) -> String {
        if turn.waiting { return "ask.local.waiting" }
        if turn.status == "cancelled" { return "ask.local.cancelled" }
        return "ask.local." + (turn.outcome?.rawValue ?? "technical_failure")
    }
}
