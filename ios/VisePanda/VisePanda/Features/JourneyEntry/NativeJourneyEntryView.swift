import SwiftUI

/// Ephemeral presentation only. The caller supplies current, owner-qualified
/// projections; this view neither retains a transcript nor grants source access.
struct NativeJourneyEntryView: View {
    let chinese: Bool
    let goalText: String?
    let tripTitle: String?
    let unresolvedTasks: Int
    let memoryVersions: [Int]
    let canContinue: Bool
    let hasResult: Bool
    var goalReturn: NativeJourneyGoalReturnContext? = nil
    var currentGoalReturn: () -> NativeJourneyGoalReturnContext? = { nil }
    var discoverGoalReturn: ((NativeJourneyGoalReturnWire.Scope, NativeCommunitySafetyActor) async throws -> Data)? = nil
    var openGoalDecision: ((String, Int) -> Void)? = nil
    @Environment(AppSettings.self) private var settings
    @Binding var idea: String
    let continueIdea: () -> Void
    let openMaterials: () -> Void
    let openResult: () -> Void
    @FocusState private var focused: Bool
    private func t(_ zh: String, _ en: String) -> String { chinese ? zh : en }
    private var validIdea: Bool { NativeJourneyEntryContinuation.validIdea(idea) }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(t("从这里继续", "Start here, or pick up where you left off")).font(.headline)
            if let goalText {
                Text(t("正在接续：", "Continuing: ") + goalText).textSelection(.enabled)
                if let tripTitle { Text(t("当前关联行程：", "Current linked Trip: ") + tripTitle) }
                else { Text(t("尚无已核实的关联行程，可先继续这个目标。", "No verified linked Trip. You can continue this goal first.")) }
                if unresolvedTasks > 0 {
                    Text(t("\(unresolvedTasks) 项任务尚未完成；下方显示真实状态。", "\(unresolvedTasks) tasks are unfinished; their actual status appears below."))
                } else {
                    Text(t("当前没有已核实的新进展。", "No new progress has been verified."))
                }
                if !memoryVersions.isEmpty {
                    Text(t("本次明确选用的可用记忆版本：", "Eligible Memory versions explicitly selected for this request: ")
                         + memoryVersions.map(String.init).joined(separator: ", ")).font(.footnote)
                }
                if let goalReturn, let discoverGoalReturn, let openGoalDecision {
                    NativeJourneyGoalReturnView(selection: goalReturn, currentSelection: currentGoalReturn,
                        session: settings.nativeSession, chinese: chinese, discover: discoverGoalReturn, open: openGoalDecision)
                } else {
                    Text(t("上次决定以已保存成果为准；未读取时不作推断。", "Your saved result is the basis for the last decision; it is unknown until read."))
                        .font(.footnote)
                }
            } else {
                Text(t("一句想法就可以开始，日期可未定。先保留目标，再查看可保存的方向。", "Begin with one idea; dates can stay open. Keep the goal first, then explore directions you can save."))
            }
            TextField(t("你想做什么，或这次想改什么？", "What would you like to do or change?"), text: $idea, axis: .vertical)
                .lineLimit(2...6).focused($focused).accessibilityIdentifier("journeyEntry.idea")
            Button(t(goalText == nil ? "保留想法并开始" : "沿同一目标继续", goalText == nil ? "Keep this idea and begin" : "Continue the same goal")) {
                focused = false; continueIdea()
            }.disabled(!canContinue || !validIdea).accessibilityIdentifier("journeyEntry.continue")
            if idea.utf16.count > 4000 { Text(t("请缩短到4000字以内；不会截断你的输入。", "Shorten the input to 4,000 UTF-16 units; it will not be truncated.")) }
            Button(t("已有截图或安排", "I have a screenshot or existing arrangements"), action: openMaterials)
                .accessibilityIdentifier("journeyEntry.materials")
            if hasResult {
                Button(t("读取已保存成果与下一决定", "Read the saved result and next decision"), action: openResult)
                    .accessibilityIdentifier("journeyEntry.result")
            }
            Text(t("可以跳过补充问题。未授权、离线或配额不足时，已有成果仍按各自权限读取；没有可读来源会明确显示。", "You can skip extra questions. Existing results keep their own read permissions when consent, connectivity or quota prevents new work; unavailable sources are shown explicitly."))
                .font(.footnote)
        }
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button(t("完成", "Done")) { focused = false }
            }
        }
    }
}
