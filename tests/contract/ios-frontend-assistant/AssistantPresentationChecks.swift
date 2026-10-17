import Foundation

@main
struct AssistantPresentationChecks {
    static func main() {
        checkLocales()
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
    static func checkLocales() {
        let zh = Locale(identifier: "zh-Hans")
        let en = Locale(identifier: "en")
        for identifier in ["zh", "zh-Hans", "zh-Hant", "zh-CN"] {
            precondition(NativeFrontendAssistantCopy(locale: Locale(identifier: identifier))("保存", "Save") == "保存")
        }
        for identifier in ["en", "en-US", "en-GB"] {
            precondition(NativeFrontendAssistantCopy(locale: Locale(identifier: identifier))("保存", "Save") == "Save")
        }
        let persona = NativeFrontendAssistantPersona(name: "用户 VP Panda", tagline: "原样 · Keep 原文", tone: "温和清楚")
        for tone in NativeFrontendAssistantPersona.tones {
            precondition(NativeFrontendAssistantPersona.toneTitle(tone, locale: zh) == tone)
            precondition(NativeFrontendAssistantPersona.toneTitle(tone, locale: en) != tone)
            var preview = persona; preview.tone = tone
            precondition(preview.preview(locale: zh) == preview.preview)
            precondition(preview.preview(locale: en) != preview.preview)
        }
        precondition(NativeFrontendAssistantPersona.toneTitle("用户自己的语气", locale: en) == "用户自己的语气")
        for feedback: NativeFrontendAssistantFeedback in [.skippedFromDetail, .skippedFromEditor, .cancelled, .saved, .reset] {
            precondition(feedback.message(locale: zh) != feedback.message(locale: en))
            precondition(!feedback.message(locale: en).isEmpty)
        }
        for status: NativeFrontendAssistantTodo.Status in [.pending, .completed, .cancelled] {
            precondition(status.title(locale: zh) == status.rawValue)
            precondition(status.title(locale: en) != status.rawValue)
        }
        print("PASS: zh/en locale variants, all fixed tone labels/previews/feedback/statuses, unknown tone payload preserved")
    }

}
