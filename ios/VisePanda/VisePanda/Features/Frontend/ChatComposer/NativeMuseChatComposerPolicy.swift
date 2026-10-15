import Foundation

/// Presentation guard only; the shared state remains the submission authority.
enum NativeMuseChatComposerPolicy {
    static let maximumCharacters = 2000

    static func showsVoice(for draft: String) -> Bool {
        draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    static func canSubmit(_ draft: String, blocked: Bool) -> Bool {
        !blocked && !showsVoice(for: draft) && draft.count <= maximumCharacters
    }
}

/// Static presentation copy only. Never accepts or translates a user's draft.
enum NativeMuseChatComposerText: CaseIterable {
    case start, inputHint, voice, send, limit, done, dismissKeyboard
    case attachment, expression, place, tools

    func value(locale: Locale) -> String {
        let chinese = locale.language.languageCode?.identifier == "zh"
        switch self {
        case .start: return chinese ? "开始聊天" : "Start chatting"
        case .inputHint:
            return chinese ? "输入本地样例消息，回车发送；键盘工具栏可收起键盘。"
                : "Type a local sample message. Press Return to send. Use the keyboard toolbar to dismiss the keyboard."
        case .voice: return chinese ? "设备端语音输入" : "On-device voice input"
        case .send: return chinese ? "发送本地样例消息" : "Send local sample message"
        case .limit:
            return chinese ? "请缩短到2000个字符以内，原文不会截断。"
                : "Shorten your message to 2000 characters or fewer. Your original text is kept in full."
        case .done: return chinese ? "完成" : "Done"
        case .dismissKeyboard: return chinese ? "完成输入，收起键盘" : "Finish typing and dismiss the keyboard"
        case .attachment: return chinese ? "附件 · 本地样例" : "Attachment · Local sample"
        case .expression: return chinese ? "表达 · 本地样例" : "Expression · Local sample"
        case .place: return chinese ? "地点 · 本地样例" : "Place · Local sample"
        case .tools: return chinese ? "添加附件、表达或地点 · 本地样例" : "Add attachment, expression or place · Local sample"
        }
    }
}
