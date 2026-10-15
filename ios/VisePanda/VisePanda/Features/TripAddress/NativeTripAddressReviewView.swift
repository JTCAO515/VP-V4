import SwiftUI

struct NativeTripAddressReviewView: View {
    let review: NativeTripAddressReview.Result
    let chinese: Bool
    private func text(_ en: String, _ zh: String) -> String { chinese ? zh : en }
    var body: some View {
        if !review.canConfirm || !review.changes.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text(text("Address changes", "地址变化")).font(.headline)
                if !review.canConfirm {
                    Text(text("The proposal's resulting addresses cannot be read reliably. Read the proposal again before confirming; rejection remains available.", "无法可靠读取此提议执行后的地址。请重新读取提议后再确认；仍可拒绝提议。"))
                        .accessibilityIdentifier("trip.address.review.unavailable")
                }
                ForEach(review.changes) { change in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(kind(change.kind)).font(.subheadline.bold())
                        Text(text("Before", "原内容")).font(.caption)
                        endpoint(change.before)
                        Text(text("After", "新内容")).font(.caption)
                        endpoint(change.after)
                    }.accessibilityElement(children: .combine)
                }
                Text(text("User-provided addresses · Unverified. Source references are separate.", "用户提供的地址 · 未核验；来源参考单独保留。"))
                    .font(.caption).foregroundStyle(.secondary)
            }.accessibilityIdentifier("trip.address.review")
        }
    }
    @ViewBuilder private func endpoint(_ item: NativeTripAddressReview.Item?) -> some View {
        if let item {
            Text(item.title + " · " + item.location.dayID + "/" + item.location.itemID).font(.caption)
            Text(item.address?.text ?? text("Address not provided", "地址未提供")).textSelection(.enabled)
        } else { Text(text("Item not present", "项目不存在")) }
    }
    private func kind(_ kind: NativeTripAddressReview.Change.Kind) -> String {
        switch kind {
        case .added: text("Restore or add an item with an address", "恢复或新增带地址的项目")
        case .removed: text("Remove an item and its address", "移除项目及其地址")
        case .changed: text("Change or clear an address", "更改或清除地址")
        case .moved: text("Move an item and review its address", "移动项目并审阅地址")
        }
    }
}
