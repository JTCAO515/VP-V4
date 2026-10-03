import SwiftUI

struct NativeSelectedSourcesView: View {
    @Bindable var store: NativeSelectedMessageStore
    let chinese: Bool
    let selectEvidence: () -> Void
    let linkedTrip: NativeSelectedSources.Trip?
    var body: some View {
        VStack(alignment:.leading,spacing:6) {
            if let artifact=store.sources.artifact {
                Text(chinese ? "明确引用成果 \(artifact.artifactId.prefix(8)) · r\(artifact.revision)" : "Explicit result reference \(artifact.artifactId.prefix(8)) · r\(artifact.revision)")
                Button(chinese ? "移除成果引用" : "Remove result reference") { store.sources.artifact=nil }.disabled(store.pending != nil)
            }
            if let linkedTrip, store.sources.trip == nil {
                Button(chinese ? "明确引用当前关联 Trip 版本" : "Reference the current linked Trip version") { store.sources.trip=linkedTrip }
                    .disabled(store.pending != nil).accessibilityIdentifier("assistant.source.trip.select")
            }
            if let trip=store.sources.trip {
                Text(chinese ? "Trip 引用 v\(trip.headVersion)，不是行程写入或确认" : "Trip reference v\(trip.headVersion), not a Trip write or confirmation")
                Button(chinese ? "移除 Trip 引用" : "Remove Trip reference") { store.sources.trip=nil }.disabled(store.pending != nil)
            }
            Button(chinese ? "明确选择已发布证据" : "Choose published evidence explicitly", action: selectEvidence)
                .disabled(store.pending != nil || store.sources.evidence.count >= 3).accessibilityIdentifier("assistant.source.evidence.select")
            ForEach(store.sources.evidence,id:\.factId) { evidence in
                Button(chinese ? "移除此证据引用" : "Remove this evidence reference") { store.sources.evidence.removeAll { $0.factId == evidence.factId } }.disabled(store.pending != nil)
                Text(chinese ? "明确第一方证据：\(evidence.city)/\(evidence.scene) · v\(evidence.assertionRevision)" : "Explicit first-party evidence: \(evidence.city)/\(evidence.scene) · v\(evidence.assertionRevision)")
            }
            if !store.sources.empty { Text(chinese ? "仅以这些精确版本继续或改口；不会新建付费任务，也不会自动确认 Trip。" : "Continue or amend with these exact versions only. No paid Task or automatic Trip confirmation.").font(.caption) }
            if store.contextUnavailable { Text(chinese ? "消息已接纳，但当前来源资格未确认；不能把引用当成当前建议。" : "Message accepted, but current source qualification was not confirmed; references are not current advice.").font(.caption) }
            if let manifest=store.manifest {
                ForEach(manifest.context.sourceRefs,id:\.id) { source in
                    if source.purpose == "previous_result_reference" {
                        Text(chinese ? "历史成果引用 · current=false · 仅第一方上下文，不是当前建议/确认资格" : "Historical result reference · current=false · first-party context only, not current advice or confirmation authority")
                            .accessibilityIdentifier("assistant.source.historical")
                    }
                }
                Text(chinese ? "来源版本已重新核对；预览未授权 provider 执行。" : "Source versions were rechecked. Preview does not authorize provider execution.").font(.caption)
            }
        }
    }
}
