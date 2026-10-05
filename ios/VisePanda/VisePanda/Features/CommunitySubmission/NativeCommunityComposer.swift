import SwiftUI

struct NativeCommunityComposer: View {
    @Binding var draft: NativeCommunityDraft
    let chinese: Bool
    let disabled: Bool
    let submit: (NativeCommunityDraft) -> Void
    @State private var preview: NativeCommunityDraft?
    var body: some View {
        Section(chinese ? "旅行体验／求助" : "Travel experience / request for help") {
            Picker(chinese ? "投稿类型" : "Submission type", selection: $draft.kind) {
                Text(chinese ? "旅行体验" : "Travel experience").tag("experience")
                Text(chinese ? "求助" : "Request for help").tag("help")
            }
            TextField(chinese ? "作者自述利益关系（可留空）" : "Author-reported interests (optional)", text: $draft.benefitDisclosure)
                .accessibilityIdentifier("community.benefit")
            TextField(chinese ? "标题" : "Title", text: $draft.title)
                .accessibilityIdentifier("community.title")
            TextEditor(text: $draft.content).frame(minHeight: 140)
                .accessibilityLabel(chinese ? "投稿正文" : "Submission text")
                .accessibilityIdentifier("community.content")
            Text("\(draft.title.utf16.count)/160 · \(draft.content.utf16.count)/4000")
                .font(.caption).foregroundStyle(.secondary)
            Toggle(chinese ? "同意将此投稿发给内部审核人员" : "I agree to send this submission to internal reviewers", isOn: $draft.consent)
                .accessibilityIdentifier("community.consent")
            Text(chinese ? "此处不是紧急服务。只发送你在预览中确认的文字，暂不对公众开放。" : "This is not an emergency service. Only the text you confirm in the preview is sent. Public access is closed.")
                .font(.footnote).foregroundStyle(.secondary)
            Button(chinese ? "预览并投稿" : "Preview submission") { preview = draft }
                .disabled(disabled || !draft.valid).accessibilityIdentifier("community.preview.open")
        }.disabled(disabled)
        .sheet(item: previewItem) { item in
            NavigationStack {
                Form {
                    NativeCommunityPreview(draft: item.draft, chinese: chinese)
                    Button(chinese ? "确认提交内部审核" : "Confirm internal submission") {
                        let frozen = item.draft; preview = nil
                        guard frozen.valid, !disabled, draft == frozen else { return }
                        submit(frozen)
                    }.accessibilityIdentifier("community.submit")
                }.navigationTitle(chinese ? "确认投稿" : "Confirm submission")
                    .toolbar { ToolbarItem(placement: .cancellationAction) { Button(chinese ? "取消" : "Cancel") { preview = nil } } }
            }
        }
    }
    private struct PreviewItem: Identifiable {
        let draft: NativeCommunityDraft
        var id: String { draft.title + "\u{0}" + draft.content }
    }
    private var previewItem: Binding<PreviewItem?> {
        Binding(get: { preview.map { PreviewItem(draft: $0) } }, set: { preview = $0?.draft })
    }
}
