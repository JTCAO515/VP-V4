import SwiftUI

struct NativeAskView: View {
    var isActive: Bool
    @Environment(AppSettings.self) private var settings
    @Environment(\.scenePhase) private var scenePhase
    @State private var store = NativeAskStore()
    @State private var reviewed = false
    @State private var showNotice = true
    @State private var showReviewedQuestion = false
    @State private var planningRequest: String?
    @FocusState private var composing: Bool
    init(store: NativeAskStore = NativeAskStore(), isActive: Bool = true) { _store = State(initialValue: store); self.isActive = isActive }

    private var session: NativeSession { settings.nativeSession }
    private var visible: Bool { isActive && !showReviewedQuestion && planningRequest == nil && scenePhase == .active }
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
        .sheet(isPresented: Binding(get: { planningRequest != nil }, set: { if !$0 { planningRequest = nil } })) {
            if let planningRequest {
                NativePlanningSheet(request: planningRequest)
            }
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
            guard visible, session.dataScope != nil else {
                // The planning sheet only covers this same-account conversation.
                // Keep its hidden layout/unsent input so returning retains the
                // anchor. The existing deadline still expires; owner/auth changes
                // and other navigation retain the normal destructive read reset.
                if planningRequest == nil || session.dataScope == nil { store.suspendReads() }
                return
            }
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
            planningRequest = nil
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
        case "place_address": return chinese ? "识别的问题：所问景点的地址在哪里？" : "Interpreted question: What is the named attraction's address?"
        case "place_opening_hours": return chinese ? "识别的问题：所问景点今天何时开放？" : "Interpreted question: What are the named attraction's opening hours today?"
        case "place_address_and_hours": return chinese ? "识别的问题：所问景点的地址和今天开放时间是什么？" : "Interpreted question: What are the named attraction's address and today's opening hours?"
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
        if let intent = result.intent, NativeKnowledgeAnswer.definition(intent, subjectId: result.placeSubjectId) != nil {
            if let placeName = result.placeName { Text(verbatim: placeName).font(.subheadline.bold()) }
            Text(interpretedQuestion(intent, chinese: chinese))
                .font(.subheadline.bold()).accessibilityIdentifier("grounded.interpreted")
            Text(chinese ? "下面仅核对已保存答案原有依据，不扩展为其他问题的完整回答。" : "This rechecks the saved answer's original evidence. It is not a complete answer to other questions.").font(.caption)
            if result.requestScope == "additional_needs" {
                VStack(alignment: .leading, spacing: 6) {
                    Text(chinese ? "当前已审核指引尚未回答以下需求，请向相关官方渠道或服务方核对。" : "The current reviewed guidance does not cover these needs. Check them with the relevant official or service provider.")
                    if let needs = result.unansweredNeeds, !needs.isEmpty {
                        ForEach(needs, id: \.self) { need in Text(verbatim: "“\(need)”") }
                    } else {
                        Text(chinese ? "此历史答案未记录具体的未回答问题。" : "This older answer did not record the specific unanswered questions.")
                    }
                }.accessibilityIdentifier("grounded.additional-needs")
            }
            if let knowledge = result.knowledge {
                NativeKnowledgeCards(rows: knowledge.statements, answer: knowledge.answer, chinese: chinese)
            } else {
                Text(chinese ? "当前无法重新核对原答案，已隐藏事实内容，请稍后重试。" : "The saved evidence cannot be rechecked right now. Factual content is hidden; try again later.")
                    .accessibilityIdentifier("grounded.unavailable")
            }
            if result.originalOutcome == "blocked" { aiAssistPanel(turn, chinese: chinese) }
        } else if result.placeResolution == "ambiguous" {
            Text(chinese ? "这个名称匹配到多个已审核景点。请提供完整官方名称，并核对所选城市；本模式不读取上一轮内容。" : "More than one reviewed attraction matches this name. Please provide its full official name and check the selected city; this mode does not read earlier messages.")
                .accessibilityIdentifier("grounded.place-ambiguous")
        } else if result.placeResolution == "unavailable" {
            Text(chinese ? "在所选城市的当前已审核信息中，尚未匹配到这个景点名称。请核对完整名称、城市及场馆官方信息。" : "This name could not be matched to current reviewed attraction information in the selected city. Check its full name, city and the venue's official information.")
                .accessibilityIdentifier("grounded.place-unavailable")
        } else if result.intent == "clarification" {
            Text(chinese ? "请完整重述你想核对的问题，包括具体景点名称和城市，或支付、SIM卡、乘车证件需求。本模式不读取上一轮内容。" : "Please restate your complete question, including an attraction name and city or your payment, SIM-card or boarding-document need. This mode does not read earlier messages.")
                .accessibilityIdentifier("grounded.clarification")
        } else if result.intent == "unsupported" {
            Text(chinese ? "这个问题超出当前支持的景点地址与今日开放时间、支付、SIM卡和乘车证件指引范围，尚未提供答案。请向相关官方渠道或服务方核对。" : "This question is outside the supported attraction-address/today-hours, payment, SIM-card and boarding-document guidance and has not been answered. Check the relevant official or service provider guidance.")
                .accessibilityIdentifier("grounded.unsupported")
        } else {
            Text(LocalizedStringKey(label(turn))).accessibilityIdentifier("grounded.status")
        }
    }

    /// VPJ-76 (#360) slice 9: offered only under a turn the reviewed resolver
    /// itself judged 'blocked' -- see NativeAskStore.runAiAssist. The result
    /// is always labeled "AI-generated, not reviewed", visually and
    /// textually distinct from the reviewed cards above it, mirroring the
    /// Web counterpart (components/chat/SavedAnswers.tsx, slice 8).
    @ViewBuilder private func aiAssistPanel(_ turn: NativeTextTurn, chinese: Bool) -> some View {
        switch store.aiAssist[turn.id] {
        case nil:
            Button(chinese ? "用 AI 深度搜索（未经审核）" : "Search further with AI (unreviewed)") {
                Task { await store.runAiAssist(turn.id, using: session) }
            }.accessibilityIdentifier("grounded.ai-assist.start.\(turn.id)")
        case .loading:
            Text(chinese ? "正在深入搜索…" : "Searching further…").accessibilityIdentifier("grounded.ai-assist.loading.\(turn.id)")
        case .error:
            HStack {
                Text(chinese ? "AI 搜索暂时不可用。" : "AI search is unavailable right now.")
                Button(chinese ? "重试" : "Try again") { Task { await store.runAiAssist(turn.id, using: session) } }
                    .accessibilityIdentifier("grounded.ai-assist.retry.\(turn.id)")
            }.accessibilityIdentifier("grounded.ai-assist.error.\(turn.id)")
        case .done(let reply):
            aiAssistResult(turn, reply, chinese: chinese)
        }
    }

    @ViewBuilder private func aiAssistResult(_ turn: NativeTextTurn, _ reply: NativeAiAssistStatus, chinese: Bool) -> some View {
        switch reply.status {
        case "not_offered":
            Text(chinese ? "此问题暂不支持 AI 搜索。" : "AI search is not available for this question.")
                .accessibilityIdentifier("grounded.ai-assist.not-offered.\(turn.id)")
        case "cancelled":
            Text(chinese ? "AI 搜索已取消。" : "AI search was cancelled.").accessibilityIdentifier("grounded.ai-assist.cancelled.\(turn.id)")
        case "failed":
            HStack {
                Text(chinese ? "AI 搜索暂时不可用。" : "AI search is unavailable right now.")
                Button(chinese ? "重试" : "Try again") { Task { await store.runAiAssist(turn.id, using: session) } }
                    .accessibilityIdentifier("grounded.ai-assist.retry.\(turn.id)")
            }.accessibilityIdentifier("grounded.ai-assist.failed.\(turn.id)")
        default:
            if let outcome = reply.outcome {
                switch outcome.kind {
                case "budget_exhausted":
                    Text(chinese ? "AI 搜索未能在限定轮次内找到明确答案。" : "AI search ran out of time without finding a clear answer.")
                        .accessibilityIdentifier("grounded.ai-assist.budget-exhausted.\(turn.id)")
                case "cancelled":
                    Text(chinese ? "AI 搜索已取消。" : "AI search was cancelled.").accessibilityIdentifier("grounded.ai-assist.cancelled.\(turn.id)")
                case "unavailable":
                    Text(reasonCopy(outcome.reason, chinese: chinese)).accessibilityIdentifier("grounded.ai-assist.unavailable.\(turn.id)")
                default:
                    VStack(alignment: .leading, spacing: 6) {
                        Text(outcome.summary ?? "").textSelection(.enabled)
                        if let gaps = outcome.gaps, !gaps.isEmpty {
                            Text(chinese ? "本次搜索未涵盖" : "Not covered by this search").font(.caption.bold())
                            ForEach(gaps, id: \.self) { gap in Text(verbatim: gap).font(.caption) }
                        }
                        if let conflicts = outcome.conflicts, !conflicts.isEmpty {
                            Text(chinese ? "搜索结果存在分歧" : "Search results disagreed").font(.caption.bold())
                            ForEach(conflicts, id: \.self) { conflict in Text(verbatim: conflict).font(.caption) }
                        }
                        Text(chinese ? "此内容由 AI 从已发布指引中检索生成，未经过人工审核，请在使用前自行核实。" : "AI-generated from published guidance, not reviewed like the answer above. Verify before relying on it.")
                            .font(.caption).foregroundStyle(Color.vpSecondaryText)
                    }
                    .padding(12)
                    .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.vpSecondaryText.opacity(0.4), style: StrokeStyle(lineWidth: 1, dash: [4])))
                    .accessibilityIdentifier("grounded.ai-assist.answered.\(turn.id)")
                }
            }
        }
    }

    private func reasonCopy(_ reason: String?, chinese: Bool) -> String {
        switch reason {
        case "missing_content": return chinese ? "目前还没有相关的已发布指引。" : "No published guidance exists yet for this topic."
        case "retrieval_miss": return chinese ? "AI 搜索未在已发布指引中找到相关内容。" : "The AI search did not find anything relevant in published guidance."
        case "user_input_missing": return chinese ? "需要更多信息才能进行 AI 搜索，请在 App 中继续这个问题。" : "More detail is needed before an AI search can run. Continue this question in the app."
        case "capability_unsupported": return chinese ? "AI 搜索暂不支持这类问题。" : "AI search does not cover this kind of question yet."
        case "policy_denied": return chinese ? "此问题暂不支持 AI 搜索。" : "AI search is not available for this question."
        case "provider_failure": return chinese ? "AI 搜索目前无法完成。" : "AI search could not complete right now."
        default: return chinese ? "AI 搜索暂时不可用。" : "AI search is unavailable right now."
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
                Text(settings.selectedLocale == .zh ? "当前支持：指定城市中具名景点的已审核地址与今日开放时间、中国大陆旅游支付、SIM卡申请证件与套餐额度核对，以及成年外籍护照旅客的境内铁路乘车证件。模型只识别本次问题；费用、受理和服务可用性须向当前服务方核对。" : "Supports reviewed addresses and today’s opening hours for named attractions in the selected city, general mainland China payments, SIM application documents and plan-allowance checks, and domestic railway boarding documents for adult foreign-passport travellers. The model classifies only this message; confirm fees, acceptance and availability with the current service provider.")
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
            if NativeRelativeOutline.make(from: store.draft, chinese: settings.selectedLocale == .zh) != nil {
                Button(settings.selectedLocale == .zh ? "用本次输入开始规划" : "Plan from this message") {
                    composing = false
                    planningRequest = store.draft
                }
                .disabled(store.busy || store.pending != nil || store.intent != .newGoal)
                .accessibilityIdentifier("native-ask.plan")
                Text(settings.selectedLocale == .zh ? "打开本机相对日草稿；不会发送此消息。" : "Open a local relative-day outline without sending this message.")
                    .font(.caption)
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
