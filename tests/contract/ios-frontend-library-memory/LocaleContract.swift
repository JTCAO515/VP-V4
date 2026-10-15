import Foundation

@main
struct LibraryMemoryLocaleContract {
    @MainActor static func main() {
        let english = Locale(identifier: "en-US")
        let chinese = Locale(identifier: "zh-Hans-CN")
        precondition(NativeLibraryMemoryCopy(locale: english)("取消", "Cancel") == "Cancel")
        precondition(NativeLibraryMemoryCopy(locale: chinese)("取消", "Cancel") == "取消")
        precondition(NativeLibraryMemoryCopy(locale: Locale(identifier: "zh-Hant" )).isChinese)
        let state = NativeFrontendState()
        // Payloads deliberately look like fixed UI strings. They must not be translated.
        state.materials = [.init(id: "payload-id", title: "取消", content: "保存资料\n原文 그대로", source: "来源", journeyID: nil, saved: false)]
        let original = state.materials[0]
        precondition(state.libraryChatText(materialID: original.id, locale: english) == "Material: 取消\n保存资料\n原文 그대로")
        precondition(state.libraryChatText(materialID: original.id) == "资料：取消\n保存资料\n原文 그대로")
        state.toggleLibrarySave(original.id, locale: english)
        precondition(state.notice == "Local sample saved. Not synced to a service.")
        precondition(state.materials[0].saved)
        state.toggleLibrarySave(original.id, locale: english)
        precondition(state.notice == "Unsaved. The material remains in the local sample list.")
        precondition(!state.materials[0].saved)
        precondition(state.materials[0].title == original.title && state.materials[0].content == original.content && state.materials[0].source == original.source)
        state.openMaterial(original.id)
        precondition(state.openLibraryMaterialChat(original.id, locale: english))
        precondition(state.chatContext == original.id && state.selectedMaterialID == original.id)
        precondition(!state.openLibraryMaterialChat("unknown", locale: english))
        precondition(state.notice == "This material is unavailable. Nothing was added to chat.")
        let memory = state.memories[0]
        precondition(!state.correctLocalMemory(memory.id, title: " ", scope: "travel", locale: english))
        precondition(state.memories[0].title == memory.title)
        precondition(state.correctLocalMemory(memory.id, title: "取消", scope: "保存资料", locale: english))
        precondition(state.memories[0].title == "取消" && state.memories[0].scope == "保存资料" && state.memories[0].source == memory.source)
        precondition(state.notice == "Recent local change: travel preference corrected. Not synced or used for real answers.")
        state.forgetLocalMemory(memory.id, locale: english)
        precondition(state.memories.isEmpty && state.notice == "Recent local change: sample preference forgotten. Real service memories are unchanged.")
        state.restoreLocalMemories(locale: english)
        precondition(state.memories[0].title == memory.title && state.notice == "You explicitly restored the travel preference sample. No real memories were restored.")
        state.toggleLibrarySave(original.id)
        precondition(state.notice == "已保存本地样例，未同步服务。")
        print("PASS: English and Chinese action copy, default-call compatibility, exact identity and verbatim payload preservation")
    }
}
