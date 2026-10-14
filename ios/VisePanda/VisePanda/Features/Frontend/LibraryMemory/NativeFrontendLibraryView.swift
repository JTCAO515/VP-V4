import SwiftUI

@MainActor
struct NativeFrontendLibraryView: View {
    let state: NativeFrontendState
    @State private var query = ""
    @State private var savedOnly = false

    var body: some View {
        List {
            Section {
                NativeFrontendBoundary()
                Text("你的想法与助手成果，都在这里。")
                    .font(.subheadline).foregroundStyle(.secondary)
                Toggle("只看已保存", isOn: $savedOnly)
                    .accessibilityIdentifier("frontend.library.savedFilter")
            }
            if state.screenState != .ready {
                NativeFrontendStatePanel(state: state)
                if state.screenState == .empty {
                    Button("返回正常样例") { state.screenState = .ready }
                }
            } else {
                let results = state.libraryMaterials(query: query, savedOnly: savedOnly)
                if results.isEmpty {
                    ContentUnavailableView("没有匹配资料", systemImage: "doc.text.magnifyingglass",
                        description: Text("试试其他关键词，或查看全部资料。"))
                    Button("查看全部资料") { query = ""; savedOnly = false }
                    Button("从对话开始") { state.openChat() }
                }
                ForEach(results) { material in
                    Button { state.openMaterial(material.id) } label: {
                        VStack(alignment: .leading, spacing: 8) {
                            HStack(alignment: .top) {
                                Text(material.title).font(.headline)
                                Spacer()
                                if material.saved { Image(systemName: "bookmark.fill").accessibilityLabel("已保存") }
                            }
                            Text(material.source).font(.caption).foregroundStyle(.secondary)
                            if let journey = state.journeys.first(where: { $0.id == material.journeyID }) {
                                Text("所属：\(journey.title)").font(.caption).foregroundStyle(.secondary)
                            }
                            Text(material.content).font(.subheadline).lineLimit(3).foregroundStyle(.secondary)
                        }.padding(.vertical, 6)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("frontend.library.material.\(material.id)")
                }
            }
            if let notice = state.notice { Section("本地反馈") { Text(notice).font(.subheadline) } }
        }
        .navigationTitle("资料库")
        .searchable(text: $query, prompt: "搜索标题、内容或来源")
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
    let state: NativeFrontendState
    @State private var preview: MaterialPreview?

    var body: some View {
        List {
            NativeFrontendBoundary()
            if let material = state.materials.first(where: { $0.id == state.selectedMaterialID }) {
                Section(material.title) { Text(material.content).textSelection(.enabled) }
                Section("来源与归属") {
                    Text(material.source)
                    if let id = material.journeyID,
                       let journey = state.journeys.first(where: { $0.id == id }) {
                        Button { state.openJourney(id) } label: { Label(journey.title, systemImage: "map") }
                            .accessibilityIdentifier("frontend.library.openJourney")
                    } else { Text("未关联旅程").foregroundStyle(.secondary) }
                    Button("带着这份资料继续对话") {
                        state.openChat(context: "资料：\(material.title)（\(material.id)）\n\(material.content)")
                    }.accessibilityIdentifier("frontend.library.openChat")
                }
                Section("资料操作") {
                    Button(material.saved ? "撤销保存" : "保存资料") { state.toggleLibrarySave(material.id) }
                        .accessibilityIdentifier("frontend.library.toggleSave")
                    Button("导出预览") { preview = .init(materialID: material.id, sharing: false) }
                        .accessibilityIdentifier("frontend.library.export")
                    Button("分享预览") { preview = .init(materialID: material.id, sharing: true) }
                        .accessibilityIdentifier("frontend.library.share")
                    Text("保存仅改变本地收藏；导出预览不会创建文件；分享预览不会发送给任何人。")
                        .font(.caption).foregroundStyle(.secondary)
                }
                if let notice = state.notice { Section("本地反馈") { Text(notice) } }
            } else { ContentUnavailableView("资料已不可用", systemImage: "doc") }
        }
        .navigationTitle("资料详情")
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
    let state: NativeFrontendState
    let preview: MaterialPreview
    @Environment(\.dismiss) private var dismiss
    @State private var audience = "同行人"
    @State private var confirmed = false

    var body: some View {
        NavigationStack {
            List {
                NativeFrontendBoundary()
                if let material = state.materials.first(where: { $0.id == preview.materialID }) {
                    Section("预览内容") { Text(material.title).font(.headline); Text(material.content); Text(material.source).font(.caption) }
                    if preview.sharing {
                        Section("分享范围") {
                            Picker("预期受众", selection: $audience) {
                                Text("同行人").tag("同行人")
                                Text("仅自己").tag("仅自己")
                            }.accessibilityIdentifier("frontend.library.shareAudience")
                            .onChange(of: audience) { _, _ in confirmed = false }
                            Text("包含资料正文和来源，可能含有个人旅行想法。请核对受众与内容。外部分享尚未发送。")
                            Button("确认受众与预览") {
                                confirmed = true
                                state.notice = "已确认给\(audience)的本地分享预览。外部分享尚未发送。"
                            }.accessibilityIdentifier("frontend.library.confirmAudience")
                            if confirmed { Label("预览已确认 · 尚未发送", systemImage: "checkmark.circle") }
                        }
                    } else {
                        Text("本地文字导出预览。尚未生成文件，也未分享。")
                        Button("完成预览") { state.notice = "已查看本地导出预览，未创建文件或发送。"; dismiss() }
                            .accessibilityIdentifier("frontend.library.finishExport")
                    }
                } else { Text("资料已不可用，无法预览。") }
            }
            .navigationTitle(preview.sharing ? "分享预览" : "导出预览")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) {
                Button(preview.sharing ? "取消分享" : "关闭") {
                    if preview.sharing { state.notice = "已取消本地分享预览，未发送任何内容。" }
                    dismiss()
                }.accessibilityIdentifier("frontend.library.cancelPreview")
            } }
        }
    }
}
