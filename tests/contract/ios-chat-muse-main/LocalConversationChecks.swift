import Foundation
@main @MainActor struct LocalConversationChecks {
    static func main() {
        let s = NativeFrontendState()
        precondition(s.messages.isEmpty && s.draft.isEmpty && s.chatContext == nil)
        let initial = s.activeLocalConversationID
        s.draft = "First local input"; s.submit()
        precondition(s.messages.count == 2 && s.pendingConfirmation)
        s.draft = "unsent draft"; s.chatContext = "sample-shanghai"
        s.startLocalConversation()
        let next = s.activeLocalConversationID
        precondition(next != initial && s.messages.isEmpty && s.draft.isEmpty && s.chatContext == nil && !s.pendingConfirmation)
        s.draft = "second draft"
        s.selectLocalConversation(initial)
        precondition(s.draft == "unsent draft" && s.messages.count == 2 && s.chatContext == "sample-shanghai" && s.pendingConfirmation)
        s.selectLocalConversation("missing")
        precondition(s.activeLocalConversationID == initial && s.draft == "unsent draft")
        s.selectLocalConversation(next)
        precondition(s.draft == "second draft" && s.messages.isEmpty && !s.pendingConfirmation)
        s.selectLocalConversation("sample-history")
        precondition(s.messages.count == 2 && s.chatContext == "sample-shanghai" && !s.pendingConfirmation)
        precondition(s.journeys.count == 1 && s.materials.count == 2 && s.memories.count == 1)
        s.reset()
        precondition(s.activeLocalConversationID == initial && s.messages.isEmpty && s.draft.isEmpty && s.localConversations.count == 2)
        print("PASS: quiet new chat, exact local-history selection, draft/context/confirmation isolation, unknown IDs and reset")
    }
}
