import SwiftUI

/// Prepared opt-in UI only. Its owner injects the authenticated gateway after
/// the single Server WIRE/lifecycle contract is complete; defaults collect nothing.
struct NativeJourneyMeasurementNoticeView: View {
    let chinese: Bool
    var available = false
    var joined = false
    var identityGeneration: UUID? = nil
    var accept: (() async -> Bool)? = nil
    var withdraw: (() async -> Bool)? = nil
    var stopCollecting: (() -> Void)? = nil
    @State private var agrees = false
    @State private var busy = false
    @State private var notice: String?
    @State private var generation = UUID()
    @State private var pending: Task<Void, Never>?
    @Environment(\.scenePhase) private var phase
    private func t(_ zh: String, _ en: String) -> String { chinese ? zh : en }
    var body: some View {
        DisclosureGroup(t("帮助改进首次使用与回访体验 · 自愿", "Help improve first visits and returns · Optional")) {
            VStack(alignment: .leading, spacing: 12) {
                Text(t("仅用于评价首次使用、已有安排和回访中的可用成果、明确采用／保存及提问重复情况。我们只记录核对来源所需的最少标识、版本和事件元数据，不收集想法、对话或材料原文，不用于营销或训练。", "Used only to evaluate useful results, explicit adoption/saving and repeated questions during first visits, existing arrangements and returns. Only minimal source identifiers, revisions and event metadata are recorded; no original ideas, conversations or materials, marketing or training."))
                Text(t("记录最多保留30天。你可随时撤回，并通过这部分数据的导出和删除入口处理记录。拒绝或撤回不影响正常旅行功能。", "Records are retained for at most 30 days. You can withdraw at any time and use this data scope’s export and deletion controls. Declining or withdrawing does not affect travel features."))
                if !available {
                    Text(t("此版本尚未启用这项观测，不会采集。", "This observation is not enabled in this build; nothing is collected."))
                } else if joined {
                    Button(t("撤回并停止采集", "Withdraw and stop collection"), role: .destructive) {
                        guard !busy, phase == .active, identityGeneration != nil, let withdraw, let stopCollecting else { return }
                        stopCollecting(); busy = true
                        let own = generation
                        pending = Task {
                            let confirmed = await withdraw()
                            guard generation == own, !Task.isCancelled else { return }
                            busy = false; agrees = false
                            notice = confirmed ? t("已确认撤回。", "Withdrawal confirmed.")
                                : t("本机已停止采集；服务器撤回尚未确认，请重新核对。", "Device collection has stopped; server withdrawal is unconfirmed. Recheck it explicitly.")
                        }
                    }.disabled(busy || stopCollecting == nil || withdraw == nil)
                } else {
                    Toggle(t("我愿意按上述目的加入", "I want to join for this purpose"), isOn: $agrees)
                        .disabled(busy).accessibilityIdentifier("journeyMeasurement.optIn")
                    Button(t("明确加入", "Join explicitly")) {
                        guard agrees, !busy, phase == .active, identityGeneration != nil, let accept else { return }
                        busy = true; let own = generation
                        pending = Task {
                            let confirmed = await accept()
                            guard generation == own, !Task.isCancelled else { return }
                            busy = false; agrees = false
                            notice = confirmed ? t("服务器已确认这份独立同意。", "This separate consent was confirmed by the server.")
                                : t("同意未确认，未开启采集；旅行功能不受影响。", "Consent is unconfirmed; collection stays off and travel features are unaffected.")
                        }
                    }.disabled(!agrees || busy || accept == nil || identityGeneration == nil)
                }
                if let notice { Text(notice).font(.footnote) }
            }
        }
        .onChange(of: available) { _, _ in
            pending?.cancel(); pending = nil; generation = UUID(); agrees = false; busy = false; notice = nil
        }
        .onChange(of: identityGeneration) { _, _ in
            pending?.cancel(); pending = nil; generation = UUID(); agrees = false; busy = false; notice = nil
        }
        .onChange(of: phase) { _, phase in if phase != .active { pending?.cancel(); generation = UUID(); agrees = false; busy = false } }
        .onDisappear { pending?.cancel(); generation = UUID(); agrees = false; busy = false }
    }
}
