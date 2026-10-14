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

    func toggleLibrarySave(_ id: String) {
        guard let index = materials.firstIndex(where: { $0.id == id }) else { return }
        materials[index].saved.toggle()
        notice = materials[index].saved ? "已保存本地样例，未同步服务。" : "已撤销保存，资料仍在本地样例列表中。"
    }

    @discardableResult
    func correctLocalMemory(_ id: String, title: String, scope: String) -> Bool {
        let text = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let range = scope.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, text.count <= 500, !range.isEmpty, range.count <= 200,
              let index = memories.firstIndex(where: { $0.id == id }) else { return false }
        memories[index].title = text
        memories[index].scope = range
        notice = "最近本地修改：已修正这条旅行偏好。未同步服务，也未用于真实回答。"
        return true
    }

    func forgetLocalMemory(_ id: String) {
        guard memories.contains(where: { $0.id == id }) else { return }
        memories.removeAll { $0.id == id }
        notice = "最近本地修改：已忘记这条样例偏好。真实服务的记忆未变更。"
    }

    func restoreLocalMemories() {
        guard memories.isEmpty else { return }
        memories = NativeFrontendState().memories
        notice = "已由你主动恢复旅行偏好样例，未恢复真实记忆。"
    }
}
