import SwiftUI

struct NativeCommunityPreview: View {
    let draft: NativeCommunityDraft
    let chinese: Bool
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(chinese ? "投稿预览" : "Submission preview").font(.headline)
            Text(draft.kind == "help" ? (chinese ? "求助" : "Request for help") : (chinese ? "旅行体验" : "Travel experience")).font(.caption)
            Text(draft.title).font(.title3).textSelection(.enabled)
            Text(draft.content).textSelection(.enabled)
            if !draft.benefitDisclosure.isEmpty { Text((chinese ? "自述利益关系：" : "Reported interests: ") + draft.benefitDisclosure) }
            if let place = draft.place { Text((chinese ? "关联地点：" : "Associated place: ") + place.label) }
            else { Text(chinese ? "已明确选择不关联地点" : "You explicitly chose no place association") }
            Text(chinese ? "仅发送给内部审核人员。审核通过仍不会公开，也不会成为事实或自动写入行程。" : "Sent to internal reviewers only. Approval does not publish this content, turn it into a fact or write to a Trip.")
                .font(.footnote).foregroundStyle(.secondary)
        }.accessibilityIdentifier("community.preview")
    }
}
