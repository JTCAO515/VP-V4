import SwiftUI

struct NativeTranslationView: View {
    var initialTripID: String? = nil
    var initialTripScope: NativeDataScope? = nil
    var initialTripVersion: Int? = nil
    @Environment(AppSettings.self) private var settings
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.dismiss) private var dismiss
    @State private var store = NativeTranslationStore()
    @FocusState private var inputFocused: Bool
    @State private var source = "en"
    @State private var input = ""
    @State private var card: NativeTranslationPhrase?
    @State private var savedHistory = NativeSavedTranslationHistoryStore()
    @State private var savedDetail = NativeSavedTranslationHistoryStore()
    @State private var savedCard: NativeSavedTranslationReference?
    @State private var savedQuery = ""
    @State private var action: Task<Void, Never>?
    @State private var historyAction: Task<Void, Never>?
    @State private var tripStore = NativeTranslationTripStore()
    @State private var tripSelection: NativeTranslationTripSelection?
    @State private var tripReturn: TranslationTripReturn?
    @State private var tripChanged = false
    @State private var confirmLocalAbandon = false
    @State private var reviewedAbandonRecord: NativeTranslationRecoveryRecord?
    private var session: NativeSession { settings.nativeSession }
    private var activeScope: NativeDataScope? { scenePhase == .active ? session.dataScope : nil }
    private func text(_ en: String, _ zh: String) -> String { settings.selectedLocale == .zh ? zh : en }
    private func request(_ path: String, _ method: String, _ body: Data?) async throws -> Data {
        try Task.checkCancellation()
        guard let initial = activeScope else { throw NativeDataError.sessionUnavailable }
        let data = try await session.translateRequest(path: path, method: method, body: body)
        try Task.checkCancellation()
        guard activeScope == initial else { throw NativeDataError.staleSessionResponse }
        return data
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text(text("Say it clearly", "现场表达")).font(.largeTitle.bold())
                Text(text("Type a short phrase or paste an address you chose. The original stays with your translation.", "输入短句或粘贴你选择的地址，译文始终保留原文。"))
                NavigationLink {
                    NativeVoiceTranslationView()
                } label: {
                    Label(text("Hold to speak and translate", "按住说话并翻译"), systemImage: "mic")
                }.accessibilityIdentifier("translation.voice.entry")
                if session.dataScope == nil {
                    Text(text("Sign in in Profile to translate.", "请在「我的」登录后翻译。"))
                }
                policyView
                if activeScope != nil, store.scope == activeScope { recoveryView }
                tripSourceView
                Picker(text("Translate", "翻译方向"), selection: $source) {
                    Text("English → 中文").tag("en")
                    Text("中文 → English").tag("zh")
                }.pickerStyle(.segmented).disabled(store.hasUnresolvedRecovery || store.busy)
                TextField(text("Phrase or chosen address", "短句或已选地址"), text: $input, axis: .vertical)
                    .lineLimit(3...8).textFieldStyle(.roundedBorder)
                    .focused($inputFocused)
                    .disabled(tripSelection != nil || store.hasUnresolvedRecovery || store.busy).accessibilityIdentifier("translation.input")
                Text("\(input.utf16.count)/600").font(.caption).foregroundStyle(.secondary)
                Button(text("Translate", "翻译")) {
                    action?.cancel()
                    inputFocused = false
                    action = Task {
                        let selected = tripSelection
                        guard !store.hasUnresolvedRecovery, !Task.isCancelled else { return }
                        if let selected, !(await tripStore.revalidate(selected, currentScope: { activeScope }, request: request)) {
                            tripChanged = true
                            if store.pending == nil { tripSelection = nil; input = "" }
                            return
                        }
                        guard !Task.isCancelled else { return }
                        await store.submit(text: input, sourceLocale: source, tripSelection: selected, currentScope: { activeScope }, request: request)
                        for _ in 0..<30 {
                            guard store.recoveryRecord != nil, store.recoveryStatus == .pending, activeScope != nil,
                                  !Task.isCancelled, store.errorCode == nil else { break }
                            do { try await Task.sleep(for: .seconds(2)) } catch { break }
                            await store.load(scope: activeScope, currentScope: { activeScope }, request: request)
                        }
                    }
                }.buttonStyle(.borderedProminent)
                    .disabled(store.hasUnresolvedRecovery || activeScope == nil || store.busy || tripStore.busy || store.policy?.consentState != .accepted || input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || input.utf16.count > 600)
                    .accessibilityIdentifier("translation.submit")
                if store.busy { ProgressView() }
                if store.errorCode != nil {
                    Text(text("Translation is unavailable or the request could not be confirmed. Check your connection and consent, then refresh. Previously loaded phrases remain readable when generation is unavailable.", "翻译暂不可用，或请求状态未确认。请检查网络及同意状态后刷新。生成不可用时，已加载短语仍可阅读。"))
                        .accessibilityIdentifier("translation.error")
                }
                Button(text("Refresh saved phrases", "刷新已存短语")) {
                    action?.cancel()
                    action = Task { await store.load(scope: activeScope, currentScope: { activeScope }, request: request) }
                }.disabled(store.busy || session.dataScope == nil)
                Text(text("Recent phrases", "最近短语")).font(.title2.bold())
                Text(text("Your 20 most recent text requests and any original request verified by recovery. Original text and results follow the notice above. Reading does not generate another translation.", "显示最近 20 次文字请求及通过原请求恢复核验的结果。原文及结果按上方说明保留；阅读不会再次生成译文。"))
                    .font(.caption).foregroundStyle(.secondary)
                if activeScope != nil, store.scope == activeScope, store.policy?.consentState == .accepted {
                    ForEach(store.phrases) { phrase in phraseView(phrase) }
                }
                savedHistoryView
            }.padding()
        }
        .scrollDismissesKeyboard(.interactively)
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button(text("Done", "完成")) { inputFocused = false }
            }
        }
        .background(Color.vpBackground)
        .navigationTitle(text("Translation", "翻译"))
        .navigationBarTitleDisplayMode(.inline)
        .task(id: activeScope) {
            store.configureRecovery(session.translationRecoveryPersistence())
            await store.load(scope: activeScope, currentScope: { activeScope }, request: request)
        }
        .onChange(of: session.dataScope) { _, _ in
            store.clear()
            confirmLocalAbandon = false; reviewedAbandonRecord = nil
            action?.cancel(); historyAction?.cancel(); input = ""; savedQuery = ""; card = nil; savedCard = nil; savedHistory.clear(); savedDetail.clear()
            tripStore.clear(); tripSelection = nil; tripReturn = nil; tripChanged = false
        }
        .onChange(of: session.turnDataErasure?.id) { _, _ in
            guard let erased = session.turnDataErasure,
                  erased.scope == activeScope, (try? session.communitySafetyActor()) == erased.actor else { return }
            action?.cancel(); historyAction?.cancel(); card = nil; savedCard = nil; confirmLocalAbandon = false; reviewedAbandonRecord = nil
            input = ""; savedQuery = ""; tripStore.clear(); tripSelection = nil; tripReturn = nil
            store.clear(); savedHistory.clear(); savedDetail.clear()
            // Re-read authoritative source eligibility. Hiding a deleted projection is not completion.
            action = Task { await store.load(scope: activeScope, currentScope: { activeScope }, request: request) }
        }
        .onChange(of: store.errorCode) { _, code in
            if code == "STALE_TRIP_VERSION" || code == "TRIP_SOURCE_CHANGED" { tripChanged = true; tripStore.clear(); card = nil }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase != .active { action?.cancel(); historyAction?.cancel(); card = nil; savedCard = nil; confirmLocalAbandon = false; reviewedAbandonRecord = nil; store.clear(); savedHistory.clear(); savedDetail.clear(); input = ""; savedQuery = ""; tripStore.clear(); tripSelection = nil; tripReturn = nil }
        }
        .onChange(of: Array(savedQuery.utf8)) { _, _ in
            historyAction?.cancel(); savedHistory.clear(); savedDetail.clear(); savedCard = nil
        }
        .onDisappear {
            action?.cancel(); historyAction?.cancel()
            if savedCard == nil { savedHistory.clear(); savedDetail.clear() }
        }
        .confirmationDialog(text("Discard local recovery only?", "仅放弃本地恢复？"), isPresented: $confirmLocalAbandon, titleVisibility: .visible) {
            Button(text("Discard local recovery only", "仅放弃本地恢复"), role: .destructive) {
                guard let reviewed = reviewedAbandonRecord else { return }
                store.abandonLocalRecovery(reviewed, currentScope: { activeScope })
                reviewedAbandonRecord = nil
                input = ""; tripSelection = nil; tripStore.clear()
            }
            Button(text("Keep recovering", "继续保留恢复"), role: .cancel) { reviewedAbandonRecord = nil }
        } message: {
            Text(text("This removes only this device's recovery reference. It does not undo or guarantee stopping the server request. It will not generate again. Any new translation requires another explicit action.", "这只删除本机恢复引用，不会撤销服务端请求，也不保证请求已停止；不会自动再次生成。新翻译仍需你明确发起。"))
        }
        .fullScreenCover(item: $card) { phrase in
            if recentCardIsCurrent(phrase) {
                NativeTranslationCard(phrase: phrase, chinese: settings.selectedLocale == .zh, origin: store.recoveredTurnID == phrase.id ? .recovered : .recent)
            } else {
                unavailableCard
            }
        }
        .fullScreenCover(item: $savedCard, onDismiss: { savedDetail.clear() }) { reference in
            TimelineView(.periodic(from: .now, by: 1)) { _ in
                if savedDetail.isCurrent(activeScope, query: reference.query), let phrase = savedDetail.opened {
                    NativeTranslationCard(phrase: phrase, chinese: settings.selectedLocale == .zh, origin: .saved)
                } else {
                    VStack(spacing: 20) {
                        if savedDetail.state == "loading" { ProgressView() }
                        else { Text(text("This saved translation is unavailable. Refresh to check its current permission.", "这条已存翻译暂不可读，请刷新核对当前权限。")) }
                        Button(text("Done", "完成")) { savedCard = nil; savedDetail.clear() }
                    }.padding()
                }
            }.task {
                await loadSaved(exact: reference, into: savedDetail)
            }
        }
        .sheet(item: $tripReturn) { target in
            NavigationStack {
                NativeTripView(initialTripID: target.tripID, initialTripScope: target.scope, initialTripVersion: target.version)
                    .toolbar { ToolbarItem(placement: .confirmationAction) { Button(text("Done", "完成")) { tripReturn = nil } } }
            }
        }
    }

    private var recoveryView: some View {
        VStack(alignment: .leading, spacing: 12) {
            if store.recoveryStatus != .idle {
                Text(recoveryMessage).accessibilityIdentifier("translation.recovery.status")
            }
            if store.hasUnresolvedRecovery {
                Button(text("Read original request status", "读取原请求状态")) {
                    action?.cancel()
                    action = Task { await store.load(scope: activeScope, currentScope: { activeScope }, request: request) }
                }.disabled(store.busy || activeScope == nil).accessibilityIdentifier("translation.recovery.refresh")
            }
            if let original = store.recoveryRecord {
                Button(text("Request stop, then check original status", "请求停止并核对原状态")) {
                    action?.cancel()
                    action = Task { await store.cancel(currentScope: { activeScope }, request: request) }
                }.disabled(store.busy || activeScope == nil || store.policy?.consentState != .accepted)
                    .accessibilityIdentifier("translation.cancel.\(original.identity.turnId)")
                Button(text("Discard local recovery…", "放弃本地恢复…")) {
                    reviewedAbandonRecord = original; confirmLocalAbandon = true
                }
                    .disabled(store.busy || activeScope == nil).accessibilityIdentifier("translation.recovery.abandon")
            }
        }
    }

    private var recoveryMessage: String {
        switch store.recoveryStatus {
        case .idle: ""
        case .checking: text("Checking the original request. No new translation is generated.", "正在核对原请求，不会生成新翻译。")
        case .pending: text("The original request is pending. Reading it keeps the same request identity.", "原请求尚在处理中，读取保持同一请求身份。")
        case .unknown: text("The original request could not be confirmed. Its reference is kept; use read-only recovery, not a new send. Original input is not stored on this device.", "原请求状态未确认。恢复引用已保留，请只读恢复，不要重新发送。本机不会持久保存原文。")
        case .storageFailed: text("Recovery storage is unavailable or could not be verified. Sending is disabled. Read status again; an earlier request may still exist.", "恢复存储不可用或无法核验，已禁止发送。请重新读取状态，之前的请求可能仍然存在。")
        case .blocked: text("Current identity, policy or consent does not allow recovery. Private text is hidden; this does not prove the original request stopped.", "当前身份、条款或同意状态不允许恢复，私密文字已隐藏；这不代表原请求已停止。")
        case .translated: text("The original translation was recovered. You can open its large card below.", "已恢复原译文，可在下方打开大字卡。")
        case .cancelled: text("The original request reports cancelled. Only a verified original receipt settles local recovery.", "原请求报告已取消，仅核验通过的原回执可结束本地恢复。")
        case .unavailable, .needsReview: text("The original request has no reliable translation card. Unconfirmed recovery references remain saved.", "原请求暂无可靠译文卡片，未确认的恢复引用继续保留。")
        }
    }

    private struct TranslationTripReturn: Identifiable {
        let tripID: String
        let scope: NativeDataScope
        let version: Int
        var id: String { tripID }
    }

    private var tripSourceView: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(text("Choose from a confirmed Trip", "从已确认行程选择")).font(.headline)
            Text(text("Only the field you select is sent for translation. Trip text is not a verified address or proof of availability. Private Memory is not included.", "仅发送你明确选择的字段。行程文字不代表地址已经核真或未来可用，也不会附带私密记忆。"))
                .font(.caption).foregroundStyle(.secondary)
            Button(text(initialTripID == nil ? "Choose a Trip" : "Read this Trip", initialTripID == nil ? "选择行程" : "读取本行程")) {
                action?.cancel()
                tripSelection = nil; input = ""; tripChanged = false
                action = Task {
                    guard initialTripID == nil || initialTripScope == activeScope else { tripChanged = true; return }
                    _ = await tripStore.load(scope: activeScope, tripID: initialTripID, expectedVersion: initialTripVersion,
                                             currentScope: { activeScope }, request: request)
                }
            }.disabled(activeScope == nil || store.busy || tripStore.busy || store.pending != nil)
                .accessibilityIdentifier("translation.trip.choose")
            if tripStore.busy { ProgressView() }
            if let catalog = tripStore.catalog {
                ForEach(catalog.trips) { trip in
                    Button(trip.title + (catalog.currentTripId == trip.tripId ? text(" · current Trip", " · 当前行程") : "")) {
                        action?.cancel(); tripSelection = nil; input = ""; tripChanged = false
                        action = Task {
                            _ = await tripStore.load(scope: activeScope, tripID: trip.tripId, expectedVersion: trip.headVersion,
                                                     currentScope: { activeScope }, request: request)
                        }
                    }.disabled(store.busy || store.pending != nil || tripStore.busy)
                        .accessibilityIdentifier("translation.trip.\(trip.tripId)")
                }
            }
            if let detail = tripStore.detail {
                Text(detail.title + text(" · version \(detail.headVersion)", " · 版本 \(detail.headVersion)"))
                ForEach(detail.fields) { field in
                    Button {
                        guard let scope = activeScope else { return }
                        tripSelection = .init(scope: scope, source: detail.source(field), value: field.value)
                        input = field.value; tripChanged = false
                    } label: {
                        VStack(alignment: .leading) {
                            Text(field.field == "date" ? text("Day date", "日期") : field.itemId == nil ? text("Trip title", "行程标题") : text("Item text / scene", "条目文字／场景"))
                                .font(.caption).foregroundStyle(.secondary)
                            Text(field.value)
                        }.frame(maxWidth: .infinity, alignment: .leading)
                    }.disabled(store.busy || store.pending != nil || tripStore.busy)
                        .accessibilityIdentifier("translation.trip.field.\(field.id)")
                }
                if detail.fields.isEmpty { Text(text("No supported fields in this confirmed version.", "此确认版本没有可带入的字段。")) }
            }
            if let selection = tripSelection {
                Text(text("Selected field preview · Trip version \(selection.source.headVersion)", "所选字段预览 · 行程版本 \(selection.source.headVersion)"))
                    .font(.headline).accessibilityIdentifier("translation.trip.preview")
                Text(selection.value).textSelection(.enabled)
                Text(text("Translate confirms sending exactly this text. Later Trip changes do not rewrite an accepted phrase.", "点击翻译即确认发送这段原文；之后的行程变化不会改写已接收的短语。"))
                    .font(.caption)
                Button(text("Use typed text instead", "改为手动输入")) { tripSelection = nil; input = ""; tripStore.clear() }
                    .disabled(store.busy || store.pending != nil || tripStore.busy)
                Button(text("Return to this Trip", "返回本行程")) {
                    action?.cancel()
                    action = Task {
                        guard await tripStore.revalidate(selection, currentScope: { activeScope }, request: request) else {
                            tripChanged = true
                            if store.pending == nil { tripSelection = nil; input = "" }
                            return
                        }
                        if initialTripID == selection.source.tripId { dismiss() }
                        else { tripReturn = .init(tripID: selection.source.tripId, scope: selection.scope, version: selection.source.headVersion) }
                    }
                }.disabled(store.busy || tripStore.busy).accessibilityIdentifier("translation.trip.return")
            }
            if tripChanged || tripStore.unavailable {
                Text(text("This Trip source changed or is unavailable. Read it again and explicitly choose a field before translating or returning.", "行程来源已变化或暂不可读。请重新读取并明确选择字段，再翻译或返回。"))
                    .accessibilityIdentifier("translation.trip.unavailable")
            }
        }
    }

    @ViewBuilder private var policyView: some View {
        if let policy = store.policy {
            VStack(alignment: .leading, spacing: 8) {
                Text(text("Text processing", "文字处理")).font(.headline)
                Text(settings.selectedLocale == .zh ? policy.noticeZh : policy.noticeEn)
                Text(text("Recipient: ", "接收方：") + policy.recipient)
                Text(text("Processing region: ", "处理地区：") + policy.processingRegion)
                Text(text("This uses the same current-message consent as text Ask. Withdrawing applies to both.", "此处复用文字 Ask 的当前消息同意；撤回对两处同时生效。"))
                    .font(.caption)
                Button(policy.consentState == .accepted ? text("Withdraw consent", "撤回同意") : text("Agree to text processing", "同意文字处理")) {
                    card = nil
                    tripSelection = nil; tripStore.clear(); input = ""
                    savedCard = nil; historyAction?.cancel(); savedHistory.clear(); savedDetail.clear()
                    action?.cancel()
                    action = Task { await store.consent(accept: policy.consentState != .accepted, currentScope: { activeScope }, request: request) }
                }.disabled(store.busy)
            }
        }
    }

    private func loadSaved(cursor: String? = nil, exact: NativeSavedTranslationReference? = nil,
                           into reader: NativeSavedTranslationHistoryStore) async {
        let query = exact == nil && !savedQuery.isEmpty ? savedQuery : nil
        await reader.load(scope: activeScope, query: query, cursor: cursor, exact: exact, currentScope: { activeScope }, policyRequest: request) { cursor, turnID in
            try await session.translationHistoryRequest(cursor: cursor, turnID: turnID, query: query)
        }
    }

    private var savedHistoryView: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(text("Saved translation history", "已存翻译历史")).font(.title2.bold())
            Text(text("Browse earlier saved translations without generating again. Permission is checked on each page and when opening a card.", "查看更早的已存翻译，不会再次生成。每页和打开卡片时都会重新核对权限。"))
                .font(.caption).foregroundStyle(.secondary)
            TextField(text("Search original, translation or back-translation", "搜索原文、译文或回译"), text: $savedQuery)
                .textFieldStyle(.roundedBorder).accessibilityIdentifier("translation.history.query")
                .onSubmit { historyAction?.cancel(); historyAction = Task { await loadSaved(into: savedHistory) } }
            Text(text("Literal keywords, up to 120 characters. Each scan is bounded; sparse history can be unavailable and does not mean there are no matches in all history.", "按字面关键词搜索，最多 120 字符。每次扫描有界；稀疏历史可能暂不可读，不代表全部历史无匹配。"))
                .font(.caption).foregroundStyle(.secondary)
            Button(text(savedQuery.isEmpty ? "Browse saved translations" : "Search saved translations", savedQuery.isEmpty ? "浏览已存翻译" : "搜索已存翻译")) {
                historyAction?.cancel(); historyAction = Task { await loadSaved(into: savedHistory) }
            }.disabled(activeScope == nil || savedHistory.state == "loading" || savedQuery.utf16.count > NativeTranslationHistoryWire.maximumQueryUnits)
                .accessibilityIdentifier("translation.history.refresh")
            TimelineView(.periodic(from: .now, by: 1)) { _ in
                if savedHistory.state == "loading" { ProgressView() }
                else if savedHistory.isCurrent(activeScope, query: savedQuery.isEmpty ? nil : savedQuery) {
                    if savedHistory.phrases.isEmpty { Text(text(savedQuery.isEmpty ? "No saved translations on this page." : "No matches in the checked history.", savedQuery.isEmpty ? "本页没有已存翻译。" : "当前已检范围没有匹配。")) }
                    ForEach(savedHistory.phrases) { phrase in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(phrase.original).textSelection(.enabled)
                            Button(text("Open saved translation", "打开已存翻译")) {
                                inputFocused = false
                                savedCard = savedHistory.reference(phrase, scope: activeScope, query: savedQuery.isEmpty ? nil : savedQuery)
                            }.accessibilityIdentifier("translation.history.open.\(phrase.id)")
                        }
                    }
                    if let cursor = savedHistory.nextCursor {
                        Button(text("Older translations", "更早的翻译")) {
                            historyAction?.cancel(); historyAction = Task { await loadSaved(cursor: cursor, into: savedHistory) }
                        }.accessibilityIdentifier("translation.history.older")
                    }
                } else if savedHistory.state != "idle" {
                    Text(text("History is unavailable or needs refreshing. Browse or search again.", "历史暂不可读或需要刷新，请重新浏览或搜索。"))
                }
            }
        }
    }

    private func recentCardIsCurrent(_ phrase: NativeTranslationPhrase) -> Bool {
        activeScope != nil && store.scope == activeScope
            && store.policy?.valid == true && store.policy?.consentState == .accepted
            && phrase.isPresentationReady && store.phrases.contains(phrase)
    }

    private var unavailableCard: some View {
        VStack(spacing: 20) {
            Text(text("This translation is unavailable. Refresh to check its current permission.", "此翻译暂不可读，请刷新核对当前权限。"))
            Button(text("Done", "完成")) { card = nil }
        }.padding().accessibilityIdentifier("translation.card.unavailable")
    }

    @ViewBuilder private func phraseView(_ phrase: NativeTranslationPhrase) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text((store.recoveredTurnID == phrase.id ? NativeTranslationCardOrigin.recovered : .recent).label(chinese: settings.selectedLocale == .zh)).font(.caption).foregroundStyle(.secondary)
            Text(translationDirection(phrase, chinese: settings.selectedLocale == .zh)).font(.headline)
            Text(text("Original", "原文")).font(.caption).foregroundStyle(.secondary)
            Text(phrase.original).textSelection(.enabled)
            if phrase.isPresentationReady, let translation = phrase.translation, let back = phrase.backTranslation {
                Text(text("Translation · AI-generated", "译文 · AI 生成")).font(.caption).foregroundStyle(.secondary)
                Text(translation).font(.title2).textSelection(.enabled)
                Text(text("Back-translation for comparison", "回译对照")).font(.caption).foregroundStyle(.secondary)
                Text(back).textSelection(.enabled)
                Text(text("Check amounts, negation, places and allergies against your original. The back-translation is also AI-generated, not an independent check or certified translation.", "请对照原文核对金额、否定、地点和过敏信息。回译同样由 AI 生成，并非独立核验或认证翻译。"))
                    .font(.caption)
                Button(text("Show large card", "展示大字卡")) {
                    guard recentCardIsCurrent(phrase) else { return }
                    inputFocused = false; card = phrase
                }
                    .buttonStyle(.bordered).disabled(!recentCardIsCurrent(phrase))
                    .accessibilityIdentifier("translation.card.\(phrase.id)")
            } else {
                Text(phrase.state == "pending" ? text("Translating… Refresh to check.", "翻译中，请刷新查看。") : text("No reliable translation card is available. Keep the original, clarify the phrase and try again.", "暂无可展示的可靠译文。请保留原文，明确措辞后重试。"))
            }
        }.frame(maxWidth: .infinity, alignment: .leading).padding()
            .background(.background, in: RoundedRectangle(cornerRadius: 16))
    }
}

extension NativeTranslationPhrase {
    var isPresentationReady: Bool { valid && state == "translated" }
}

enum NativeTranslationCardOrigin {
    case recent, saved, recovered, sample

    func label(chinese: Bool) -> String {
        switch self {
        case .recent: chinese ? "来源：当前账号最近的文字请求" : "Source: recent text request for this account"
        case .saved: chinese ? "来源：已存文字请求（已重新核对权限）" : "Source: saved text request (permission rechecked)"
        case .recovered: chinese ? "来源：同一原请求的恢复读取" : "Source: recovery of the original request"
        case .sample: chinese ? "Sample · 未连接翻译服务" : "Sample · translation service not connected"
        }
    }

    func translationLabel(chinese: Bool) -> String {
        switch self {
        case .sample: chinese ? "样例译文" : "Sample translation"
        case .recent, .saved, .recovered: chinese ? "译文 · AI 生成" : "Translation · AI-generated"
        }
    }

    func backTranslationLabel(chinese: Bool) -> String {
        switch self {
        case .sample: chinese ? "样例回译" : "Sample back-translation"
        case .recent, .saved, .recovered: chinese ? "回译对照（AI 生成）" : "Back-translation (AI-generated)"
        }
    }

    func comparisonNotice(chinese: Bool) -> String {
        switch self {
        case .sample:
            chinese ? "原文、译文与回译均为固定本地样例，没有执行翻译，也不代表真实语义核验。" : "Original, translation and back-translation are fixed local examples. No translation or real semantic verification was performed."
        case .recent, .saved, .recovered:
            chinese ? "请核对金额、否定、地点和过敏信息。回译不是独立核验，本卡不是认证翻译。原始输入来自手动文字还是行程字段，此结果未提供来源信息。" : "Check amounts, negation, places and allergies. Back-translation is not an independent check; this is not a certified translation. This result does not identify whether the original was typed or selected from a Trip."
        }
    }
}

private func translationDirection(_ phrase: NativeTranslationPhrase, chinese: Bool) -> String {
    guard ["en", "zh"].contains(phrase.sourceLocale), ["en", "zh"].contains(phrase.targetLocale),
          phrase.sourceLocale != phrase.targetLocale else { return chinese ? "语言方向未知" : "Unknown language direction" }
    return phrase.sourceLocale == "en" ? "English → 中文" : "中文 → English"
}

/// Presentation only. Callers retain authority, freshness and scene checks.
struct NativeTranslationCard: View {
    let phrase: NativeTranslationPhrase
    let origin: NativeTranslationCardOrigin
    @State private var chinese: Bool
    @State private var largerText = false
    @Environment(\.dismiss) private var dismiss
    @ScaledMetric(relativeTo: .largeTitle) private var size = 44.0

    init(phrase: NativeTranslationPhrase, chinese: Bool, origin: NativeTranslationCardOrigin = .recent) {
        self.phrase = phrase
        self.origin = origin
        _chinese = State(initialValue: chinese)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    Text(origin.label(chinese: chinese)).font(.subheadline).foregroundStyle(.secondary)
                        .accessibilityIdentifier("translation.card.source")
                    Text(translationDirection(phrase, chinese: chinese)).font(.title2.bold())
                        .accessibilityIdentifier("translation.card.direction")
                    if phrase.isPresentationReady,
                       let translation = phrase.translation, let back = phrase.backTranslation {
                        Text(origin.translationLabel(chinese: chinese)).font(.headline)
                        Text(translation).font(.system(size: size * (largerText ? 1.35 : 1), weight: .semibold))
                            .textSelection(.enabled).accessibilityIdentifier("translation.largeText")
                        Divider()
                        Text(chinese ? "原文" : "Original").font(.headline)
                        Text(phrase.original).font(.title3).textSelection(.enabled)
                            .accessibilityIdentifier("translation.card.original")
                        Text(origin.backTranslationLabel(chinese: chinese)).font(.headline)
                        Text(back).font(.title3).textSelection(.enabled)
                            .accessibilityIdentifier("translation.card.backTranslation")
                        Text(origin.comparisonNotice(chinese: chinese))
                            .font(.footnote)
                        Toggle(chinese ? "更大字号" : "Larger text", isOn: $largerText)
                            .accessibilityIdentifier("translation.card.textSize")
                    } else {
                        Text(chinese ? "译文未就绪或无效，暂无可展示的大字译文。" : "Translation is not ready or is invalid. No large translation is available.")
                            .accessibilityIdentifier("translation.card.unavailable")
                    }
                    Toggle(chinese ? "中文界面" : "Chinese interface", isOn: $chinese)
                        .accessibilityIdentifier("translation.card.language")
                }.frame(maxWidth: .infinity, alignment: .leading).padding(24)
            }.background(Color.vpBackground)
                .navigationTitle(chinese ? "大字卡" : "Large card")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button(chinese ? "完成" : "Done") { dismiss() }
                            .accessibilityIdentifier("translation.card.done")
                            .accessibilityHint(chinese ? "返回现场表达，不会重新翻译" : "Return to expression without translating again")
                    }
                }
        }
    }
}

#if DEBUG
/// Local fixed fixtures only. Main may mount this leaf in the existing debug navigation.
struct NativeTranslationSampleExperienceView: View {
    @Environment(\.locale) private var locale
    private var chinese: Bool { locale.language.languageCode?.identifier == "zh" }
    private func copy(_ zh: String, _ en: String) -> String { chinese ? zh : en }
    @State private var source = "en"
    @State private var state = "translated"
    @State private var card: NativeTranslationPhrase?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text(NativeTranslationCardOrigin.sample.label(chinese: chinese))
                    .font(.headline).accessibilityIdentifier("translation.sample.notice")
                Text(copy("固定示例，仅体验展示与返回；不会发送文字或生成翻译。", "Fixed examples for presentation and return only. No text is sent or translated."))
                    .font(.subheadline)
                Picker(copy("示例方向", "Sample direction"), selection: $source) {
                    Text("English → 中文").tag("en")
                    Text("中文 → English").tag("zh")
                }.pickerStyle(.segmented).accessibilityIdentifier("translation.sample.direction")
                Picker(copy("示例状态", "Sample state"), selection: $state) {
                    Text(copy("就绪", "Ready")).tag("translated")
                    Text(copy("等待", "Pending")).tag("pending")
                    Text(copy("不可用", "Unavailable")).tag("unavailable")
                    Text(copy("未知", "Unknown")).tag("unknown")
                }.pickerStyle(.menu).accessibilityIdentifier("translation.sample.state")
                Text(copy("原文", "Original")).font(.headline)
                Text(Self.phrase(source: source, state: state).original).font(.title3)
                Button(copy("打开示例大字卡", "Open sample card")) {
                    card = Self.phrase(source: source, state: state)
                }.buttonStyle(.borderedProminent).accessibilityIdentifier("translation.sample.open")
                Text(copy("完成后返回这里，示例选择保持不变。", "Done returns here and keeps your sample selection."))
                    .font(.footnote)
            }.frame(maxWidth: .infinity, alignment: .leading).padding()
        }
        .navigationTitle(copy("现场表达样例", "Expression sample"))
        .fullScreenCover(item: $card) { phrase in
            NativeTranslationCard(phrase: phrase, chinese: chinese, origin: .sample)
        }
    }

    fileprivate static func phrase(source: String, state: String) -> NativeTranslationPhrase {
        let english = source == "en"
        return .init(turnId: "33333333-3333-4333-8333-333333333333",
            sourceLocale: source, targetLocale: english ? "zh" : "en",
            original: english ? "Hello." : "你好。", state: state,
            translation: state == "translated" ? (english ? "你好。" : "Hello.") : nil,
            backTranslation: state == "translated" ? (english ? "Hello." : "你好。") : nil)
    }
}
#endif

#if DEBUG
#Preview("Sample · not connected") {
    NativeTranslationSampleExperienceView()
}

#Preview("Sample · unavailable") {
    NativeTranslationCard(phrase: NativeTranslationSampleExperienceView.phrase(source: "zh", state: "pending"),
                          chinese: false, origin: .sample)
}
#endif
