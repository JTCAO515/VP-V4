import SwiftUI

struct NativeTravelIntakeView: View {
    var injected: NativeTravelIntakeInjectedTransport? = nil
    var currentSelection: (() -> NativeTravelIntakeSelection?)? = nil
    let selection: NativeTravelIntakeSelection?
    let session: NativeSession
    let chinese: Bool
    let accepted: () async -> Void
    let reviewGoal: () async -> NativeTravelIntakeSelection?
    var onInvalidation: () -> Void = {}
    @State private var store = NativeTravelIntakeStore()
    @State private var city = ""
    @State private var target = ""
    @State private var days = ""
    @State private var party = ""
    @State private var pace = ""
    @State private var interests: [String]?
    @State private var currency = "CNY"
    @State private var budget = ""
    @State private var start = ""
    @State private var end = ""
    @State private var mobility = ""
    @State private var mobilityKnown = false
    @State private var loadedMobility: [String]?
    @State private var confirmation = false
    @State private var preserveDraft = false
    @State private var editingTarget: NativeTravelIntakeSelection?
    private func t(_ zh: String, _ en: String) -> String { chinese ? zh : en }
    private var qualified: NativeTravelIntakeSelection? {
        let target = currentSelection.map { $0() } ?? selection
        guard let target else { return nil }
        if let injected, injected.allowed { return target }
        guard session.dataScope == target.scope else { return nil }
        return target
    }
    private var projection: NativeTravelIntake? {
        func number(_ s: String, range: ClosedRange<Int>) -> Int? { guard let n = Int(s), range.contains(n) else { return nil }; return n }
        if !days.isEmpty && number(days, range: 1...30) == nil { return nil }
        if !party.isEmpty && number(party, range: 1...10) == nil { return nil }
        if !budget.isEmpty && NativeTravelBudgetAmount.minorUnits(budget) == nil { return nil }
        if start.isEmpty != end.isEmpty { return nil }
        let value = NativeTravelIntake(city: city.isEmpty ? nil : city, comparisonTarget: target.isEmpty ? nil : target,
            durationDays: Int(days), partySize: Int(party), interests: interests, pace: pace.isEmpty ? nil : pace,
            lodgingBudget: budget.isEmpty ? nil : .init(currency: currency, perNightMinorUnits: NativeTravelBudgetAmount.minorUnits(budget)!),
            dates: start.isEmpty ? nil : .init(startDate: start, endDate: end),
            mobilityConstraints: mobilityKnown ? (mobility == loadedMobility?.joined(separator: "\n") ? loadedMobility : mobility.split(separator: "\n").map(String.init)) : nil)
        return value.valid ? value : nil
    }
    var body: some View {
        Form {
            Section {
                Text(t("这里只提交你明确填写、核对的当前需求，不会从自由文本自动提取。留空表示未知。", "Only the fields you enter and confirm are submitted. Free text is not automatically interpreted. Blank means unknown."))
                Text(t("提交不会保存 Memory、写入行程或启动规划。", "Submitting does not save Memory, change a Trip, or start planning."))
            }
            if let basis = store.basis {
                Section(t("当前状态", "Current status")) {
                    Text(readiness(basis)).accessibilityIdentifier("assistant.intake.status")
                    if let unknown = basis.readiness.unknown, !unknown.isEmpty {
                        Text(t("仍未知：", "Still unknown: ") + unknown.map(fieldLabel).joined(separator: ", "))
                    }
                    if let questions = basis.readiness.questions {
                        Text(t("请补充：", "Please provide: ") + questions.map(fieldLabel).joined(separator: ", "))
                    }
                    Text(t("输入版本 \(basis.intakeRevision) · 目标版本 \(basis.goalVersion)", "Input revision \(basis.intakeRevision) · Goal version \(basis.goalVersion)"))
                    Text(t("尚未开始规划或后台处理。", "Planning and background processing have not started."))
                }
            }
            if store.state == .readOnly {
                Section(t("已达上限 · 只读", "Limit reached · Read only")) {
                    Text(limitMessage).accessibilityIdentifier("assistant.intake.limit")
                    if let basis = store.basis { Text(summary(basis.intake)).textSelection(.enabled) }
                    else { Text(t("没有可读取的当前需求。本地草稿没有提交资格。", "No qualified current requirements are readable. The local draft cannot be submitted.")) }
                }
            } else if store.state == .current || store.state == .needsReview || store.state == .submitting || preserveDraft {
                if store.writeBasis != nil {
                    Text(t("仅取得当前纠正版本。请逐项重新确认完整需求；旧 Memory 选择已清空，不会自动恢复。", "Only correction versions were read. Recheck every requirement; prior Memory references were cleared and will not be restored automatically.")).accessibilityIdentifier("assistant.intake.correction.notice")
                }
                Section(t("当前旅行需求", "Current travel requirements")) {
                    HStack {
                        TextField(t("城市（未知可留空）", "City (blank if unknown)"), text: $city)
                            .autocorrectionDisabled().textInputAutocapitalization(.never).accessibilityIdentifier("assistant.intake.city")
                        Button(t("设为未知", "Set unknown")) { city = "" }.buttonStyle(.borderless)
                            .accessibilityIdentifier("assistant.intake.city.clear")
                    }
                    Text(t("当前交通范围仅支持明确填写 shanghai（上海）；其他城市会保留并显示不支持。", "Transport coverage currently requires explicitly entering shanghai. Other cities are retained and shown as unsupported."))
                        .font(.footnote)
                    Picker(t("比较目的", "Comparison purpose"), selection: $target) {
                        Text(t("未知", "Unknown")).tag("")
                        Text(t("住宿区域与交通", "Stay areas and transport")).tag("area_transport")
                        Text(t("按住宿预算筛选", "Filter by lodging budget")).tag("lodging_budget_filter")
                    }.accessibilityIdentifier("assistant.intake.target")
                    TextField(t("旅行天数 1–30", "Duration in days, 1–30"), text: $days).keyboardType(.numberPad).accessibilityIdentifier("assistant.intake.days")
                    TextField(t("人数 1–10", "Party size, 1–10"), text: $party).keyboardType(.numberPad).accessibilityIdentifier("assistant.intake.party")
                    Picker(t("旅行节奏", "Travel pace"), selection: $pace) {
                        Text(t("未知", "Unknown")).tag("")
                        Text(t("悠闲", "Relaxed")).tag("relaxed")
                        Text(t("均衡", "Balanced")).tag("balanced")
                        Text(t("紧凑", "Fast")).tag("fast")
                    }
                }
                Section(t("兴趣优先级", "Interest priorities")) {
                    Toggle(t("已明确兴趣（可不选任何项）", "Interests are known (none is allowed)"), isOn: Binding(get: { interests != nil }, set: { interests = $0 ? [] : nil }))
                    if interests != nil {
                        ForEach(["food", "photography", "culture", "nature"], id: \.self) { item in
                            Toggle(interestLabel(item), isOn: Binding(get: { interests?.contains(item) == true }, set: { chosen in
                                if chosen { if interests?.contains(item) == false { interests?.append(item) } }
                                else { interests?.removeAll { $0 == item } }
                            }))
                        }
                    }
                }
                Section(t("可选条件（未知不阻止交通范围评估）", "Optional conditions (unknown does not block transport screening)")) {
                    Picker(t("预算币种", "Budget currency"), selection: $currency) { ForEach(["CNY", "USD", "EUR", "GBP"], id: \.self) { Text($0).tag($0) } }
                    HStack {
                        TextField(t("每晚预算（\(currency)）", "Nightly budget (\(currency))"), text: $budget)
                            .keyboardType(.decimalPad).accessibilityIdentifier("assistant.intake.budget")
                        Button(t("设为未知", "Set unknown")) { budget = "" }.buttonStyle(.borderless)
                            .accessibilityIdentifier("assistant.intake.budget.clear")
                    }
                    Text(t("金额最多两位小数，留空表示未知。预算不是已验证的房价或库存。", "Use at most two decimal places; blank means unknown. Your budget is not verified hotel pricing or availability."))
                        .font(.footnote)
                    TextField(t("开始日期 YYYY-MM-DD", "Start date YYYY-MM-DD"), text: $start).accessibilityIdentifier("assistant.intake.start")
                    TextField(t("结束日期 YYYY-MM-DD", "End date YYYY-MM-DD"), text: $end).accessibilityIdentifier("assistant.intake.end")
                    Toggle(t("已明确行动限制（可为空）", "Mobility constraints are known (none is allowed)"), isOn: $mobilityKnown)
                    if mobilityKnown { TextField(t("每行一个限制，最多 6 条", "One constraint per line, up to 6"), text: $mobility, axis: .vertical).accessibilityIdentifier("assistant.intake.mobility") }
                    Text(t("输入限制不代表现有路线证据已验证满足。", "Entered constraints do not mean available route evidence verifies them."))
                }
                if store.state == .needsReview || (preserveDraft && store.state == .unavailable) {
                    Section {
                        Text(t("提交未获得当前有效状态。草稿已保留，请重新读取并核对，不会自动合并或重试写入。", "No current qualified state was obtained. Your draft is retained. Read and review again; no automatic merge or write retry."))
                        Button(t("重新核对目标并读取（保留草稿）", "Recheck goal and read (keep draft)")) {
                            Task { await reviewWriteBasis() }
                        }
                    }
                }
                Button(t("查看并确认完整需求", "Review and confirm all requirements")) {
                    guard let value = projection else { return }; store.draft = value; confirmation = true
                }.disabled(projection == nil || !store.canSubmit || qualified == nil)
                    .accessibilityIdentifier("assistant.intake.review")
                if projection == nil { Text(t("请核对数字范围、日期和字段长度；无效输入不会提交。", "Check number ranges, dates, and text lengths. Invalid values cannot be submitted.")) }
            } else if store.state == .loading { ProgressView() }
            else {
                Text(t("尚无可编辑的当前旅行需求。先选择或建立当前目标，再读取需求；过期或未记录的输入需重新明确确认。", "No editable current travel requirements are available. Select or create a current goal, then read its requirements. Stale or unrecorded input needs explicit confirmation again."))
                if ["intake_unrecorded", "stale_basis"].contains(store.unavailableReason ?? "") {
                    Button(t("重新核对当前目标并填写需求", "Recheck the current goal and enter requirements")) {
                        Task {
                            guard let reviewed = await reviewGoal(), reviewed == qualified else { return }
                            await store.reviewForCorrection(request: { try await writeMetadata($0, $1) }, current: { qualified })
                        }
                    }.disabled(qualified == nil)
                }
                Button(t("读取当前需求", "Read current requirements")) { Task { await load() } }.disabled(qualified == nil)
            }
        }
        .toolbar { ToolbarItem(placement: .topBarLeading) {
            Button(t("刷新资格", "Refresh access")) {
                preserveDraft = true
                Task { await load() }
            }.disabled(store.state == .submitting || qualified == nil).accessibilityIdentifier("assistant.intake.refresh")
        } }
        .scrollDismissesKeyboard(.interactively)
        .toolbar { ToolbarItemGroup(placement: .keyboard) { Spacer(); Button(t("收起键盘", "Hide keyboard")) { hideKeyboard() } } }
        .disabled(store.state == .submitting)
        .sheet(isPresented: $confirmation) {
            NavigationStack {
                Form {
                    Text(t("核对以下完整内容，留空字段将明确提交为未知。", "Review the complete contents below. Blank fields are explicitly submitted as unknown."))
                    Text(reviewSummary).textSelection(.enabled)
                    Button(t("明确提交当前需求", "Submit these explicit requirements")) {
                        confirmation = false
                        store.submit(locale: chinese ? "zh" : "en", current: { qualified },
                            post: { try await post($0) },
                            read: { try await read($0, $1) }, accepted: accepted)
                    }.accessibilityIdentifier("assistant.intake.submit")
                }.navigationTitle(t("确认当前需求", "Confirm requirements"))
                    .toolbar { Button(t("返回修改", "Back to edit")) { confirmation = false } }
            }
        }
        .task(id: qualified) {
            if editingTarget?.scope != qualified?.scope || editingTarget?.conversationID != qualified?.conversationID
                || editingTarget?.goalID != qualified?.goalID || editingTarget?.policyID != qualified?.policyID { discardEditor() }
            editingTarget = qualified; store.bind(qualified)
            if qualified != nil { await load() }
        }
        .onChange(of: store.state) { _, state in if state == .needsReview { preserveDraft = true } }
        .onChange(of: qualified) { _, value in store.bind(value); if value == nil { confirmation = false } }
        .onChange(of: store.selection) { _, value in
            if value == nil { discardEditor(); if store.state == .unavailable { onInvalidation() } }
        }
        .onDisappear { store.invalidate(); discardEditor() }
    }
    private func reviewWriteBasis() async {
        preserveDraft = true
        guard let reviewed = await reviewGoal(), reviewed == qualified else { return }
        store.bind(reviewed)
        await store.reviewForCorrection(request: { try await writeMetadata($0, $1) }, current: { qualified })
    }
    private func writeMetadata(_ conversation: String, _ goal: String) async throws -> Data {
        if let injected, injected.allowed { return try await injected.writeBasis() }
        return try await session.travelIntakeWriteBasisRequest(conversationID: conversation, goalID: goal)
    }
    private func hideKeyboard() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }
    private func read(_ conversation: String, _ goal: String) async throws -> Data {
        if let injected, injected.allowed { return try await injected.read() }
        return try await session.travelIntakeRequest(conversationID: conversation, goalID: goal)
    }
    private func post(_ body: Data) async throws -> Data {
        if let injected, injected.allowed { return try await injected.post(body) }
        return try await session.submitTravelIntakeRequest(body)
    }
    private func discardEditor() {
        city = ""; target = ""; days = ""; party = ""; pace = ""; interests = nil
        budget = ""; start = ""; end = ""; mobility = ""; mobilityKnown = false; loadedMobility = nil; confirmation = false; preserveDraft = false
    }
    private func load() async {
        await store.load(request: { try await read($0, $1) }, current: { qualified })
        guard !preserveDraft, let v = store.basis?.intake else { return }
        city = v.city ?? ""; target = v.comparisonTarget ?? ""; days = v.durationDays.map(String.init) ?? ""
        party = v.partySize.map(String.init) ?? ""; interests = v.interests; pace = v.pace ?? ""
        currency = v.lodgingBudget?.currency ?? "CNY"; budget = v.lodgingBudget.flatMap { NativeTravelBudgetAmount.display($0.perNightMinorUnits) } ?? ""
        start = v.dates?.startDate ?? ""; end = v.dates?.endDate ?? ""
        loadedMobility = v.mobilityConstraints; mobilityKnown = v.mobilityConstraints != nil; mobility = v.mobilityConstraints?.joined(separator: "\n") ?? ""
    }
    private var limitMessage: String {
        switch store.readOnlyReason {
        case .goalVersion: return t("目标版本已达上限（10000）。当前需求可查看，不能继续提交更正。", "Goal version limit (10000) reached. Current requirements remain readable; further corrections are unavailable.")
        case .intakeRevision: return t("需求修订已达上限（1000）。不能继续提交更正。", "Input revision limit (1000) reached. Further corrections are unavailable.")
        case .messageSequence: return t("来源消息序号已达上限（1000000）。不能继续提交更正。", "Source message limit (1000000) reached. Further corrections are unavailable.")
        case nil: return t("当前需求仅供查看。", "Current requirements are read only.")
        }
    }
    private var reviewSummary: String { projection.map(summary) ?? "" }
    private func summary(_ value: NativeTravelIntake) -> String {
        let unknown = t("未知", "Unknown"), none = t("明确无", "Explicitly none")
        return [t("城市", "City") + ": " + (value.city ?? unknown), t("目的", "Purpose") + ": " + purposeLabel(value.comparisonTarget ?? ""),
            t("天数", "Days") + ": " + (value.durationDays.map(String.init) ?? unknown), t("人数", "Party") + ": " + (value.partySize.map(String.init) ?? unknown),
            t("兴趣", "Interests") + ": " + (value.interests.map { $0.isEmpty ? none : $0.map(interestLabel).joined(separator: ", ") } ?? unknown),
            t("节奏", "Pace") + ": " + paceLabel(value.pace ?? ""), t("预算", "Budget") + ": " + (value.lodgingBudget.map { $0.currency + " " + (NativeTravelBudgetAmount.display($0.perNightMinorUnits) ?? "") + t(" /晚", " /night") } ?? unknown),
            t("日期", "Dates") + ": " + (value.dates.map { $0.startDate + " – " + $0.endDate } ?? unknown),
            t("行动限制", "Mobility") + ": " + (value.mobilityConstraints.map { $0.isEmpty ? none : $0.joined(separator: "\n") } ?? unknown)].joined(separator: "\n")
    }
    private func purposeLabel(_ s: String) -> String { s == "area_transport" ? t("区域与交通", "Areas and transport") : s == "lodging_budget_filter" ? t("预算筛选", "Budget filter") : t("未知", "Unknown") }
    private func interestLabel(_ s: String) -> String {
        switch s { case "food": return t("美食", "Food"); case "photography": return t("摄影", "Photography"); case "culture": return t("文化", "Culture"); default: return t("自然", "Nature") }
    }
    private func paceLabel(_ s: String) -> String {
        switch s { case "relaxed": return t("悠闲", "Relaxed"); case "balanced": return t("均衡", "Balanced"); case "fast": return t("紧凑", "Fast"); default: return t("未知", "Unknown") }
    }
    private func fieldLabel(_ s: String) -> String {
        switch s {
        case "city": return t("城市", "City")
        case "comparisonTarget", "comparison_target": return t("比较目的", "Comparison purpose")
        case "durationDays": return t("旅行天数", "Duration")
        case "partySize": return t("人数", "Party size")
        case "interests": return t("兴趣", "Interests")
        case "pace": return t("节奏", "Pace")
        case "lodgingBudget", "lodging_budget": return t("住宿预算", "Lodging budget")
        case "dates": return t("日期", "Dates")
        default: return t("行动限制", "Mobility constraints")
        }
    }
    private func readiness(_ b: NativeTravelIntakeBasis) -> String {
        switch b.readiness.kind {
        case "ready": return t("当前输入满足交通范围评估条件；住宿预算、日期或其他未知项仍未验证。", "Current input meets transport screening requirements; unknown budget, dates, or other conditions remain unverified.")
        case "waiting_user": return t("等待你补充必要信息。", "Waiting for required information from you.")
        default: return b.readiness.reason == "city_not_covered" ? t("当前城市尚不支持；不会改用上海。", "This city is not covered; Shanghai will not be substituted.") : t("住宿价格与库存筛选尚未接入。", "Lodging price and inventory filtering is not integrated.")
        }
    }
}
