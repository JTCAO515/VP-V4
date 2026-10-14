import Foundation

@main
struct MaterialChatContract {
    @MainActor static func main() {
        let state = NativeFrontendState()
        state.openMaterial("sample-plan")
        let selected = state.selectedMaterialID
        precondition(state.openLibraryMaterialChat("sample-plan"))
        precondition(state.chatContext == "sample-plan" && state.selectedTab == .vp)
        precondition(state.selectedMaterialID == selected)
        precondition(state.libraryChatText(materialID: "sample-plan") == "资料：上海两日安排\n" + state.materials[0].content)
        precondition(!state.libraryChatText(materialID: "sample-plan")!.contains("sample-plan"))
        // Exact material context is the existing Chat linkedJourneyID consumer contract.
        let consumer = ActualChatAssociation(state: state)
        func linkedJourney(_ context: String) -> String? { consumer.linkedJourneyID(for: context) }
        precondition(linkedJourney(state.chatContext!) == "sample-shanghai")
        state.openJourney(linkedJourney(state.chatContext!)!)
        precondition(state.selectedJourneyID == "sample-shanghai")
        state.materials[0].content = "资料更新后的正文"
        precondition(state.libraryChatText(materialID: "sample-plan") == "资料：上海两日安排\n资料更新后的正文")
        let oldContext = state.chatContext
        let oldTab = state.selectedTab
        precondition(!state.openLibraryMaterialChat("unknown"))
        precondition(state.chatContext == oldContext && state.selectedTab == oldTab && state.selectedMaterialID == selected)
        precondition(state.libraryChatText(materialID: "unknown") == nil && linkedJourney("unknown") == nil)
        state.materials.append(.init(id: "unlinked", title: "无旅程资料", content: "正文保留", source: "本地样例", journeyID: nil, saved: false))
        precondition(state.openLibraryMaterialChat("unlinked"))
        precondition(state.libraryChatText(materialID: "unlinked") == "资料：无旅程资料\n正文保留")
        precondition(linkedJourney(state.chatContext!) == nil)
        state.materials.append(.init(id: "orphan", title: "旧归属", content: "不造旅程", source: "本地样例", journeyID: "missing-journey", saved: false))
        precondition(state.openLibraryMaterialChat("orphan") && linkedJourney(state.chatContext!) == nil)
        precondition(state.openLibraryMaterialChat("sample-plan"))
        state.journeys.removeAll { $0.id == "sample-shanghai" }
        precondition(linkedJourney(state.chatContext!) == nil)
        state.materials.removeAll { $0.id == "sample-plan" }
        let beforeDeletedOpen = state.chatContext
        precondition(!state.openLibraryMaterialChat("sample-plan"))
        precondition(state.chatContext == beforeDeletedOpen)
        precondition(state.libraryChatText(materialID: "sample-plan") == nil && linkedJourney("sample-plan") == nil)
        precondition(!state.localConversations.isEmpty)
        print("PASS: 21 exact-ID/body/current-material/missing/deleted/unlinked/orphan/same-journey checks")
    }
}
