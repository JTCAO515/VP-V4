import Foundation

// UI-only operations on the Main-owned sample reference; no business store or persistence.
@MainActor
extension NativeFrontendState {
    func libraryMaterials(query: String, savedOnly: Bool) -> [NativeFrontendMaterial] {
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines)
        return materials.filter {
            (!savedOnly || $0.saved) && (term.isEmpty ||
                [$0.title, $0.content, $0.source].contains { $0.localizedCaseInsensitiveContains(term) })
        }
    }

    // Keep navigation identity separate from the readable Chat presentation.
    // Resolve readable content from the current material, rather than parsing identity from text.
    func libraryChatText(materialID: String, locale: Locale = Locale(identifier: "zh-Hans")) -> String? {
        let copy = NativeLibraryMemoryCopy(locale: locale)
        guard let material = materials.first(where: { $0.id == materialID }) else { return nil }
        return copy("资料：", "Material: ") + material.title + "\n" + material.content
    }

    @discardableResult
    func openLibraryMaterialChat(_ id: String, locale: Locale = Locale(identifier: "zh-Hans")) -> Bool {
        let copy = NativeLibraryMemoryCopy(locale: locale)
        guard materials.contains(where: { $0.id == id }) else {
            notice = copy("这份资料已不可用，未带入对话。", "This material is unavailable. Nothing was added to chat.")
            return false
        }
        openChat(context: id)
        return true
    }

    func toggleLibrarySave(_ id: String, locale: Locale = Locale(identifier: "zh-Hans")) {
        let copy = NativeLibraryMemoryCopy(locale: locale)
        guard let index = materials.firstIndex(where: { $0.id == id }) else { return }
        materials[index].saved.toggle()
        notice = materials[index].saved ? copy("已保存本地样例，未同步服务。", "Local sample saved. Not synced to a service.") : copy("已撤销保存，资料仍在本地样例列表中。", "Unsaved. The material remains in the local sample list.")
    }

    @discardableResult
    func correctLocalMemory(_ id: String, title: String, scope: String, locale: Locale = Locale(identifier: "zh-Hans")) -> Bool {
        let copy = NativeLibraryMemoryCopy(locale: locale)
        let text = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let range = scope.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, text.count <= 500, !range.isEmpty, range.count <= 200,
              let index = memories.firstIndex(where: { $0.id == id }) else { return false }
        memories[index].title = text
        memories[index].scope = range
        notice = copy("最近本地修改：已修正这条旅行偏好。未同步服务，也未用于真实回答。", "Recent local change: travel preference corrected. Not synced or used for real answers.")
        return true
    }

    func forgetLocalMemory(_ id: String, locale: Locale = Locale(identifier: "zh-Hans")) {
        let copy = NativeLibraryMemoryCopy(locale: locale)
        guard memories.contains(where: { $0.id == id }) else { return }
        memories.removeAll { $0.id == id }
        notice = copy("最近本地修改：已忘记这条样例偏好。真实服务的记忆未变更。", "Recent local change: sample preference forgotten. Real service memories are unchanged.")
    }

    func restoreLocalMemories(locale: Locale = Locale(identifier: "zh-Hans")) {
        let copy = NativeLibraryMemoryCopy(locale: locale)
        guard memories.isEmpty else { return }
        memories = NativeFrontendState().memories
        notice = copy("已由你主动恢复旅行偏好样例，未恢复真实记忆。", "You explicitly restored the travel preference sample. No real memories were restored.")
    }
}

// Explicit paired UI literals only. Never translate or classify material/user payloads.
struct NativeLibraryMemoryCopy {
    let locale: Locale
    var isChinese: Bool { locale.language.languageCode?.identifier == "zh" }
    func callAsFunction(_ chinese: String, _ english: String) -> String {
        isChinese ? chinese : english
    }
}
