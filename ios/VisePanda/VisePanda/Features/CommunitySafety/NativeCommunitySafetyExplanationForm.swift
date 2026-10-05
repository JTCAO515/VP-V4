import SwiftUI

/// Input only; the caller rechecks its server selection before writing.
struct NativeCommunitySafetyExplanationForm: View {
    let chinese: Bool
    let title: String
    let purpose: String
    let limit: Int
    let stillEligible: () -> Bool
    let submit: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @State private var draft = NativeCommunitySafetyDraft()

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { _ in
            NavigationStack {
                Form {
                    if stillEligible() {
                        Section {
                            Text(purpose)
                            TextEditor(text: $draft.explanation)
                                .frame(minHeight: 120)
                                .accessibilityLabel(chinese ? "说明" : "Explanation")
                                .accessibilityIdentifier("community-safety-explanation")
                            Text("\(draft.boundedExplanation.utf16.count)/\(limit)").font(.caption)
                            Toggle(chinese ? "确认提交以上说明" : "Confirm submission of this explanation", isOn: $draft.confirmed)
                            Button(chinese ? "提交" : "Submit") {
                                guard stillEligible(), draft.isValid(limit: limit) else { return }
                                let value = draft.boundedExplanation
                                draft = .init(); dismiss(); submit(value)
                            }
                            .disabled(!draft.isValid(limit: limit))
                            .accessibilityIdentifier("community-safety-explanation-submit")
                        }
                    } else {
                        Text(chinese ? "此对象已失效，请返回并刷新。" : "This selection expired. Return and refresh.")
                    }
                }
                .navigationTitle(title)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button(chinese ? "取消" : "Cancel") { draft = .init(); dismiss() }
                    }
                }
                .onChange(of: stillEligible()) { _, eligible in
                    if !eligible { draft = .init(); dismiss() }
                }
            }
        }
        .onChange(of: scenePhase) { _, next in
            if next != .active { draft = .init(); dismiss() }
        }
        .onDisappear { draft = .init() }
    }
}
