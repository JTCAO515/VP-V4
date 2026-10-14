import Foundation

@main
struct LibraryMemoryContract {
    @MainActor static func main() {
        let state = NativeFrontendState()
        let material = state.materials[0]
        precondition(state.libraryMaterials(query: "用户输入", savedOnly: false).map(\.id) == ["sample-note"])
        precondition(state.libraryMaterials(query: "江景", savedOnly: false).map(\.id) == [material.id])
        state.toggleLibrarySave(material.id)
        precondition(!state.materials[0].saved)
        precondition(state.libraryMaterials(query: "", savedOnly: true).count == 1)
        precondition(state.libraryMaterials(query: "", savedOnly: false).count == 2)
        state.toggleLibrarySave(material.id)
        precondition(state.materials[0].saved)
        state.openMaterial(material.id)
        precondition(state.selectedMaterialID == material.id && state.selectedTab == .library)
        state.openJourney(material.journeyID!)
        precondition(state.selectedTab == .journeys && state.selectedJourneyID == material.journeyID)
        state.openChat(context: material.content)
        precondition(state.selectedTab == .vp && state.chatContext == material.content)
        let old = state.memories[0]
        precondition(!state.correctLocalMemory(old.id, title: " ", scope: "旅行"))
        precondition(!state.correctLocalMemory(old.id, title: String(repeating: "字", count: 501), scope: "旅行"))
        precondition(!state.correctLocalMemory("missing", title: "有效", scope: "旅行"))
        precondition(state.memories[0].title == old.title)
        precondition(state.correctLocalMemory(old.id, title: " 少步行 ", scope: " 本次旅行 "))
        precondition(state.memories[0].id == old.id && state.memories[0].source == old.source)
        precondition(state.memories[0].title == "少步行" && state.memories[0].scope == "本次旅行")
        precondition(state.assistantTone == "温和清楚")
        state.restoreLocalMemories()
        precondition(state.memories[0].title == "少步行")
        state.forgetLocalMemory(old.id)
        precondition(state.memories.isEmpty)
        precondition(!state.correctLocalMemory(old.id, title: "不得复活", scope: "旅行"))
        state.restoreLocalMemories()
        precondition(state.memories.count == 1 && state.memories[0].id == old.id)
        precondition(state.materials.count == 2 && state.materials[0].saved)
        print("PASS: search, save/unsave, same-ID navigation, correction validation, source preservation, forget and explicit empty restore")
    }
}
