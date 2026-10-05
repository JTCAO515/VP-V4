import SwiftUI

struct NativeTravelerBriefFieldView: View {
    let field: NativeTravelerBriefField
    let chinese: Bool
    private func t(_ zh: String, _ en: String) -> String { chinese ? zh : en }
    static func title(_ key: String, chinese: Bool) -> String {
        switch key {
        case "problem": chinese ? "此请求的问题说明" : "This request's issue description"
        case "travel_pace": chinese ? "旅行节奏" : "Travel pace"
        case "preference": chinese ? "明确偏好" : "Explicit preference"
        case "budget": chinese ? "每晚预算" : "Nightly budget"
        case "requirements": chinese ? "当前旅行需求" : "Current travel requirements"
        default: chinese ? "表达详细程度" : "Response detail"
        }
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(Self.title(field.field, chinese: chinese)).font(.headline)
            if let value = field.value {
                content(value)
                Text(t("显式提供", "Explicitly provided")).font(.caption)
                if let source = field.source {
                    Text(source.kind == "case" ? t("来源：此服务请求", "Source: this service request") : source.kind == "memory" ? t("来源：已保存的明确偏好", "Source: saved explicit preference") : source.kind == "profile_pace" ? t("来源：已保存旅行节奏", "Source: saved travel pace") : t("来源：当前旅行需求输入", "Source: current travel intake"))
                        .font(.caption)
                    Text(t("更新于 ", "Updated ") + Date(timeIntervalSince1970: source.updatedAt / 1000).formatted(date: .abbreviated, time: .shortened)).font(.caption)
                    Text("r\(source.revision) · \(source.id)").font(.caption2).textSelection(.enabled)
                }
            } else { Text(t("未知：没有当前合法来源可分享", "Unknown: no currently eligible source to share")).font(.footnote) }
        }
    }
    @ViewBuilder private func content(_ value: NativeTravelerBriefField.Value) -> some View {
        switch value {
        case .text(let text):
            if field.field == "travel_pace" { Text(pace(text)) } else { Text(text) }
        case .budget(let currency, let units):
            Text(Decimal(units) / 100, format: .currency(code: currency))
        case .requirements(let city, let duration, let party, let interests, let start, let end, let mobility):
            if let city { Text(city) }
            if let duration { Text(t("天数：\(duration)", "Days: \(duration)")) }
            if let party { Text(t("同行人数：\(party)", "Party size: \(party)")) }
            if let start, let end { Text("\(start) – \(end)") }
            if let interests { Text(interests.map(interest).joined(separator: " · ")) }
            if let mobility { ForEach(mobility, id: \.self) { Text($0) } }
        }
    }
    private func pace(_ value: String) -> String {
        switch value {
        case "relaxed": t("宽松", "Relaxed")
        case "balanced": t("均衡", "Balanced")
        case "packed": t("充实", "Packed")
        default: t("快节奏", "Fast")
        }
    }
    private func interest(_ value: String) -> String {
        switch value {
        case "food": t("美食", "Food")
        case "photography": t("摄影", "Photography")
        case "culture": t("文化", "Culture")
        default: t("自然", "Nature")
        }
    }
}
