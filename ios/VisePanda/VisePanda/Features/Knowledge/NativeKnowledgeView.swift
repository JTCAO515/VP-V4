import SwiftUI
import Observation

struct NativeKnowledgeView: View {
    var isActive = true
    var question = false
    @Environment(AppSettings.self) private var settings
    @Environment(\.scenePhase) private var scenePhase
    @State private var store = NativeKnowledgeStore()
    @State private var resultStore = NativeLibrarySearchStore()
    @State private var search = ""
    @State private var cursor: String?
    @State private var openedResult: LibraryResultSelection?
    @State private var city = "shanghai"
    @State private var scene = "arrival"
    @State private var refresh = UUID()
    private var chinese: Bool { settings.selectedLocale == .zh }
    private var session: NativeSession { settings.nativeSession }
    private var selection: NativeKnowledgeSelection { .init(city: city, scene: question ? "rail" : scene, locale: chinese ? "zh" : "en") }
    private func text(_ en: String, _ zh: String) -> String { chinese ? zh : en }
    private var loadKey: LoadKey { .init(scope: session.dataScope, selection: selection, active: scenePhase == .active && isActive, refresh: refresh) }
    private var resultLoadKey: ResultLoadKey { .init(scope: session.dataScope, active: scenePhase == .active && isActive, refresh: refresh, search: search, cursor: cursor) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: VPSpacing.section) {
                BrandHeader()
                Text(question ? text("Which documents do I need to board?", "乘车需要哪些证件？") : text("Library", "资源库")).font(.largeTitle.bold())
                if !question {
                    TimelineView(.periodic(from: .now, by: 1)) { _ in libraryContent }
                }
                if !question { Text(text("Reviewed travel notes", "已审核旅途参考")).font(.title2.bold()) }
                Text(question ? text("For adults travelling with a foreign passport on a domestic mainland China railway e-ticket. This answers only the booking ID and ticket-proof question. Read all conditions and check current station guidance. This read-only answer is not saved in your conversation.", "适用于持外国护照的成年旅客、境内铁路电子客票行程。这里只回答购票证件和车票凭证问题；请阅读全部条件，并核对车站最新指引。本次只读回答不保存到对话。") : text("Reviewed information for your selected city and situation. Read each note's conditions and check its source before taking action. This is not complete city coverage.", "按所选城市和场景提供已审核信息。请阅读每条内容的适用条件，行动前核对来源；这里不代表完整城市覆盖。"))
                    .foregroundStyle(Color.vpSecondaryText)
                Picker(text("City", "城市"), selection: selectionBinding($city)) {
                    ForEach(Array(NativeKnowledgeSelection.cities.enumerated()), id: \.element) { index, value in
                        Text(chinese ? ["上海", "北京", "广州", "重庆"][index] : ["Shanghai", "Beijing", "Guangzhou", "Chongqing"][index]).tag(value)
                    }
                }.accessibilityIdentifier("knowledge.city")
                if !question { Picker(text("Situation", "场景"), selection: selectionBinding($scene)) {
                    ForEach(Array(NativeKnowledgeSelection.scenes.enumerated()), id: \.element) { index, value in
                        Text(chinese ? ["入境", "机场交通", "支付", "手机与网络", "公共交通", "出租车", "高铁", "景点", "住宿", "紧急求助"][index] : ["Arrival", "Airport transport", "Payment", "Phone and internet", "Public transport", "Taxis", "Rail", "Attractions", "Accommodation", "Emergency help"][index]).tag(value)
                    }
                }.accessibilityIdentifier("knowledge.scene") }
                Button(text("Refresh", "刷新")) { store.clear(); resultStore.clear(); openedResult = nil; cursor = nil; refresh = UUID() }
                    .buttonStyle(.bordered).accessibilityIdentifier("knowledge.refresh")
                TimelineView(.periodic(from: .now, by: 1)) { _ in
                    VStack(alignment: .leading, spacing: VPSpacing.section) {
                        content
                    }
                }
            }.padding(VPSpacing.standard)
        }
        .background(Color.vpBackground)
        .vpNavigationTitle(question ? "tab.ask" : "tab.explore")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: loadKey) {
            let key = loadKey
            guard key.active, key.scope != nil else { store.clear(); return }
            repeat {
                // A request may itself refresh credentials. Busy must never cancel its task.
                while session.busy {
                    do { try await Task.sleep(for: .milliseconds(50)) } catch { return }
                    guard !Task.isCancelled, loadKey == key else { return }
                }
                await store.load(scope: key.scope, selection: key.selection, question: question) {
                    try await session.knowledgeRequest(selection: key.selection, question: question)
                }
                guard !Task.isCancelled, loadKey == key, store.refreshDelay > 0 else { return }
                do { try await Task.sleep(for: .seconds(store.refreshDelay)) }
                catch { return }
            } while !Task.isCancelled && loadKey == key
        }
        .task(id: resultLoadKey) {
            let key = resultLoadKey
            guard key.active, !question else { resultStore.clear(); return }
            if !search.isEmpty {
                do { try await Task.sleep(for: .milliseconds(250)) } catch { return }
                guard !Task.isCancelled, resultLoadKey == key else { return }
            }
            await resultStore.load(scope: key.scope, query: key.search, cursor: key.cursor) {
                guard session.dataScope == key.scope else { throw NativeDataError.staleSessionResponse }
                let bytes = try await session.resultSearchRequest(query: key.search, cursor: key.cursor)
                guard session.dataScope == key.scope else { throw NativeDataError.staleSessionResponse }
                return bytes
            }
        }
        .sheet(item: $openedResult, onDismiss: { resultStore.clear(); refresh = UUID() }) { selection in
            NativeLibraryResultDetail(selection: selection, scope: session.dataScope, chinese: chinese, session: session)
        }
        .onChange(of: search) { _, _ in resultStore.clear(); openedResult = nil; cursor = nil }
        .onChange(of: session.dataScope) { _, _ in resultStore.clear(); openedResult = nil; search = ""; cursor = nil }
        .onDisappear { store.clear(); resultStore.clear(); openedResult = nil }
    }

    @ViewBuilder private var content: some View {
        if session.dataScope == nil {
            Text(text("Sign in in Profile to read travel notes.", "请在「我的」登录后阅读旅途参考。"))
                .accessibilityIdentifier("knowledge.signedOut")
        } else if isActive && scenePhase == .active && store.isCurrent(scope: session.dataScope, selection: selection) {
            if store.state == .empty && !question {
                Text(text("No eligible reviewed information is available for this selection.", "当前城市和场景暂无适用的已审核信息。"))
                    .accessibilityIdentifier("knowledge.empty")
            } else {
                NativeKnowledgeCards(rows: store.rows, answer: store.answer, chinese: chinese)
            }
        } else if store.state == .unavailable {
            Text(text("Information is unavailable. Check your sign-in and try again.", "信息暂不可用，请检查登录状态后重试。"))
                .accessibilityIdentifier("knowledge.unavailable")
        } else {
            ProgressView().accessibilityLabel(text("Loading current information", "正在加载当前信息"))
        }
    }

    private func selectionBinding(_ value: Binding<String>) -> Binding<String> {
        Binding(get: { value.wrappedValue }, set: { store.clear(); value.wrappedValue = $0 })
    }

    @ViewBuilder private var libraryContent: some View {
        Text(text("Tools", "工具")).font(.title2.bold())
        NavigationLink {
            NativeTranslationView()
        } label: {
            Label(text("Translation and saved phrases", "翻译与已存短语"), systemImage: "character.bubble")
        }
        .accessibilityIdentifier("library.tool.translation")
        Text(text("My materials and results", "我的资料与成果")).font(.title2.bold())
        TextField(text("Search my materials and results", "搜索我的资料与成果"), text: $search)
            .textFieldStyle(.roundedBorder).accessibilityIdentifier("library.search")
        Text(text("Current comparisons. Translations from your latest 20 text requests. Other sources are excluded.", "当前比较成果；最近 20 次文字请求中的翻译。其他来源未纳入。"))
            .font(.footnote).foregroundStyle(Color.vpSecondaryText)
        if search.utf16.count > 120 {
            Text(text("Use a search of up to 120 characters.", "搜索内容最多 120 个字符。"))
        }
        NativeLibraryPhrasePanel(isActive: isActive, query: search)
        Text(text("Comparison results", "比较成果")).font(.headline)
        Text(text("Current comparisons across journeys, up to 20 per page.", "各旅程中当前有效的比较成果，每页最多 20 份。"))
            .font(.footnote).foregroundStyle(Color.vpSecondaryText)
        if session.dataScope == nil {
            Text(text("Sign in to find your results.", "登录后可查找自己的成果。"))
        } else if scenePhase == .active && isActive && resultStore.isCurrent(session.dataScope, query: search, cursor: cursor) {
            if resultStore.rows.isEmpty {
                Text(text("No matching result is currently available.", "当前没有可读的匹配成果。"))
            }
            ForEach(resultStore.rows) { result in
                Button {
                    openedResult = LibraryResultSelection(artifactID: result.artifactId, revision: result.revision)
                    resultStore.clear()
                } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(result.title).font(.headline)
                        Text(result.summary).lineLimit(2).font(.footnote)
                        Text(result.tripId == nil ? text("Not linked to a Trip", "未关联行程") : text("Linked to a Trip", "已关联行程"))
                            .font(.caption2).foregroundStyle(Color.vpSecondaryText)
                    }.frame(maxWidth: .infinity, alignment: .leading)
                }
                .accessibilityIdentifier("library.result.open")
            }
            if let next = resultStore.nextCursor {
                Button(text("Next page", "下一页")) { resultStore.clear(); openedResult = nil; cursor = next }
                    .accessibilityIdentifier("library.results.next")
            }
        } else if resultStore.state == "unavailable" {
            Text(text("Results unavailable. Check your session and refresh. This search may also be incomplete because its scan limit was reached.", "成果暂不可用，请检查登录状态并刷新。也可能因达到扫描上限而暂不能完成搜索。"))
        } else if resultStore.state == "result_search" {
            Text(text("Refresh to check your current results.", "请刷新以核对当前成果。"))
        } else {
            ProgressView().accessibilityLabel(text("Checking my results", "正在核对我的成果"))
        }
    }

    private struct LoadKey: Equatable {
        let scope: NativeDataScope?
        let selection: NativeKnowledgeSelection
        let active: Bool
        let refresh: UUID
    }

    private struct ResultLoadKey: Equatable {
        let scope: NativeDataScope?
        let active: Bool
        let refresh: UUID
        let search: String
        let cursor: String?
    }
}

struct LibraryResultSelection: Identifiable {
    let artifactID: String
    let revision: Int
    var id: String { "\(artifactID):\(revision)" }
}

private struct NativeLibraryPhrasePanel: View {
    let isActive: Bool
    let query: String
    @Environment(AppSettings.self) private var settings
    @Environment(\.scenePhase) private var phase
    @State private var store = NativeLibraryPhraseStore()
    @State private var selected: NativeLibraryPhraseReference?
    @State private var refresh = UUID()
    private var session: NativeSession { settings.nativeSession }
    private var scope: NativeDataScope? { isActive && phase == .active ? session.dataScope : nil }
    private func text(_ en: String, _ zh: String) -> String { settings.selectedLocale == .zh ? zh : en }
    private var key: Key { .init(scope: scope, refresh: refresh) }
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(text("Saved translations", "已存翻译")).font(.headline)
            Text(text("Translated phrases from your 20 most recent text requests. This is a limited window, not your complete materials history. No translation is generated when reading.", "显示最近 20 次文字请求中已完成的翻译。这是有限窗口，不代表完整资料历史；阅读不会重新生成翻译。"))
                .font(.footnote).foregroundStyle(Color.vpSecondaryText)
            Button(text("Refresh translations", "刷新翻译资料")) { store.clear(); selected = nil; refresh = UUID() }
                .disabled(scope == nil).accessibilityIdentifier("library.phrases.refresh")
            TimelineView(.periodic(from: .now, by: 1)) { _ in
                if scope == nil {
                    Text(text("Sign in to read your materials.", "登录后可读取自己的资料。"))
                } else if query.utf16.count > 120 && store.isCurrent(scope) {
                    Text(text("Shorten the search to check this window.", "请缩短搜索内容后查找此窗口。"))
                } else if let matches = store.matches(scope: scope, query: query) {
                    if matches.isEmpty { Text(text("No matching completed translation in this recent window.", "当前最近窗口中没有匹配的已完成翻译。")) }
                    ForEach(matches) { phrase in
                        Button {
                            guard let reference = store.reference(phrase, scope: scope) else {
                                store.clear(); refresh = UUID(); return
                            }
                            selected = reference
                            store.clear()
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(phrase.original).lineLimit(2)
                                Text(phrase.translation ?? "").font(.footnote).lineLimit(2)
                                if !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                                   let back = phrase.backTranslation,
                                   back.localizedStandardContains(query.trimmingCharacters(in: .whitespacesAndNewlines)) {
                                    Text(text("Back-translation: ", "回译：") + back).font(.footnote).lineLimit(2)
                                }
                            }.frame(maxWidth: .infinity, alignment: .leading)
                        }.accessibilityIdentifier("library.phrase.open")
                    }
                } else if store.state == "unavailable" {
                    Text(text("Materials unavailable. Check your session and translation consent in the Translation tool, then refresh.", "资料暂不可读，请检查登录及翻译工具中的同意状态后刷新。"))
                } else if store.state == "ready" {
                    Text(text("Refresh to recheck these materials.", "请刷新以重新核对资料资格。"))
                } else { ProgressView() }
            }
        }
        .task(id: key) {
            await store.load(scope: scope, currentScope: { scope }) { path, method, body in
                try await session.translateRequest(path: path, method: method, body: body)
            }
        }
        .onChange(of: scope) { _, _ in store.clear(); selected = nil }
        .onChange(of: query) { _, _ in selected = nil }
        .onDisappear { store.clear(); selected = nil }
        .sheet(item: $selected, onDismiss: { refresh = UUID() }) { reference in
            NativeLibraryPhraseDetail(reference: reference)
        }
    }
    private struct Key: Equatable { let scope: NativeDataScope?; let refresh: UUID }
}

private struct NativeLibraryPhraseDetail: View {
    let reference: NativeLibraryPhraseReference
    @Environment(AppSettings.self) private var settings
    @Environment(\.scenePhase) private var phase
    @State private var store = NativeLibraryPhraseStore()
    private var scope: NativeDataScope? { phase == .active ? settings.nativeSession.dataScope : nil }
    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { _ in
            if store.isCurrent(scope), let phrase = store.opened {
                NativeTranslationCard(phrase: phrase, chinese: settings.selectedLocale == .zh)
            } else if store.state == "idle" || store.state == "loading" { ProgressView() }
            else {
                Text(settings.selectedLocale == .zh ? "这份资料暂不可读，可能已改变、删除、撤权或超出最近窗口。请返回刷新；未确认旧内容仍可使用。" : "This material is unavailable. It may have changed, been deleted, lost permission, or left the recent window. Return and refresh; the earlier content is not confirmed usable.")
                    .padding().accessibilityIdentifier("library.phrase.unavailable")
            }
        }
        .task(id: scope) {
            await store.load(scope: reference.scope, exact: reference, currentScope: { scope }) { path, method, body in
                try await settings.nativeSession.translateRequest(path: path, method: method, body: body)
            }
        }
        .onChange(of: scope) { _, _ in store.clear() }
        .onDisappear { store.clear() }
    }
}

enum NativeLibrarySearch {
    static func matches(_ content: NativeResultContent, query: String) -> Bool {
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines)
        return term.isEmpty || content.title.localizedStandardContains(term) || content.summary.localizedStandardContains(term)
    }
}

private struct NativeLibraryResultDetail: View {
    let selection: LibraryResultSelection
    let scope: NativeDataScope?
    let chinese: Bool
    let session: NativeSession
    @Environment(\.scenePhase) private var scenePhase
    @State private var store = NativeResultStore()
    @State private var refresh = UUID()
    private var loadKey: LoadKey { .init(scope: session.dataScope, active: scenePhase == .active, refresh: refresh) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: VPSpacing.standard) {
                Button(chinese ? "刷新此成果" : "Refresh this result") { store.clear(); refresh = UUID() }
                    .buttonStyle(.bordered)
                    .disabled(store.state == "loading" || session.dataScope != scope)
                    .accessibilityIdentifier("library.result.refresh")
                TimelineView(.periodic(from: .now, by: 1)) { _ in
                    NativeResultCard(store: store, scope: scenePhase == .active ? session.dataScope : nil, chinese: chinese)
                }
            }.padding()
        }
        .task(id: loadKey) {
            guard loadKey.active, session.dataScope == scope else { store.clear(); return }
            await store.loadExact(scope: scope, artifactID: selection.artifactID, revision: selection.revision) {
                guard session.dataScope == scope else { throw NativeDataError.staleSessionResponse }
                let bytes = try await session.resultRequest(artifactID: selection.artifactID, revision: selection.revision)
                guard session.dataScope == scope else { throw NativeDataError.staleSessionResponse }
                return bytes
            }
        }
        .onChange(of: scenePhase) { _, phase in if phase != .active { store.clear() } }
        .onDisappear { store.clear() }
    }

    private struct LoadKey: Equatable {
        let scope: NativeDataScope?
        let active: Bool
        let refresh: UUID
    }
}

/// The same result read model is used by VP and the existing materials entry.
/// Schema changes degrade to literal text; actions and URLs are never interpreted.
struct NativeResultEnvelope: Decodable {
    let version: Int
    let data: NativeResultPayload
}

struct NativeTripResultReferenceEnvelope: Decodable {
    let version: Int
    let data: NativeTripResultReference
}

struct NativeTripResultReference: Decodable {
    let kind: String
    let artifactId: String?
    let revision: Int?
    let tripId: String?

    func valid(for expectedTripID: String) -> Bool {
        if kind == "empty" || kind == "unavailable" { return artifactId == nil && revision == nil && tripId == nil }
        guard kind == "result_reference", let artifactId, UUID(uuidString: artifactId) != nil,
              let revision, (1...1000).contains(revision), tripId == expectedTripID else { return false }
        return true
    }
}

struct NativeResultSource: Decodable {
    let tripId: String?
    let tripVersion: Int?
}

struct NativeResultPayload: Decodable {
    let kind: String
    let artifactId: String?
    let revision: Int?
    let current: Bool?
    let lifecycle: String?
    let source: NativeResultSource?
    let content: NativeResultContent?

    var valid: Bool {
        if kind == "empty" || kind == "unavailable" { return artifactId == nil && content == nil }
        guard kind == "result_artifact", let artifactId, UUID(uuidString: artifactId) != nil,
              let revision, revision > 0, revision <= 1000,
              current != nil, let lifecycle, ["active", "withdrawn"].contains(lifecycle),
              let content, content.valid else { return false }
        return true
    }
}

struct NativeResultContent: Decodable {
    let schemaVersion: String
    let title: String
    let summary: String
    let options: [NativeResultOption]?

    var valid: Bool {
        guard !title.isEmpty, title.count <= 120, !summary.isEmpty, summary.count <= 1000 else { return false }
        if schemaVersion != "comparison/1" { return true }
        guard let options, (2...4).contains(options.count), options.allSatisfy(\.valid) else { return false }
        return Set(options.map(\.id)).count == options.count
    }
}

struct NativeResultOption: Decodable, Identifiable {
    let id: String
    let title: String
    let tradeoff: String
    var valid: Bool {
        !id.isEmpty && id.count <= 40 && !title.isEmpty && title.count <= 120
        && !tradeoff.isEmpty && tradeoff.count <= 500
    }
}

@MainActor @Observable
final class NativeResultStore {
    private(set) var result: NativeResultPayload?
    private(set) var state = "idle"
    private(set) var scope: NativeDataScope?
    private var generation = UUID()
    private var deadline: TimeInterval = 0
    private let uptime: () -> TimeInterval

    init(uptime: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) { self.uptime = uptime }

    func clear() {
        generation = UUID(); result = nil; state = "idle"; scope = nil; deadline = 0
    }

    func isCurrent(_ currentScope: NativeDataScope?) -> Bool {
        currentScope != nil && scope == currentScope && deadline > uptime()
    }

    func load(scope requested: NativeDataScope?, using session: NativeSession) async {
        await load(scope: requested) {
            guard session.dataScope == requested else { throw NativeDataError.staleSessionResponse }
            let bytes = try await session.resultRequest()
            guard session.dataScope == requested else { throw NativeDataError.staleSessionResponse }
            return bytes
        }
    }

    func loadExact(scope requested: NativeDataScope?, artifactID: String, revision: Int,
                   fetch: () async throws -> Data) async {
        await load(scope: requested) {
            let bytes = try await fetch()
            let envelope = try JSONDecoder().decode(NativeResultEnvelope.self, from: bytes)
            guard envelope.version == 1, envelope.data.valid,
                  envelope.data.kind == "result_artifact",
                  envelope.data.artifactId == artifactID,
                  envelope.data.revision == revision,
                  envelope.data.current == true,
                  envelope.data.lifecycle == "active" else { throw NativeDataError.invalidResponse }
            return bytes
        }
    }

    func load(scope requested: NativeDataScope?, tripID: String, using session: NativeSession) async {
        await load(scope: requested, tripID: tripID, reference: {
            guard session.dataScope == requested else { throw NativeDataError.staleSessionResponse }
            return try await session.tripResultReferenceRequest(tripID: tripID)
        }, open: { artifactID, revision in
            guard session.dataScope == requested else { throw NativeDataError.staleSessionResponse }
            let bytes = try await session.resultRequest(artifactID: artifactID, revision: revision)
            guard session.dataScope == requested else { throw NativeDataError.staleSessionResponse }
            return bytes
        })
    }

    func load(scope requested: NativeDataScope?, tripID: String,
              reference: () async throws -> Data, open: (String, Int) async throws -> Data) async {
        await load(scope: requested) {
            let referenceBytes = try await reference()
            let reference = try JSONDecoder().decode(NativeTripResultReferenceEnvelope.self, from: referenceBytes)
            guard reference.version == 1, reference.data.valid(for: tripID) else { throw NativeDataError.invalidResponse }
            if reference.data.kind != "result_reference" { return referenceBytes }
            guard let artifactID = reference.data.artifactId, let revision = reference.data.revision else { throw NativeDataError.invalidResponse }
            let bytes = try await open(artifactID, revision)
            let result = try JSONDecoder().decode(NativeResultEnvelope.self, from: bytes)
            guard result.version == 1, result.data.valid, result.data.kind == "result_artifact",
                  result.data.artifactId == artifactID, result.data.revision == revision,
                  result.data.current == true, result.data.source?.tripId == tripID,
                  result.data.source?.tripVersion != nil else { throw NativeDataError.invalidResponse }
            return bytes
        }
    }

    func load(scope requested: NativeDataScope?, fetch: () async throws -> Data) async {
        clear()
        guard let requested, !Task.isCancelled else { return }
        scope = requested; state = "loading"
        let own = generation, started = uptime()
        do {
            let bytes = try await fetch()
            guard !Task.isCancelled, generation == own else { return }
            let envelope = try JSONDecoder().decode(NativeResultEnvelope.self, from: bytes)
            guard envelope.version == 1, envelope.data.valid, uptime() - started < 30 else { throw NativeDataError.invalidResponse }
            result = envelope.data; state = envelope.data.kind; deadline = started + 30
        } catch {
            guard generation == own else { return }
            result = nil; state = "unavailable"; deadline = 0
        }
    }
}

struct NativeResultCard: View {
    let store: NativeResultStore
    let scope: NativeDataScope?
    let chinese: Bool
    var expectedTripID: String? = nil
    private func text(_ en: String, _ zh: String) -> String { chinese ? zh : en }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(text("My comparison result", "我的比较成果")).font(.headline)
            if scope == nil {
                Text(text("Sign in to read saved results.", "登录后可读取已保存的成果。"))
            } else if store.state == "result_artifact", let expectedTripID,
                      store.result?.source?.tripId != expectedTripID {
                Text(text("Checking the selected Trip's result…", "正在核对所选行程的成果……"))
            } else if store.isCurrent(scope), let result = store.result, result.kind == "result_artifact", let content = result.content {
                Text(content.title).font(.title3.bold()).textSelection(.enabled)
                Text(content.summary).textSelection(.enabled)
                if content.schemaVersion == "comparison/1", let options = content.options {
                    ForEach(options) { option in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(option.title).font(.subheadline.bold())
                            Text(option.tradeoff)
                        }
                    }
                } else {
                    Text(text("This result uses a newer format. Open it in an updated app before acting.", "此成果使用较新格式，请更新应用后再操作。"))
                        .font(.footnote)
                }
                Text("\(result.artifactId ?? "") · r\(result.revision ?? 0)")
                    .font(.caption2).textSelection(.enabled).accessibilityIdentifier("result.identity")
                if result.current != true {
                    Text(text("Earlier result. Review current inputs before using it.", "这是旧成果；使用前请核对当前输入。"))
                        .font(.footnote).foregroundStyle(Color.vpSecondaryText)
                }
            } else if store.state == "empty" {
                Text(text("No saved comparison yet.", "尚无保存的比较成果。"))
            } else if store.state == "unavailable" {
                Text(text("Result unavailable. Refresh after checking your session and permissions.", "成果暂不可读，请检查登录和授权后刷新。"))
            } else if store.state == "result_artifact" {
                Text(text("Refresh to check whether this result is still current.", "请刷新以核对成果是否仍有效。"))
            } else {
                ProgressView()
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14).background(Color.vpSurface, in: RoundedRectangle(cornerRadius: 16))
        .accessibilityIdentifier("result.card")
    }
}


/// Shared deterministic renderer; caller owns session, lifetime and visibility fences.
struct NativeKnowledgeCards: View {
    let rows: [NativeKnowledgeStatement]
    let answer: NativeKnowledgeAnswer?
    let chinese: Bool
    private func text(_ en: String, _ zh: String) -> String { chinese ? zh : en }
    var body: some View {
        VStack(alignment: .leading, spacing: VPSpacing.section) {
            if let answer { coverage(answer) }
            ForEach(rows) { row in note(row) }
        }
    }
    private func coverage(_ answer: NativeKnowledgeAnswer) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(answer.outcome == "answered" ? (answer.questionId == "rail_boarding_documents" ? text("Both document points have reviewed support.", "两个证件要点均有已审核依据。") : NativeKnowledgeAnswer.isPlace(answer.questionId) ? text("The requested attraction details have reviewed support.", "所问景点详情有已审核依据。") : answer.questionId.hasPrefix("connectivity_") ? text("The requested SIM guidance has reviewed support.", "所需SIM卡指引有已审核依据。") : text("The requested payment guidance has reviewed support.", "所需支付指引有已审核依据。")) : answer.outcome == "partial" ? text("Part of the answer is available.", "目前可回答其中一部分。") : text("This question cannot be answered from current reviewed information.", "当前已审核信息不足以回答这个问题。"))
                .font(.headline).accessibilityIdentifier("knowledge.answer.\(answer.outcome)")
            ForEach(answer.claims.filter { $0.status != "covered" }) { claim in
                VStack(alignment: .leading, spacing: 6) {
                    Text(claimLabel(claim.id))
                        .font(.subheadline.bold())
                    ForEach(claim.reasons, id: \.self) { reason in
                        Text(gap(reason)).accessibilityIdentifier("knowledge.gap.\(reason)")
                    }
                }
            }
            if answer.outcome != "answered" {
                Text(answer.questionId == "rail_boarding_documents" ? text("Check the missing point with 12306 or your departure station before travelling.", "出发前请向12306或出发车站核对尚缺的要点。") : NativeKnowledgeAnswer.isPlace(answer.questionId) ? text("Confirm the missing address or today’s opening details with the venue before visiting.", "到访前请向场馆核对缺少的地址或今日开放信息。") : answer.questionId.hasPrefix("connectivity_") ? text("Check the missing information with your mobile carrier before applying or choosing a plan.", "办理或选择套餐前，请向通信运营商核对缺少的信息。") : text("Check current app prompts, your card issuer or the relevant operator for the missing information.", "请查看应用当前提示，或向发卡行及相关经营方核对缺少的信息。"))
            }
        }
    }

    private func claimLabel(_ id: String) -> String {
        switch id {
        case "place_address": return text("Attraction address", "景点地址")
        case "opening_hours": return text("Today’s opening time", "今日开放时间")
        case "original_valid_booking_id": return text("Booking ID", "购票证件")
        case "valid_ticket_not_itinerary_or_receipt": return text("Itinerary and receipt as ticket proof", "行程单和报销凭证是否可作车票")
        case "merchant_acceptance_check": return text("Checking card acceptance", "核对外卡受理")
        case "supported_card_merchant_qr_payment": return text("Mobile merchant payments", "手机商户支付")
        case "international_card_atm_withdrawal": return text("RMB cash from an ATM", "ATM取人民币现金")
        case "marked_currency_exchange": return text("Currency-exchange outlets", "外币兑换网点")
        case "passport_or_foreign_permanent_resident_id": return text("SIM application documents", "SIM卡申请证件")
        case "plan_allowance_check": return text("Checking call and data allowances", "核对通话和流量额度")
        default: return text("Requested information", "所需信息")
        }
    }

    private func gap(_ reason: String) -> String {
        switch reason {
        case "not_current_date": return text("The published opening window is for another date; today’s hours are unverified.", "已发布开放时段对应其他日期，今日开放时间尚未核实。")
        case "expired": return text("The supporting publication has expired.", "相关依据已超过有效期。")
        case "revoked": return text("The supporting publication has been withdrawn.", "相关依据已撤回。")
        case "unreviewed": return text("The publication is not currently reviewed.", "相关发布内容当前不满足审核条件。")
        case "unresolved_variants": return text("Reviewed versions differ and have not been reconciled.", "已审核版本存在差异，尚未完成核对。")
        default: return text("No published support was found for this point.", "尚未找到支持这一要点的已发布信息。")
        }
    }

    private func note(_ row: NativeKnowledgeStatement) -> some View {
        VisePandaCard {
            VStack(alignment: .leading, spacing: 12) {
                Text(row.text).font(.headline).accessibilityIdentifier("knowledge.note.\(row.id)")
                ForEach(Array(row.placeDetails(chinese: chinese).enumerated()), id: \.offset) { _, detail in
                    Text(detail).fixedSize(horizontal: false, vertical: true)
                }
                if !row.conditions.isEmpty { lines(text("Applies when", "适用条件"), row.conditions) }
                if !row.exclusions.isEmpty { lines(text("Not covered", "不包含"), row.exclusions) }
                if let date = NativeKnowledgeRead.date(row.reviewedAt) {
                    Text(text("Reviewed: ", "审核日期：") + date.formatted(.dateTime.year().month(.abbreviated).day().locale((chinese ? SupportedLocale.zh : .en).locale)))
                        .font(.caption).foregroundStyle(Color.vpSecondaryText)
                }
                DisclosureGroup(text("Sources and context", "来源与上下文")) {
                    ForEach(row.sources) { source in
                        VStack(alignment: .leading, spacing: 6) {
                            if let url = source.url { Link(source.publisher, destination: url) }
                            else { Text(source.publisher) }
                            Text(source.locator).font(.caption).foregroundStyle(Color.vpSecondaryText)
                        }.frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 6)
                    }
                }
            }.frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func lines(_ title: String, _ values: [String]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.subheadline.bold())
            ForEach(Array(values.enumerated()), id: \.offset) { _, value in Text("• " + value).fixedSize(horizontal: false, vertical: true) }
        }
    }

}
