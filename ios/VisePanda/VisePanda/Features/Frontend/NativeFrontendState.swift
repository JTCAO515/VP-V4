import SwiftUI
import Observation

// Presentation fixtures only. This store has no transport, credentials or persistence.
// Production NativeSession and domain stores remain the business authorities.
@MainActor @Observable
final class NativeFrontendState {
    var selectedTab: AppTab = .vp
    var selectedJourneyID: String?
    var selectedMaterialID: String?
    var chatContext: String?
    var draft = ""
    var messages: [NativeFrontendMessage] = []
    private(set) var activeLocalConversationID = "local-current"
    private(set) var localConversations: [NativeFrontendConversation] = [
        .init(id: "local-current", title: "新对话", messages: [], draft: "", context: nil, pendingConfirmation: false),
        .init(id: "sample-history", title: "上海漫步 · 本地样例", messages: [
            .init(id: "history-user", user: true, text: "想让上海的两日安排宽松一些。"),
            .init(id: "history-result", user: false, text: "本地历史样例：可以查看两日安排并继续调整。真实历史会话服务尚未连接。")
        ], draft: "", context: "sample-shanghai", pendingConfirmation: false)
    ]
    var journeys: [NativeFrontendJourney] = [.init(id: "sample-shanghai", title: "上海漫步 · 体验示例", subtitle: "两天的城市探索", days: ["第一天 · 城市与江景", "第二天 · 街区与休息"], confirmed: false)]
    var materials: [NativeFrontendMaterial] = [
        .init(id: "sample-plan", title: "上海两日安排", content: "第一天：城市漫步与江景；第二天：街区探索。地点与顺序用于界面体验，不代表已核实营业、路线或预订。", source: "助手产出 · 本地样例", journeyID: "sample-shanghai", saved: true),
        .init(id: "sample-note", title: "我的旅行想法", content: "想留出休息时间，喜欢步行和安静的街区。", source: "用户输入 · 本地样例", journeyID: "sample-shanghai", saved: true)
    ]
    var memories: [NativeFrontendMemory] = [.init(id: "sample-pace", title: "喜欢宽松的步行节奏", scope: "旅行规划", source: "体验示例中的旅行想法")]
    var assistantName = "VP"
    var assistantTagline = "陪你把旅行想法变成清楚的下一步"
    var assistantTone = "温和清楚"
    var customized = false
    var pendingConfirmation = false
    var notice: String?
    var screenState: NativeFrontendScreenState = .ready

    func openJourney(_ id: String) {
        guard journeys.contains(where: { $0.id == id }) else { return }
        selectedJourneyID = id; selectedTab = .journeys
    }
    func openMaterial(_ id: String) {
        guard materials.contains(where: { $0.id == id }) else { return }
        selectedMaterialID = id; selectedTab = .library
    }
    func openChat(context: String? = nil) {
        chatContext = context; selectedTab = .vp; saveActiveLocalConversation()
    }
    func startLocalConversation() {
        saveActiveLocalConversation()
        if messages.isEmpty && draft.isEmpty && chatContext == nil && !pendingConfirmation {
            selectedTab = .vp; return
        }
        let next = NativeFrontendConversation(id: "local-" + UUID().uuidString, title: "新对话", messages: [], draft: "", context: nil, pendingConfirmation: false)
        localConversations.insert(next, at: 0)
        activateLocalConversation(next)
    }
    func selectLocalConversation(_ id: String) {
        guard id != activeLocalConversationID,
              let next = localConversations.first(where: { $0.id == id }) else { return }
        saveActiveLocalConversation(); activateLocalConversation(next)
    }
    private func activateLocalConversation(_ next: NativeFrontendConversation) {
        activeLocalConversationID = next.id; messages = next.messages; draft = next.draft
        chatContext = next.context; pendingConfirmation = next.pendingConfirmation
        screenState = .ready; selectedTab = .vp; notice = nil
    }
    private func saveActiveLocalConversation() {
        guard let index = localConversations.firstIndex(where: { $0.id == activeLocalConversationID }) else { return }
        localConversations[index].messages = messages; localConversations[index].draft = draft
        localConversations[index].context = chatContext
        localConversations[index].pendingConfirmation = pendingConfirmation
        if let first = messages.first(where: { $0.user }) {
            localConversations[index].title = String(first.text.prefix(28))
        }
    }
    func submit() {
        let input = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !input.isEmpty, input.count <= 2000 else { notice = "请输入 1–2000 个字符。"; return }
        messages.append(.init(id: UUID().uuidString, user: true, text: input))
        draft = ""
        messages.append(.init(id: UUID().uuidString, user: false, text: "本地演示回复：我们可以先看这份两日安排，或说明你想调整的内容。真实问答服务尚未连接。"))
        pendingConfirmation = true; saveActiveLocalConversation()
    }
    func confirmPlan() {
        guard pendingConfirmation,
              let index = journeys.firstIndex(where: { $0.id == "sample-shanghai" }) else { return }
        journeys[index].confirmed = true; pendingConfirmation = false
        notice = "已确认本地样例安排。未写入真实 Trip，也没有预订服务。"
        saveActiveLocalConversation()
    }
    func cancelPlan() { pendingConfirmation = false; notice = "已取消这次样例调整，原安排保留。"; saveActiveLocalConversation() }
#if DEBUG
    func loadLongLocalConversationSample() {
        startLocalConversation()
        messages = (0..<32).map { index in
            NativeFrontendMessage(id: "long-local-\(index)", user: index.isMultiple(of: 2),
                text: "本地滚动样例 \(index + 1) · " + String(repeating: "只验证长对话阅读与返回，未连接真实服务。", count: 4))
        }
        draft = ""; chatContext = nil; pendingConfirmation = false; notice = nil
        saveActiveLocalConversation()
    }
#endif
    func reset() {
        let fresh = NativeFrontendState()
        localConversations = fresh.localConversations; activeLocalConversationID = fresh.activeLocalConversationID
        journeys = fresh.journeys; materials = fresh.materials; memories = fresh.memories; messages = fresh.messages
        assistantName = fresh.assistantName; assistantTagline = fresh.assistantTagline
        assistantTone = fresh.assistantTone; customized = false
        selectedTab = .vp
        draft = ""; pendingConfirmation = false; selectedJourneyID = nil; selectedMaterialID = nil
        chatContext = nil; screenState = .ready; notice = "体验示例已重置。"
    }
}

enum NativeFrontendScreenState: String, CaseIterable, Identifiable {
    case ready, empty, loading, failed, cancelled
    var id: String { rawValue }
    var title: String {
        switch self { case .ready: "正常"; case .empty: "空白"; case .loading: "加载中"; case .failed: "失败"; case .cancelled: "取消" }
    }
}
struct NativeFrontendConversation: Identifiable {
    let id: String
    var title: String
    var messages: [NativeFrontendMessage]
    var draft: String
    var context: String?
    var pendingConfirmation: Bool
}
struct NativeFrontendMessage: Identifiable { let id: String; let user: Bool; let text: String }
struct NativeFrontendJourney: Identifiable { let id: String; var title: String; let subtitle: String; let days: [String]; var confirmed: Bool }
struct NativeFrontendMaterial: Identifiable { let id: String; var title: String; var content: String; let source: String; let journeyID: String?; var saved: Bool }
struct NativeFrontendMemory: Identifiable { let id: String; var title: String; var scope: String; let source: String }

struct NativeFrontendBoundary: View {
    var body: some View {
        Label("体验示例 · 未连接真实服务", systemImage: "info.circle")
            .font(.caption).foregroundStyle(.secondary).padding(.vertical, 6)
            .accessibilityIdentifier("frontend.sample.boundary")
    }
}
struct NativeFrontendStatePanel: View {
    let state: NativeFrontendState
    var body: some View {
        switch state.screenState {
        case .ready: EmptyView()
        case .empty: ContentUnavailableView("还没有内容", systemImage: "tray", description: Text("可以从对话开始，或返回正常样例。"))
        case .loading: VStack { ProgressView(); Text("正在演示加载状态"); Button("取消加载") { state.screenState = .cancelled } }
        case .failed: ContentUnavailableView { Label("暂时无法加载", systemImage: "wifi.exclamationmark") } description: { Text("这是本地失败示例，没有发送真实请求。") } actions: { Button("重试样例") { state.screenState = .ready } }
        case .cancelled: VStack { Text("本次加载已取消"); Button("返回内容") { state.screenState = .ready } }
        }
    }
}
