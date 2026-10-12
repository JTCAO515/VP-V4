import SwiftUI

struct NativeJourneyGoalReturnView: View {
    let selection: NativeJourneyGoalReturnContext
    let currentSelection: () -> NativeJourneyGoalReturnContext?
    let session: NativeSession
    let chinese: Bool
    let discover: (NativeJourneyGoalReturnWire.Scope, NativeCommunitySafetyActor) async throws -> Data
    let open: (String, Int) -> Void
    var measurementAccepted: ((NativeJourneyGoalReturnContext, TimeInterval) -> Void)? = nil
    @Environment(\.scenePhase) private var phase
    @State private var store = NativeJourneyGoalReturnStore()
    @State private var refresh = UUID()
    private struct Load: Equatable { let current: NativeJourneyGoalReturnContext?; let refresh: UUID }
    private var current: NativeJourneyGoalReturnContext? {
        guard phase == .active, session.dataScope == selection.actor.scope,
              (try? session.communitySafetyActor()) == selection.actor,
              currentSelection() == selection else { return nil }
        return selection
    }
    private func t(_ zh: String, _ en: String) -> String { chinese ? zh : en }
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            TimelineView(.periodic(from: .now, by: 1)) { _ in
                if let value = store.visible(current: current) {
                    Text(t("此目标最后记录的决定", "Last recorded decision for this goal")).font(.headline)
                    Text(value.title); Text(value.summary)
                    Text(t("已明确选择：", "Explicitly chosen: ") + value.chosenOptionID)
                    Text(t("下一步尚无可核实依据，可继续同一目标。", "No next step is verified yet. You can continue the same goal."))
                        .font(.footnote)
                    Button(t("重读这份决定", "Reopen this decision")) {
                        guard current != nil, let live = store.visible(current: current) else { return }
                        open(live.reference.artifactID, live.reference.revision)
                    }.accessibilityIdentifier("journeyEntry.goalReturn.open")
                } else {
                    Text(t("当前目标的最后决定尚未核实。不会用旧选择替代。", "The last decision for this goal is unverified. An older choice is not substituted."))
                    if store.state == .loading { ProgressView() }
                }
            }
            Button(t("重新核对这个目标", "Recheck this goal")) { refresh = UUID() }
                .disabled(current == nil || store.state == .loading)
                .accessibilityIdentifier("journeyEntry.goalReturn.refresh")
        }
        .task(id: Load(current: current, refresh: refresh)) {
            guard let current, current.source.valid, !Task.isCancelled else { store.clear(); return }
            // Before discover GET and regardless of its result. Callback is
            // nonthrowing/nonblocking and absent until the qualified gateway.
            measurementAccepted?(current, ProcessInfo.processInfo.systemUptime)
            await store.load(current, current: { self.current },
                discover: { try await discover($0, selection.actor) },
                read: { try await session.fiveResultRequest(artifactID: $0, revision: $1) })
        }
        .task(id: store.state == .loading ? store.requestGeneration : nil) {
            guard store.state == .loading else { return }
            let own = store.requestGeneration
            do { try await Task.sleep(for: .seconds(20)) } catch { return }
            store.expireRequest(own)
        }
        .onChange(of: session.assistantEventsInvalidation?.id) { _, _ in
            guard let signal = session.assistantEventsInvalidation,
                  signal.matches(scope: selection.actor.scope, sessionID: selection.actor.sessionID) else { return }
            store.clear()
        }
        .onChange(of: session.resultDataErasure?.id) { _, _ in store.clear() }
        .onChange(of: session.conversationDataErasure?.id) { _, _ in store.clear() }
        .onChange(of: session.turnDataErasure?.id) { _, _ in store.clear() }
        .onChange(of: session.memoryPreferences.profiles) { _, _ in store.clear() }
        .onDisappear { store.clear() }
    }
}
