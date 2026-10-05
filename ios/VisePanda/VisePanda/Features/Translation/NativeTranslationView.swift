import SwiftUI

struct NativeTranslationView: View {
    var initialTripID: String? = nil
    var initialTripScope: NativeDataScope? = nil
    var initialTripVersion: Int? = nil
    @Environment(AppSettings.self) private var settings
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.dismiss) private var dismiss
    @State private var store = NativeTranslationStore()
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
    private var session: NativeSession { settings.nativeSession }
    private var activeScope: NativeDataScope? { scenePhase == .active ? session.dataScope : nil }
    private func text(_ en: String, _ zh: String) -> String { settings.selectedLocale == .zh ? zh : en }
    private func request(_ path: String, _ method: String, _ body: Data?) async throws -> Data {
        try await session.translateRequest(path: path, method: method, body: body)
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
                tripSourceView
                Picker(text("Translate", "翻译方向"), selection: $source) {
                    Text("English → 中文").tag("en")
                    Text("中文 → English").tag("zh")
                }.pickerStyle(.segmented).disabled(store.pending != nil || store.busy)
                TextField(text("Phrase or chosen address", "短句或已选地址"), text: $input, axis: .vertical)
                    .lineLimit(3...8).textFieldStyle(.roundedBorder)
                    .disabled(tripSelection != nil || store.pending != nil || store.busy).accessibilityIdentifier("translation.input")
                Text("\(input.utf16.count)/600").font(.caption).foregroundStyle(.secondary)
                Button(text(store.pending == nil ? "Translate" : "Retry same request", store.pending == nil ? "翻译" : "重试同一请求")) {
                    action?.cancel()
                    action = Task {
                        let selected = tripSelection
                        // Resolve an ambiguous prior send from its original receipt before retrying.
                        if store.pending != nil {
                            await store.load(scope: activeScope, request: request)
                            guard store.pending != nil else { return }
                        }
                        if let selected, !(await tripStore.revalidate(selected, currentScope: { activeScope }, request: request)) {
                            tripChanged = true
                            if store.pending == nil { tripSelection = nil; input = "" }
                            return
                        }
                        await store.submit(text: input, sourceLocale: source, tripSelection: selected, request: request)
                        for _ in 0..<30 {
                            guard store.pending != nil, !Task.isCancelled, store.errorCode == nil else { break }
                            do { try await Task.sleep(for: .seconds(2)) } catch { break }
                            await store.load(scope: session.dataScope, request: request)
                        }
                    }
                }.buttonStyle(.borderedProminent)
                    .disabled(store.busy || tripStore.busy || store.policy?.consentState != .accepted || input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || input.utf16.count > 600)
                    .accessibilityIdentifier("translation.submit")
                if store.busy { ProgressView() }
                if let pending = store.pending {
                    Text(text("Submitted or awaiting confirmation. Refresh to read the saved result; retry keeps the same request ID.", "请求已提交或尚待确认。刷新可读取已存结果；重试保持同一请求编号。"))
                    Button(text("Stop this request", "停止此请求")) {
                        action?.cancel()
                        action = Task { await store.cancel(request: request) }
                    }.disabled(store.busy).accessibilityIdentifier("translation.cancel.\(pending.turnId)")
                }
                if store.errorCode != nil {
                    Text(text("Translation is unavailable or the request could not be confirmed. Check your connection and consent, then refresh. Previously loaded phrases remain readable when generation is unavailable.", "翻译暂不可用，或请求状态未确认。请检查网络及同意状态后刷新。生成不可用时，已加载短语仍可阅读。"))
                        .accessibilityIdentifier("translation.error")
                }
                Button(text("Refresh saved phrases", "刷新已存短语")) {
                    action?.cancel()
                    action = Task { await store.load(scope: session.dataScope, request: request) }
                }.disabled(store.busy || session.dataScope == nil)
                Text(text("Recent phrases", "最近短语")).font(.title2.bold())
                Text(text("From your 20 most recent text requests. Original text and results are retained under the notice above. Reading them does not generate another translation.", "显示最近 20 次文字请求中的翻译。原文及结果按上方说明保留；阅读不会再次生成译文。"))
                    .font(.caption).foregroundStyle(.secondary)
                ForEach(store.phrases) { phrase in phraseView(phrase) }
                savedHistoryView
            }.padding()
        }
        .background(Color.vpBackground)
        .navigationTitle(text("Translation", "翻译"))
        .navigationBarTitleDisplayMode(.inline)
        .task(id: activeScope) { await store.load(scope: activeScope, request: request) }
        .onChange(of: session.dataScope) { _, _ in
            action?.cancel(); historyAction?.cancel(); input = ""; savedQuery = ""; card = nil; savedCard = nil; savedHistory.clear(); savedDetail.clear()
            tripStore.clear(); tripSelection = nil; tripReturn = nil; tripChanged = false
        }
        .onChange(of: store.errorCode) { _, code in
            if code == "STALE_TRIP_VERSION" || code == "TRIP_SOURCE_CHANGED" { tripChanged = true; tripStore.clear() }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase != .active { action?.cancel(); historyAction?.cancel(); card = nil; savedCard = nil; store.clear(); savedHistory.clear(); savedDetail.clear(); input = ""; savedQuery = ""; tripStore.clear(); tripSelection = nil; tripReturn = nil }
        }
        .onChange(of: Array(savedQuery.utf8)) { _, _ in
            historyAction?.cancel(); savedHistory.clear(); savedDetail.clear(); savedCard = nil
        }
        .onDisappear {
            action?.cancel(); historyAction?.cancel()
            if savedCard == nil { savedHistory.clear(); savedDetail.clear() }
        }
        .fullScreenCover(item: $card) { phrase in
            NativeTranslationCard(phrase: phrase, chinese: settings.selectedLocale == .zh)
        }
        .fullScreenCover(item: $savedCard, onDismiss: { savedDetail.clear() }) { reference in
            TimelineView(.periodic(from: .now, by: 1)) { _ in
                if savedDetail.isCurrent(activeScope, query: reference.query), let phrase = savedDetail.opened {
                    NativeTranslationCard(phrase: phrase, chinese: settings.selectedLocale == .zh)
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
                    action = Task { await store.consent(accept: policy.consentState != .accepted, request: request) }
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

    @ViewBuilder private func phraseView(_ phrase: NativeTranslationPhrase) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(text("Original", "原文")).font(.caption).foregroundStyle(.secondary)
            Text(phrase.original).textSelection(.enabled)
            if phrase.state == "translated", let translation = phrase.translation, let back = phrase.backTranslation {
                Text(translation).font(.title2).textSelection(.enabled)
                Text(text("Back-translation for comparison", "回译对照")).font(.caption).foregroundStyle(.secondary)
                Text(back).textSelection(.enabled)
                Text(text("Check amounts, negation, places and allergies against your original. The back-translation is also AI-generated, not an independent check or certified translation.", "请对照原文核对金额、否定、地点和过敏信息。回译同样由 AI 生成，并非独立核验或认证翻译。"))
                    .font(.caption)
                Button(text("Show large card", "展示大字卡")) { card = phrase }
                    .buttonStyle(.bordered).accessibilityIdentifier("translation.card.\(phrase.id)")
            } else {
                Text(phrase.state == "pending" ? text("Translating… Refresh to check.", "翻译中，请刷新查看。") : text("No reliable translation card is available. Keep the original, clarify the phrase and try again.", "暂无可展示的可靠译文。请保留原文，明确措辞后重试。"))
            }
        }.frame(maxWidth: .infinity, alignment: .leading).padding()
            .background(.background, in: RoundedRectangle(cornerRadius: 16))
    }
}

struct NativeTranslationCard: View {
    let phrase: NativeTranslationPhrase
    let chinese: Bool
    @Environment(\.dismiss) private var dismiss
    @ScaledMetric(relativeTo: .largeTitle) private var size = 44.0
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    Text(phrase.translation ?? "").font(.system(size: size, weight: .semibold))
                        .textSelection(.enabled).accessibilityIdentifier("translation.largeText")
                    Divider()
                    Text(chinese ? "原文" : "Original").font(.headline)
                    Text(phrase.original).font(.title3).textSelection(.enabled)
                    Text(chinese ? "回译对照（AI 生成）" : "Back-translation (AI-generated)").font(.headline)
                    Text(phrase.backTranslation ?? "").textSelection(.enabled)
                    Text(chinese ? "请核对金额、否定、地点和过敏信息。本卡不是认证翻译。" : "Check amounts, negation, places and allergies. This is not a certified translation.")
                        .font(.footnote)
                }.frame(maxWidth: .infinity, alignment: .leading).padding(24)
            }.background(Color.vpBackground)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button(chinese ? "完成" : "Done") { dismiss() } } }
        }
    }
}
