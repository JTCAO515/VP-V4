import Foundation

// UI-only values. No domain objects, persistence, or background execution.
struct NativeFrontendAssistantPersona: Equatable {
    var name: String
    var tagline: String
    var tone: String

    static let sample = Self(name: "VP", tagline: "陪你把旅行想法变成清楚的下一步", tone: "温和清楚")
    static let tones = ["温和清楚", "简洁直接", "轻松活泼"]

    var normalized: Self {
        Self(name: name.trimmingCharacters(in: .whitespacesAndNewlines),
             tagline: tagline.trimmingCharacters(in: .whitespacesAndNewlines), tone: tone)
    }
    var canSave: Bool {
        let value = normalized
        return (1...24).contains(value.name.count) && (1...80).contains(value.tagline.count)
            && Self.tones.contains(value.tone)
    }
    var preview: String {
        switch tone {
        case "简洁直接": "先看安排，再选你想调整的一步。"
        case "轻松活泼": "一起看看这份安排，慢慢找到你喜欢的节奏吧！"
        default: "我们可以先看看安排，再一起调整你在意的部分。"
        }
    }
}

struct NativeFrontendAssistantTodo: Identifiable {
    enum Status: String { case pending = "待处理", completed = "已完成示意", cancelled = "已取消示意" }
    let id: String
    let title: String
    let explanation: String
    var status: Status = .pending

    static let samples: [Self] = [
        .init(id: "sample-review", title: "检查两日安排", explanation: "仅演示待办操作。完成标记不会确认或修改真实 Trip。"),
        .init(id: "sample-rest", title: "想想需要的休息时间", explanation: "旅行偏好请到记忆页管理；这里仅演示待办，不创建预订。")
    ]
}

// Authored interface copy only. Never pass user content through translation heuristics.
struct NativeFrontendAssistantCopy {
    let locale: Locale
    func callAsFunction(_ zh: String, _ en: String) -> String {
        locale.language.languageCode?.identifier == "zh" ? zh : en
    }
}

enum NativeFrontendAssistantFeedback {
    case skippedFromDetail, skippedFromEditor, cancelled, saved, reset

    func message(locale: Locale) -> String {
        let copy = NativeFrontendAssistantCopy(locale: locale)
        switch self {
        case .skippedFromDetail:
            return copy("已跳过定制，可以继续使用默认人格，随时回来修改。", "Customization skipped. Keep the default personality and edit it anytime.")
        case .skippedFromEditor:
            return copy("已跳过定制，默认人格保留。", "Customization skipped. The default personality is unchanged.")
        case .cancelled:
            return copy("已取消，原人格保留。", "Cancelled. Your previous personality is unchanged.")
        case .saved:
            return copy("人格已保存到本次本地体验，未同步真实账号。", "Personality saved for this local experience. It was not synced to a real account.")
        case .reset:
            return copy("助手样例已重置，旅程、资料和记忆保留。", "Assistant sample reset. Journeys, materials and memories are unchanged.")
        }
    }
}

extension NativeFrontendAssistantPersona {
    static func toneTitle(_ tone: String, locale: Locale) -> String {
        let copy = NativeFrontendAssistantCopy(locale: locale)
        switch tone {
        case "温和清楚": return copy("温和清楚", "Warm and clear")
        case "简洁直接": return copy("简洁直接", "Short and direct")
        case "轻松活泼": return copy("轻松活泼", "Light and lively")
        default: return tone
        }
    }

    func preview(locale: Locale) -> String {
        let copy = NativeFrontendAssistantCopy(locale: locale)
        switch tone {
        case "简洁直接": return copy(preview, "Review the plan, then choose what to adjust.")
        case "轻松活泼": return copy(preview, "Let's explore this plan and find a pace you enjoy!")
        default: return copy(preview, "We can review the plan first, then adjust what matters to you together.")
        }
    }
}

extension NativeFrontendAssistantTodo.Status {
    func title(locale: Locale) -> String {
        let copy = NativeFrontendAssistantCopy(locale: locale)
        switch self {
        case .pending: return copy(rawValue, "Pending")
        case .completed: return copy(rawValue, "Completed · Sample")
        case .cancelled: return copy(rawValue, "Cancelled · Sample")
        }
    }
}
