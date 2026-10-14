import SwiftUI

#if DEBUG
/// Mount with Main's existing NativeFrontendState environment; no parallel fixture store.
@MainActor
struct NativeFrontendExpressionView: View {
    @Environment(NativeFrontendState.self) private var state

    var body: some View {
        @Bindable var presentation = state
        VStack(alignment: .leading, spacing: 16) {
            NativeFrontendBoundary()
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("把话说清楚").font(.title.bold())
                    Text("保留原文，对照译文，再展示给对方。")
                        .font(.subheadline).foregroundStyle(.secondary)
                }
                Spacer(minLength: 12)
                Picker("页面体验状态", selection: $presentation.screenState) {
                    ForEach(NativeFrontendScreenState.allCases) { value in
                        Text(value.title).tag(value)
                    }
                }.pickerStyle(.menu).accessibilityIdentifier("frontend.expression.state")
            }
            if let material = state.materials.first(where: { $0.id == state.selectedMaterialID }) {
                contextLabel("资料上下文", material.title, icon: "doc.text")
            }
            if let journey = state.journeys.first(where: { $0.id == state.selectedJourneyID }) {
                contextLabel("行程上下文", journey.title, icon: "map")
            }
            if state.selectedMaterialID != nil || state.selectedJourneyID != nil {
                Text("上下文仅作页面提示，不会自动带入文字或发送翻译。")
                    .font(.caption).foregroundStyle(.secondary)
            }
            if state.screenState == .ready {
                NativeTranslationSampleExperienceView()
            } else {
                NativeFrontendStatePanel(state: state)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                if state.screenState == .empty {
                    Button("查看表达样例") { state.screenState = .ready }
                        .buttonStyle(.bordered).accessibilityIdentifier("frontend.expression.empty.return")
                }
            }
        }
        .padding()
        .background(Color.vpBackground)
        .navigationTitle("现场表达")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func contextLabel(_ title: String, _ value: String, icon: String) -> some View {
        Label {
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.caption).foregroundStyle(.secondary)
                Text(value).font(.subheadline)
            }
        } icon: { Image(systemName: icon).foregroundStyle(.secondary) }
        .padding(12).frame(maxWidth: .infinity, alignment: .leading)
        .background(.background, in: RoundedRectangle(cornerRadius: 14))
    }
}
#endif
