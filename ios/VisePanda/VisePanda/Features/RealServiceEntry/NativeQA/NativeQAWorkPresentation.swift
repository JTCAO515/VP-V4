import Foundation

/// Text and hierarchy only; never creates an admission, receipt, permission or progress estimate.
struct NativeQAWorkPresentation: Equatable {
    enum Tone { case neutral, information, attention, positive }
    enum Action { case none, signIn, consent, refresh, createSession, chooseSession, compose }
    let title: String
    let detail: String
    let symbol: String
    let tone: Tone
    let action: Action
    let actionTitle: String

    @MainActor static func current(store: NativeQAStore, chinese: Bool, visible: Bool) -> Self {
        func text(_ zh: String, _ en: String) -> String { chinese ? zh : en }
        func card(_ zh: String, _ en: String, _ detailZH: String, _ detailEN: String,
                  _ symbol: String, _ tone: Tone, _ action: Action = .none, _ actionZH: String = "", _ actionEN: String = "") -> Self {
            .init(title: text(zh, en), detail: text(detailZH, detailEN), symbol: symbol, tone: tone,
                  action: action, actionTitle: text(actionZH, actionEN))
        }
        guard visible else { return card("对话已暂停", "Conversation paused", "回到此页后会重新核对服务状态。", "Returning to this page will check the service state again.", "pause.circle", .neutral) }
        guard store.scope != nil else { return card("登录后开始对话", "Sign in to start", "使用账户入口登录，即可读取自己的会话。", "Sign in through your account to read your own sessions.", "person.crop.circle", .neutral, .signIn, "前往登录", "Sign in") }
        switch store.state {
        case .inactive, .loading:
            return card("正在核对服务状态", "Checking service state", "正在读取当前账户与会话，请稍候。", "Reading the current account and session. Please wait.", "arrow.triangle.2.circlepath", .information)
        case .signedOut:
            return card("请重新登录", "Sign in again", "当前登录已不可用，请从账户入口继续。", "The current sign-in is unavailable. Continue through your account.", "person.crop.circle.badge.exclamationmark", .attention, .signIn, "前往登录", "Sign in")
        case .unknown:
            return uncertain(chinese: chinese)
        case .pending:
            if store.messages.contains(where: { $0.status == .reconciliationRequired }) { return uncertain(chinese: chinese) }
            return card("请求已受理，正在处理", "Request accepted, still processing", "尚未完成。核对结果会读取这次请求的当前状态。", "It has not completed. Checking reads the current state of this request.", "clock", .information, .refresh, "核对结果", "Check result")
        case .unavailable:
            return card("暂时无法连接服务", "Service unavailable", "暂时没有读到可靠的服务状态。可以再次核对，未确认请求会保留。", "A reliable service state could not be read. Check again; unconfirmed requests remain retained.", "network.slash", .attention, .refresh, "核对服务状态", "Check service state")
        case .blocked(let code):
            if code == "CONSENT_REQUIRED" {
                let withdrawn = store.policy?.consentState == .withdrawn
                return card(withdrawn ? "服务同意已撤回" : "开始前，请阅读服务说明", withdrawn ? "Service consent withdrawn" : "Read the service notice first",
                            "下方说明会列出服务提供方与接收方。只有你明确同意后才继续。", "The notice below identifies the provider and recipient. Continue only after you explicitly agree.", "doc.text", .neutral, .consent, "同意说明并继续", "Agree and continue")
            }
            if ["NOTICE_CHANGED", "PENDING_NOTICE_CHANGED"].contains(code) {
                return card("服务说明有变化", "The service notice changed", "请阅读最新说明。原请求不会改绑或重新发送；核对结果只读取已保存状态。", "Read the latest notice. The original request will not be rebound or resent; checking only reads saved state.", "doc.text.magnifyingglass", .attention, .refresh, "核对结果", "Check result")
            }
            if code == "UNAUTHENTICATED" {
                return card("请重新登录", "Sign in again", "登录状态已不可用。原请求仍保留，不会重新发送。", "Sign-in is unavailable. The original request remains retained and will not be resent.", "person.crop.circle", .attention, .signIn, "前往登录", "Sign in")
            }
            return card("当前无法继续", "Cannot continue right now", "登录、权限或服务说明需要重新核对。原请求不会自动重发。", "Sign-in, access or the service notice needs checking. The original request will not be resent automatically.", "exclamationmark.shield", .attention, .refresh, "核对结果", "Check result")
        case .ready:
            if store.selectedID == nil {
                if store.sessions.isEmpty {
                    return card("从一个问题开始", "Start with a question", "先开始一个会话，再说说你的想法；不需要先填写完整行程。", "Start a session and share your idea. You do not need a complete itinerary first.", "bubble.left.and.bubble.right", .neutral, .createSession, "开始对话", "Start a conversation")
                }
                return card("继续已保存的对话", "Continue a saved conversation", "选择原会话即可读回问题与结果，也可以开始新会话。", "Choose the original session to read its questions and results, or start a new one.", "clock.arrow.circlepath", .neutral, .chooseSession, "选择会话", "Choose a session")
            }
            if let message = store.messages.last {
                let value = messageCard(message.status, chinese: chinese)
                let full = store.policy?.maxTurns.map { store.messages.count >= $0 } ?? false
                if full {
                    return .init(title: value.title, detail: value.detail + text(" 本会话已到提问上限；已有结果仍可重开。", " This session has reached its question limit; saved results remain readable."), symbol: value.symbol, tone: value.tone, action: .createSession, actionTitle: text("开始新会话", "Start a new session"))
                }
                if [.blocked, .technicalFailure].contains(message.status) {
                    return .init(title: value.title, detail: value.detail, symbol: value.symbol, tone: value.tone,
                                 action: .refresh, actionTitle: text("核对结果", "Check result"))
                }
                return .init(title: value.title, detail: value.detail, symbol: value.symbol, tone: value.tone,
                             action: .compose, actionTitle: text(message.status == .clarification ? "补充后继续" : "继续提问", message.status == .clarification ? "Continue with details" : "Ask a follow-up"))
            }
            return card("想聊些什么？", "What would you like to ask?", "说说想法、已有安排或正在遇到的问题。回答会保留在此会话中。", "Share an idea, existing plans or a question. Answers stay in this session.", "text.bubble", .neutral, .compose, "输入问题", "Write a question")
        }
    }
    static func uncertain(chinese: Bool) -> Self {
        .init(title: chinese ? "还没确认结果" : "The result is not confirmed",
              detail: chinese ? "已保留这次请求。核对只读取原结果，不会重新发送。" : "This request is retained. Checking only reads its original result and will not resend it.",
              symbol: "questionmark.bubble", tone: .attention, action: .refresh,
              actionTitle: chinese ? "核对结果" : "Check result")
    }
    static func messageCard(_ status: NativeQAMessage.Status, chinese: Bool) -> Self {
        func text(_ zh: String, _ en: String) -> String { chinese ? zh : en }
        let title: String, detail: String, symbol: String, tone: Tone
        switch status {
        case .pending:
            title = text("请求已受理，正在处理", "Request accepted, still processing")
            detail = text("尚未完成，可以核对当前结果。", "It has not completed. You can check its current result."); symbol = "clock"; tone = .information
        case .reconciliationRequired: return uncertain(chinese: chinese)
        case .answered:
            title = text("回答已保存", "Answer saved")
            detail = text("可在本会话继续提问，或稍后重开阅读。", "Continue in this session, or reopen it later to read the answer."); symbol = "checkmark.bubble"; tone = .positive
        case .partial:
            title = text("已有部分结果", "Partial result available")
            detail = text("请先阅读已有内容；其中仍有未完成的部分。", "Read what is available; some parts remain incomplete."); symbol = "text.bubble"; tone = .attention
        case .clarification:
            title = text("需要你补充一点信息", "More information is needed")
            detail = text("阅读下方问题，补充后继续同一会话。", "Read the question below and continue in the same session with the details."); symbol = "bubble.left.and.text.bubble.right"; tone = .information
        case .blocked:
            title = text("这次请求暂时受阻", "This request is blocked")
            detail = text("阅读下方已有说明，核对需要的资料或权限后再继续。", "Read any explanation below and check the required information or access before continuing."); symbol = "exclamationmark.shield"; tone = .attention
        case .technicalFailure:
            title = text("这次处理遇到技术问题", "Processing hit a technical problem")
            detail = text("这不是完成结果。可以核对已保存状态后再决定下一步。", "This is not a completed result. Check saved state before deciding what to do next."); symbol = "exclamationmark.bubble"; tone = .attention
        }
        return .init(title: title, detail: detail, symbol: symbol, tone: tone, action: .none, actionTitle: "")
    }
}
