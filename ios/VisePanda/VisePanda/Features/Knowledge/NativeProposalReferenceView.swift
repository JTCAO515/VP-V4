import SwiftUI

struct NativeProposalReferenceView: View {
    let store: NativeProposalReferenceStore
    let scope: NativeDataScope?
    let isActive: Bool
    let chinese: Bool
    @Environment(\.scenePhase) private var phase
    private func text(_ en: String, _ zh: String) -> String { chinese ? zh : en }
    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { _ in
            VStack(alignment: .leading, spacing: 12) {
                Text(text("Saved proposal reference", "已存提案引用")).font(.headline)
                if let value = store.visible(scope: scope, active: isActive && phase == .active) {
                    Text(text("A read-only reference to an existing proposal. Review its details and eligibility in the original proposal workflow.", "这是已有提案的只读引用。请在原提案流程重新核对正文与适用资格。"))
                    Text(text("Proposal record version", "提案记录版本") + ": v\(value.proposalRevision)")
                    Text(text("Result record version", "成果记录版本") + ": r\(value.artifactRevision)")
                    Text(text("Linked Trip base", "关联行程基础版本") + ": v\(value.tripVersion)")
                    Text(text("Eligible at this read. Eligibility can change; re-read the authoritative proposal before further use. Task and goal records describe an association, not who generated the proposal.", "本次读取时符合资格。资格可能变化，后续使用前须权威重新读取。Task 与目标记录说明关联，不代表提案由该 Task 生成。"))
                        .font(.footnote).foregroundStyle(Color.vpSecondaryText)
                } else if store.state == .loading && isActive && phase == .active { ProgressView() }
                else { Text(text("Reference unavailable or expired. Read the exact record again before using it.", "引用暂不可读或已过期，使用前请重新读取精确记录。")) }
            }.frame(maxWidth: .infinity, alignment: .leading)
                .padding().background(Color.vpSurface, in: RoundedRectangle(cornerRadius: 16))
        }
        .accessibilityIdentifier("proposal.reference.readonly")
        .onChange(of: isActive) { _, value in if !value { store.clear() } }
        .onChange(of: scope) { _, _ in store.clear() }
        .onChange(of: phase) { _, value in if value != .active { store.clear() } }
        .onDisappear { store.clear() }
    }
}
