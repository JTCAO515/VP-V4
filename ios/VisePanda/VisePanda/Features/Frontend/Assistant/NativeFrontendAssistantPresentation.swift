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
