import Foundation

@main
@MainActor
struct FrontendStateChecks {
    static func main() {
        let state = NativeFrontendState()
        state.openJourney("missing")
        precondition(state.selectedTab == .vp && state.selectedJourneyID == nil)
        state.openJourney("sample-shanghai")
        precondition(state.selectedTab == .journeys && state.selectedJourneyID == "sample-shanghai")
        state.openMaterial("sample-plan")
        precondition(state.selectedTab == .library)
        precondition(state.materials.first(where: { $0.id == state.selectedMaterialID })?.journeyID == state.selectedJourneyID)
        state.openMaterial("missing")
        precondition(state.selectedMaterialID == "sample-plan")
        state.openChat(context: state.selectedJourneyID)
        precondition(state.selectedTab == .vp && state.chatContext == "sample-shanghai")
        let initialCount = state.messages.count
        state.draft = "   "; state.submit()
        precondition(state.messages.count == initialCount && !state.pendingConfirmation)
        state.draft = String(repeating: "x", count: 2001); state.submit()
        precondition(state.messages.count == initialCount && !state.pendingConfirmation)
        state.draft = "减少步行"; state.submit()
        precondition(state.draft.isEmpty && state.pendingConfirmation)
        precondition(state.messages.count == initialCount + 2 && !state.journeys[0].confirmed)
        state.cancelPlan()
        precondition(!state.journeys[0].confirmed && !state.pendingConfirmation)
        state.confirmPlan()
        precondition(!state.journeys[0].confirmed)
        state.draft = "确认演示安排"; state.submit(); state.confirmPlan()
        precondition(state.journeys[0].confirmed && !state.pendingConfirmation)
        state.memories.removeAll(); state.assistantName = "Local"; state.customized = true
        state.reset()
        precondition(!state.journeys[0].confirmed && state.memories.count == 1)
        precondition(state.assistantName == "VP" && !state.customized && state.selectedTab == .vp)
        precondition(state.selectedJourneyID == nil && state.selectedMaterialID == nil && state.chatContext == nil)
        precondition(state.messages.count == initialCount)
        print("PASS: cross-page object identity, invalid IDs, input bounds, explicit confirmation/cancellation, reset")
    }
}
