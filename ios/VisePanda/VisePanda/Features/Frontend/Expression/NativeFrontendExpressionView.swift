import SwiftUI

#if DEBUG
/// Mount with Main's existing NativeFrontendState environment; no parallel fixture store.
@MainActor
struct NativeFrontendExpressionView: View {
    @Environment(NativeFrontendState.self) private var state
    @Environment(\.locale) private var locale

    private func copy(_ zh: String, _ en: String) -> String {
        locale.language.languageCode?.identifier == "zh" ? zh : en
    }

    private func screenTitle(_ value: NativeFrontendScreenState) -> String {
        switch value {
        case .ready: copy("正常", "Ready")
        case .empty: copy("空白", "Empty")
        case .loading: copy("加载中", "Loading")
        case .failed: copy("失败", "Failed")
        case .cancelled: copy("取消", "Cancelled")
        }
    }

    var body: some View {
        @Bindable var presentation = state
        VStack(alignment: .leading, spacing: 16) {
            NativeFrontendBoundary()
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(copy("把话说清楚", "Say it clearly")).font(.title.bold())
                    Text(copy("保留原文，对照译文，再展示给对方。", "Keep the original, compare the translation, then show it to someone."))
                        .font(.subheadline).foregroundStyle(.secondary)
                }
                Spacer(minLength: 12)
                Picker(copy("页面体验状态", "Page sample state"), selection: $presentation.screenState) {
                    ForEach(NativeFrontendScreenState.allCases) { value in
                        Text(screenTitle(value)).tag(value)
                    }
                }.pickerStyle(.menu).accessibilityIdentifier("frontend.expression.state")
            }
            if let material = state.materials.first(where: { $0.id == state.selectedMaterialID }) {
                contextLabel(copy("资料上下文", "Material context"), material.title, icon: "doc.text")
            }
            if let journey = state.journeys.first(where: { $0.id == state.selectedJourneyID }) {
                contextLabel(copy("行程上下文", "Journey context"), journey.title, icon: "map")
            }
            if state.selectedMaterialID != nil || state.selectedJourneyID != nil {
                Text(copy("上下文仅作页面提示，不会自动带入文字或发送翻译。", "Context is shown for reference only. Text is not automatically copied or sent for translation."))
                    .font(.caption).foregroundStyle(.secondary)
            }
            if state.screenState == .ready {
                NativeTranslationSampleExperienceView()
            } else {
                NativeFrontendStatePanel(state: state)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                if state.screenState == .empty {
                    Button(copy("查看表达样例", "View expression sample")) { state.screenState = .ready }
                        .buttonStyle(.bordered).accessibilityIdentifier("frontend.expression.empty.return")
                }
            }
        }
        .padding()
        .background(Color.vpBackground)
        .navigationTitle(copy("现场表达", "Expression"))
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
