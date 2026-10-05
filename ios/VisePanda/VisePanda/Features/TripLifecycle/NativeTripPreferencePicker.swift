import SwiftUI

struct NativeTripPreferencePicker: View {
    @Binding var review: NativeTripPreferenceReview
    let chinese: Bool
    var disabled = false

    private func t(_ zh: String, _ en: String) -> String { chinese ? zh : en }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(t("为下次旅行保留哪些偏好？", "Which preferences should carry forward?"))
                .font(.headline)
            Text(t("只展示你已明确同意保存的偏好。逐项选择或跳过；日期和临时限制留在当前行程。未选中的已存记忆不会因此被删除或撤回。",
                   "Only preferences you explicitly agreed to save appear here. Select each one or skip. Dates and temporary constraints stay with this Trip. This choice does not delete or withdraw existing Memory."))
                .font(.footnote)
            if review.candidates.isEmpty {
                Text(t("没有可保留的已同意偏好，可以直接跳过。", "No consented preferences are available. You can skip."))
            }
            ForEach(review.candidates) { profile in
                Toggle(profile.summary ?? "", isOn: Binding(
                    get: { review.selectedIDs.contains(profile.id) },
                    set: { review.select(profile.id, keep: $0) }
                ))
                .accessibilityIdentifier("trip.lifecycle.preference.\(profile.id)")
            }
        }
        .disabled(disabled)
        .accessibilityElement(children: .contain)
    }
}
