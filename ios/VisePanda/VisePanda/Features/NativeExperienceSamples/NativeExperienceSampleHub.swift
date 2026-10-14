import SwiftUI

#if DEBUG
enum NativeExperienceSamplePresentation: String, Identifiable {
    case overview
    var id: String { rawValue }
}

/// An explicit, temporary experience of the existing feature presentation.
/// This menu creates no identity, Trip, Task, provider request or measurement.
struct NativeExperienceSampleHub: View {
    @Environment(AppSettings.self) private var settings
    @Environment(\.dismiss) private var dismiss
    private var chinese: Bool { settings.selectedLocale == .zh }
    private func text(_ zh: String, _ en: String) -> String { chinese ? zh : en }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text(text("以下是固定交互样例，未连接真实服务。状态只在本页内存中；不会生成真实任务、发送模型请求或修改行程。", "These are fixed interaction samples, unconnected to real services. State stays in this page's memory; no real tasks, model requests or Trip edits are made."))
                        .accessibilityIdentifier("native.samples.boundary")
                }
                Section(text("体验现有功能", "Try the existing features")) {
                    NavigationLink {
                        NativePlaceActionsSampleExperience()
                    } label: {
                        Label(text("地点操作与候选确认 · 样例", "Place actions and candidate review · Sample"), systemImage: "mappin.and.ellipse")
                    }.accessibilityIdentifier("native.samples.places")
                    NavigationLink {
                        NativeTranslationSampleExperienceView()
                    } label: {
                        Label(text("中英表达与大字卡 · 样例", "Bilingual expression and large card · Sample"), systemImage: "text.bubble")
                    }.accessibilityIdentifier("native.samples.expression")
                }
            }
            .navigationTitle(text("体验示例", "Interaction samples"))
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(text("完成", "Done")) { dismiss() }
                        .accessibilityIdentifier("native.samples.done")
                }
            }
        }
    }
}
#endif
