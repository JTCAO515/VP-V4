import Foundation

@main
@MainActor
struct LocalConversationChecks {
    static func main() {
        let state = NativeFrontendState()
        let firstID = state.activeLocalConversationID
        precondition(state.messages.isEmpty && state.draft.isEmpty && state.chatContext == nil)
        precondition(state.localConversations.contains { $0.id == firstID })
        state.startLocalConversation()
        precondition(state.activeLocalConversationID == firstID && state.localConversations.count == 2)

        state.openJourney("sample-shanghai")
        state.openMaterial("sample-plan")
        state.memories[0].title = "保留的本地偏好"
        state.materials[0].saved = false
        state.assistantName = "我的 VP"
        state.openChat(context: "sample-shanghai")
        state.draft = "第一段本地对话"; state.submit()
        state.draft = "尚未发送的第一段草稿"
        let firstMessages = state.messages.map(\.id)
        precondition(state.pendingConfirmation)

        state.startLocalConversation()
        let secondID = state.activeLocalConversationID
        precondition(secondID != firstID && state.localConversations.count == 3)
        precondition(state.messages.isEmpty && state.draft.isEmpty && state.chatContext == nil && !state.pendingConfirmation)
        precondition(state.localConversations.first { $0.id == firstID }?.title == "第一段本地对话")
        precondition(state.selectedJourneyID == "sample-shanghai" && state.selectedMaterialID == "sample-plan")
        precondition(state.memories[0].title == "保留的本地偏好" && !state.materials[0].saved && state.assistantName == "我的 VP")

        state.draft = "第二段草稿"; state.chatContext = "second-local-context"
        state.screenState = .failed; state.notice = "保留的本地提示"
        state.selectLocalConversation("unknown-local-id")
        precondition(state.activeLocalConversationID == secondID && state.draft == "第二段草稿")
        precondition(state.chatContext == "second-local-context" && state.messages.isEmpty && !state.pendingConfirmation)
        precondition(state.screenState == .failed && state.notice == "保留的本地提示")
        state.selectLocalConversation(secondID)
        precondition(state.draft == "第二段草稿" && state.screenState == .failed)

        state.selectLocalConversation(firstID)
        precondition(state.activeLocalConversationID == firstID && state.messages.map(\.id) == firstMessages)
        precondition(state.draft == "尚未发送的第一段草稿" && state.chatContext == "sample-shanghai" && state.pendingConfirmation)
        precondition(state.screenState == .ready && state.notice == nil)
        state.selectLocalConversation("sample-history")
        precondition(state.messages.map(\.id) == ["history-user", "history-result"])
        precondition(state.draft.isEmpty && state.chatContext == "sample-shanghai" && !state.pendingConfirmation)
        state.draft = "历史样例草稿"
        state.selectLocalConversation(secondID)
        precondition(state.messages.isEmpty && state.draft == "第二段草稿" && state.chatContext == "second-local-context" && !state.pendingConfirmation)
        state.selectLocalConversation("sample-history")
        precondition(state.draft == "历史样例草稿" && state.messages.count == 2)
        state.selectLocalConversation(firstID)
        precondition(state.pendingConfirmation && state.draft == "尚未发送的第一段草稿")
        precondition(state.messages.map(\.id) == firstMessages && !state.journeys[0].confirmed)
        precondition(state.memories[0].title == "保留的本地偏好" && !state.materials[0].saved)
        print("PASS: actual Main state quiet/new/history/current/unknown selection and per-conversation isolation; shared journey/material/memory preserved")
    }
}
