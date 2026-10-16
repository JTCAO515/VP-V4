import SwiftUI

/// Embeddable sheet content. Main owns presentation, navigation and Store intents.
struct NativeQAHistoryView: View {
    let source: NativeQAHistorySource
    let chinese: Bool
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        // Re-read even when a closure's captured source changes without an observable notification.
        // Private rows and local search live only in the matching scope subtree.
        TimelineView(.animation) { _ in
            if scenePhase == .active, let snapshot = source.readable() {
                NativeQAHistoryContent(source: source, snapshot: snapshot, chinese: chinese)
                    .id(snapshot.scope)
            } else {
                ContentUnavailableView(
                    chinese ? "会话历史暂不可读" : "Session history unavailable",
                    systemImage: "lock",
                    description: Text(chinese ? "请返回对话核对登录和服务状态。" : "Return to the conversation to check sign-in and service status.")
                )
            }
        }
        .navigationTitle(chinese ? "会话历史" : "Session history")
        .background(Color.vpBackground)
        .accessibilityIdentifier("native.qa.history")
    }
}

private struct NativeQAHistoryContent: View {
    let source: NativeQAHistorySource
    let snapshot: NativeQAHistorySnapshot
    let chinese: Bool
    @State private var query = ""

    private func copy(_ zh: String, _ en: String) -> String { chinese ? zh : en }

    var body: some View {
        List {
            Section {
                TextField(copy("搜索会话名称", "Search session names"), text: $query)
                    .accessibilityIdentifier("native.qa.history.search")
                Button {
                    source.create(displayedScope: snapshot.scope)
                } label: {
                    Label(copy("新建会话", "New session"), systemImage: "plus.bubble")
                        .frame(minHeight: 44)
                }
                .disabled(snapshot.isLoading || !snapshot.canCreate)
                .accessibilityIdentifier("native.qa.history.create")
            }
            Section {
                if snapshot.isLoading {
                    HStack {
                        ProgressView()
                        Text(copy("正在读取会话…", "Loading sessions…"))
                    }.accessibilityElement(children: .combine)
                }
                if !snapshot.canSelect || !snapshot.canCreate {
                    Text(copy("目前可查看列表。请返回对话核对状态后，再切换或新建会话。", "You can read this list. Return to the conversation to check its state before switching or creating sessions."))
                        .font(.footnote).foregroundStyle(Color.vpSecondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                }
                switch NativeQAHistoryPresentation.state(snapshot, query: query) {
                case .loading:
                    EmptyView()
                case .empty:
                    Text(copy("暂无已保存的会话", "No saved sessions yet"))
                        .accessibilityIdentifier("native.qa.history.empty")
                case .noMatches:
                    Text(copy("没有匹配的会话，请尝试其他名称。", "No matching sessions. Try another name."))
                        .accessibilityIdentifier("native.qa.history.no-matches")
                case .sessions:
                    ForEach(NativeQAHistoryPresentation.filtered(snapshot.sessions, query: query)) { session in
                        row(session)
                    }
                }
            } header: {
                Text(copy("已保存的会话", "Saved sessions"))
            }
        }
        .scrollContentBackground(.hidden)
        .scrollDismissesKeyboard(.interactively)
    }

    private func row(_ session: NativeQASession) -> some View {
        Button {
            source.select(session.id, displayedScope: snapshot.scope)
        } label: {
            VStack(alignment: .leading, spacing: 6) {
                // Empty labels remain empty: no inferred semantic title.
                Text(verbatim: session.label).font(.body)
                    .fixedSize(horizontal: false, vertical: true)
                if snapshot.selectedID == session.id {
                    Label(copy("当前会话", "Current session"), systemImage: "checkmark.circle.fill")
                        .font(.subheadline)
                }
                Text(copy("创建：", "Created: ") + session.createdAt)
                Text(copy("更新：", "Updated: ") + session.updatedAt)
                Text(copy("会话编号：", "Session ID: ") + session.id)
                    .textSelection(.enabled)
            }
            .font(.caption).foregroundStyle(.primary)
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
        }
        .disabled(snapshot.isLoading || !snapshot.canSelect)
        .accessibilityElement(children: .combine)
        .accessibilityHint(copy("打开此会话", "Open this session"))
        .accessibilityIdentifier("native.qa.history.session.\(session.id)")
    }
}
