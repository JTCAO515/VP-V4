import SwiftUI

struct NativeTranslationView: View {
    @Environment(AppSettings.self) private var settings
    @Environment(\.scenePhase) private var scenePhase
    @State private var store = NativeTranslationStore()
    @State private var source = "en"
    @State private var input = ""
    @State private var card: NativeTranslationPhrase?
    @State private var action: Task<Void, Never>?
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
                if session.dataScope == nil {
                    Text(text("Sign in in Profile to translate.", "请在「我的」登录后翻译。"))
                }
                policyView
                Picker(text("Translate", "翻译方向"), selection: $source) {
                    Text("English → 中文").tag("en")
                    Text("中文 → English").tag("zh")
                }.pickerStyle(.segmented).disabled(store.pending != nil || store.busy)
                TextField(text("Phrase or chosen address", "短句或已选地址"), text: $input, axis: .vertical)
                    .lineLimit(3...8).textFieldStyle(.roundedBorder)
                    .disabled(store.pending != nil || store.busy).accessibilityIdentifier("translation.input")
                Text("\(input.utf16.count)/600").font(.caption).foregroundStyle(.secondary)
                Button(text(store.pending == nil ? "Translate" : "Retry same request", store.pending == nil ? "翻译" : "重试同一请求")) {
                    action?.cancel()
                    action = Task {
                        await store.submit(text: input, sourceLocale: source, request: request)
                        for _ in 0..<30 {
                            guard store.pending != nil, !Task.isCancelled, store.errorCode == nil else { break }
                            do { try await Task.sleep(for: .seconds(2)) } catch { break }
                            await store.load(scope: session.dataScope, request: request)
                        }
                    }
                }.buttonStyle(.borderedProminent)
                    .disabled(store.busy || store.policy?.consentState != .accepted || input.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || input.utf16.count > 600)
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
            }.padding()
        }
        .background(Color.vpBackground)
        .navigationTitle(text("Translation", "翻译"))
        .navigationBarTitleDisplayMode(.inline)
        .task(id: activeScope) { await store.load(scope: activeScope, request: request) }
        .onChange(of: session.dataScope) { _, _ in
            action?.cancel(); input = ""; card = nil
        }
        .onChange(of: scenePhase) { _, phase in
            if phase != .active { action?.cancel(); card = nil; store.clear(); input = "" }
        }
        .onDisappear { action?.cancel() }
        .fullScreenCover(item: $card) { phrase in
            NativeTranslationCard(phrase: phrase, chinese: settings.selectedLocale == .zh)
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
                    action?.cancel()
                    action = Task { await store.consent(accept: policy.consentState != .accepted, request: request) }
                }.disabled(store.busy)
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
