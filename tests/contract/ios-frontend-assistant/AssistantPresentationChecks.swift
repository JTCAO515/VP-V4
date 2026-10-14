import Foundation

@main
struct AssistantPresentationChecks {
    static func main() {
        let sample = NativeFrontendAssistantPersona.sample
        precondition(sample.canSave)
        var draft = sample
        draft.name = "  熊猫  "; draft.tagline = "  一起出发  "
        precondition(draft.normalized.name == "熊猫" && draft.normalized.tagline == "一起出发")
        precondition(sample.name == "VP", "Draft edits must not mutate the saved persona")
        draft.name = " \n "; precondition(!draft.canSave)
        draft.name = String(repeating: "名", count: 25); precondition(!draft.canSave)
        draft.name = String(repeating: "名", count: 24); precondition(draft.canSave)
        draft.tagline = String(repeating: "语", count: 81); precondition(!draft.canSave)
        draft.tagline = String(repeating: "语", count: 80); precondition(draft.canSave)
        draft.tagline = " "; precondition(!draft.canSave)
        draft.tagline = sample.tagline; draft.tone = "unsupported"; precondition(!draft.canSave)
        let previews = NativeFrontendAssistantPersona.tones.map { tone -> String in
            var persona = sample; persona.tone = tone
            precondition(persona.canSave)
            return persona.preview
        }
        precondition(Set(previews).count == 3)
        var todos = NativeFrontendAssistantTodo.samples
        precondition(Set(todos.map(\.id)).count == todos.count)
        todos[0].status = .completed; todos[1].status = .cancelled
        precondition(todos[0].status != todos[1].status)
        precondition(NativeFrontendAssistantTodo.samples.allSatisfy { $0.status == .pending })
        print("PASS: persona bounds, normalization, isolated draft, 3 tone previews, local todo states/reset")
    }
}
