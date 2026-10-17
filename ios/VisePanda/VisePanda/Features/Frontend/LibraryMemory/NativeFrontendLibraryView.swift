import SwiftUI

@MainActor
struct NativeFrontendLibraryView: View {
    @Environment(\.locale) private var locale
    private var copy: NativeLibraryMemoryCopy { .init(locale: locale) }
    let state: NativeFrontendState
    @State private var query = ""
    @State private var savedOnly = false

    var body: some View {
        List {
            Section {
                NativeLibraryMemoryBoundary()
                Text(copy("你的想法与助手成果，都在这里。", "Your ideas and assistant results, together."))
                    .font(.subheadline).foregroundStyle(.secondary)
                Toggle(copy("只看已保存", "Saved only"), isOn: $savedOnly)
                    .accessibilityIdentifier("frontend.library.savedFilter")
            }
            if state.screenState != .ready {
                NativeLibraryMemoryStatePanel(state: state)
                if state.screenState == .empty {
                    Button(copy("返回正常样例", "Return to sample")) { state.screenState = .ready }
                }
            } else {
                let results = state.libraryMaterials(query: query, savedOnly: savedOnly)
                if results.isEmpty {
                    ContentUnavailableView(copy("没有匹配资料", "No matching materials"), systemImage: "doc.text.magnifyingglass",
                        description: Text(copy("试试其他关键词，或查看全部资料。", "Try another search, or show all materials.")))
                    Button(copy("查看全部资料", "Show all materials")) { query = ""; savedOnly = false }
                    Button(copy("从对话开始", "Start in chat")) { state.openChat() }
                }
                ForEach(results) { material in
                    Button { state.openMaterial(material.id) } label: {
                        VStack(alignment: .leading, spacing: 8) {
                            HStack(alignment: .top) {
                                Text(material.title).font(.headline)
                                Spacer()
                                if material.saved { Image(systemName: "bookmark.fill").accessibilityLabel(copy("已保存", "Saved")) }
                            }
                            Text(material.source).font(.caption).foregroundStyle(.secondary)
                            if let journey = state.journeys.first(where: { $0.id == material.journeyID }) {
                                Text(copy("所属：", "Journey: ") + journey.title).font(.caption).foregroundStyle(.secondary)
                            }
                            Text(material.content).font(.subheadline).lineLimit(3).foregroundStyle(.secondary)
                        }.padding(.vertical, 6)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("frontend.library.material.\(material.id)")
                }
            }
            if let notice = state.notice { Section(copy("本地反馈", "Local feedback")) { Text(notice).font(.subheadline) } }
        }
        .navigationTitle(copy("资料库", "Library"))
        .searchable(text: $query, prompt: copy("搜索标题、内容或来源", "Search title, content or source"))
        .navigationDestination(isPresented: Binding(
            get: { state.selectedMaterialID != nil },
            set: { if !$0 { state.selectedMaterialID = nil } }
        )) {
            NativeFrontendMaterialDetail(state: state)
        }
    }
}

@MainActor
private struct NativeFrontendMaterialDetail: View {
    @Environment(\.locale) private var locale
    private var copy: NativeLibraryMemoryCopy { .init(locale: locale) }
    let state: NativeFrontendState
    @State private var preview: MaterialPreview?

    var body: some View {
        List {
            NativeLibraryMemoryBoundary()
            if let material = state.materials.first(where: { $0.id == state.selectedMaterialID }) {
                Section(material.title) { Text(material.content).textSelection(.enabled) }
                Section(copy("来源与归属", "Source and journey")) {
                    Text(material.source)
                    if let id = material.journeyID,
                       let journey = state.journeys.first(where: { $0.id == id }) {
                        Button { state.openJourney(id) } label: { Label(journey.title, systemImage: "map") }
                            .accessibilityIdentifier("frontend.library.openJourney")
                    } else { Text(copy("未关联旅程", "No linked journey")).foregroundStyle(.secondary) }
                    Button(copy("带着这份资料继续对话", "Continue in chat with this material")) {
                        state.openLibraryMaterialChat(material.id, locale: locale)
                    }.accessibilityIdentifier("frontend.library.openChat")
                }
                Section(copy("资料操作", "Material actions")) {
                    Button(material.saved ? copy("撤销保存", "Unsave") : copy("保存资料", "Save material")) { state.toggleLibrarySave(material.id, locale: locale) }
                        .accessibilityIdentifier("frontend.library.toggleSave")
                    Button(copy("导出预览", "Export preview")) { preview = .init(materialID: material.id, sharing: false) }
                        .accessibilityIdentifier("frontend.library.export")
                    Button(copy("分享预览", "Share preview")) { preview = .init(materialID: material.id, sharing: true) }
                        .accessibilityIdentifier("frontend.library.share")
                    Text(copy("保存仅改变本地收藏；导出预览不会创建文件；分享预览不会发送给任何人。", "Saving only changes local bookmarks. Export preview creates no file. Share preview sends nothing."))
                        .font(.caption).foregroundStyle(.secondary)
                }
                if let notice = state.notice { Section(copy("本地反馈", "Local feedback")) { Text(notice) } }
            } else { ContentUnavailableView(copy("资料已不可用", "Material unavailable"), systemImage: "doc") }
        }
        .navigationTitle(copy("资料详情", "Material details"))
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $preview) { item in NativeFrontendMaterialPreview(state: state, preview: item) }
    }
}

private struct MaterialPreview: Identifiable {
    let materialID: String
    let sharing: Bool
    var id: String { materialID + (sharing ? "-share" : "-export") }
}

@MainActor
private struct NativeFrontendMaterialPreview: View {
    @Environment(\.locale) private var locale
    private var copy: NativeLibraryMemoryCopy { .init(locale: locale) }
    let state: NativeFrontendState
    let preview: MaterialPreview
    @Environment(\.dismiss) private var dismiss
    @State private var audience = "同行人"
    @State private var confirmed = false
    private var audienceLabel: String {
        switch audience {
        case "同行人": copy("同行人", "Travel companions")
        case "仅自己": copy("仅自己", "Only me")
        default: audience
        }
    }

    var body: some View {
        NavigationStack {
            List {
                NativeLibraryMemoryBoundary()
                if let material = state.materials.first(where: { $0.id == preview.materialID }) {
                    Section(copy("预览内容", "Preview content")) { Text(material.title).font(.headline); Text(material.content); Text(material.source).font(.caption) }
                    if preview.sharing {
                        Section(copy("分享范围", "Sharing scope")) {
                            Picker(copy("预期受众", "Intended audience"), selection: $audience) {
                                Text(copy("同行人", "Travel companions")).tag("同行人")
                                Text(copy("仅自己", "Only me")).tag("仅自己")
                            }.accessibilityIdentifier("frontend.library.shareAudience")
                            .onChange(of: audience) { _, _ in confirmed = false }
                            Text(copy("包含资料正文和来源，可能含有个人旅行想法。请核对受众与内容。外部分享尚未发送。", "Includes the material text and source, which may contain personal travel ideas. Check the audience and content. Nothing has been sent."))
                            Button(copy("确认受众与预览", "Confirm audience and preview")) {
                                confirmed = true
                                state.notice = copy("已确认给", "Local share preview confirmed for ") + audienceLabel + copy("的本地分享预览。外部分享尚未发送。", ". Nothing has been sent.")
                            }.accessibilityIdentifier("frontend.library.confirmAudience")
                            if confirmed { Label(copy("预览已确认 · 尚未发送", "Preview confirmed · Not sent"), systemImage: "checkmark.circle") }
                        }
                    } else {
                        Text(copy("本地文字导出预览。尚未生成文件，也未分享。", "Local text export preview. No file has been created or shared."))
                        Button(copy("完成预览", "Finish preview")) { state.notice = copy("已查看本地导出预览，未创建文件或发送。", "Local export preview viewed. No file created or content sent."); dismiss() }
                            .accessibilityIdentifier("frontend.library.finishExport")
                    }
                } else { Text(copy("资料已不可用，无法预览。", "Material unavailable. Preview cannot be opened.")) }
            }
            .navigationTitle(preview.sharing ? copy("分享预览", "Share preview") : copy("导出预览", "Export preview"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) {
                Button(preview.sharing ? copy("取消分享", "Cancel sharing") : copy("关闭", "Close")) {
                    if preview.sharing { state.notice = copy("已取消本地分享预览，未发送任何内容。", "Local share preview cancelled. Nothing was sent.") }
                    dismiss()
                }.accessibilityIdentifier("frontend.library.cancelPreview")
            } }
        }
    }
}

// Preserve the shared Chinese presentation; provide the same local-only states
// in English without editing Main-owned State/Boundary/StatePanel source.
@MainActor
struct NativeLibraryMemoryBoundary: View {
    @Environment(\.locale) private var locale
    var body: some View {
        if NativeLibraryMemoryCopy(locale: locale).isChinese {
            NativeFrontendBoundary()
        } else {
            Label("Local sample · Not connected to real services", systemImage: "info.circle")
                .font(.caption).foregroundStyle(.secondary).padding(.vertical, 6)
                .accessibilityIdentifier("frontend.sample.boundary")
        }
    }
}

@MainActor
struct NativeLibraryMemoryStatePanel: View {
    let state: NativeFrontendState
    @Environment(\.locale) private var locale
    var body: some View {
        if NativeLibraryMemoryCopy(locale: locale).isChinese {
            NativeFrontendStatePanel(state: state)
        } else {
            switch state.screenState {
            case .ready: EmptyView()
            case .empty:
                ContentUnavailableView("No content yet", systemImage: "tray",
                    description: Text("Start in chat, or return to the sample."))
            case .loading:
                VStack {
                    ProgressView()
                    Text("Demonstrating the loading state")
                    Button("Cancel loading") { state.screenState = .cancelled }
                }
            case .failed:
                ContentUnavailableView { Label("Unable to load", systemImage: "wifi.exclamationmark") }
                description: { Text("Local failure sample. No real request was sent.") }
                actions: { Button("Retry sample") { state.screenState = .ready } }
            case .cancelled:
                VStack {
                    Text("Loading cancelled")
                    Button("Return to content") { state.screenState = .ready }
                }
            }
        }
    }
}
