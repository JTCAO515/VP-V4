import Foundation

/// A reading-only projection of the original persisted qa-agent/1 message.
/// Never retain this projection in state: resolve it again under the live scope gate.
struct NativeQAMessagePresentation: Equatable {
    let id: String
    let input: String
    let response: String?
    let status: NativeQAMessage.Status
    let userLabel: String
    let assistantLabel: String
    let statusTitle: String
    let statusDetail: String
    let statusSymbol: String

    @MainActor
    static func resolve(
        message: NativeQAMessage,
        expectedSessionID: String,
        isCurrent: @MainActor () -> Bool,
        chinese: Bool
    ) -> Self? {
        guard isCurrent(), NativeQAWire.uuid(expectedSessionID),
              message.valid(sessionID: expectedSessionID) else { return nil }
        func copy(_ zh: String, _ en: String) -> String { chinese ? zh : en }
        let title: String
        let detail: String
        let symbol: String
        switch message.status {
        case .pending:
            title = copy("处理中", "Processing")
            detail = copy("请求仍在处理中，尚未完成。", "The request is still processing and has not completed.")
            symbol = "clock"
        case .reconciliationRequired:
            title = copy("结果未确认", "Result unconfirmed")
            detail = copy("请先核对已保存状态，避免重复发送。", "Check saved state before sending again to avoid a duplicate request.")
            symbol = "questionmark.circle"
        case .answered:
            title = copy("回答已保存", "Answer saved")
            detail = copy("这是本次问题的已保存回答。", "This is the saved answer to this question.")
            symbol = "checkmark.circle"
        case .partial:
            title = copy("部分回答", "Partial answer")
            detail = copy("以下为部分结果，仍有内容尚未完成。", "These are partial results; some parts remain incomplete.")
            symbol = "circle.lefthalf.filled"
        case .clarification:
            title = copy("需要补充信息", "More information needed")
            detail = copy("请阅读下方问题，在当前会话补充信息。", "Read the question below and provide the details in this session.")
            symbol = "text.bubble"
        case .blocked:
            title = copy("暂时受阻", "Blocked")
            detail = copy("本次请求未完成，请查看服务说明与当前状态。", "This request did not complete. Check the service notice and current state.")
            symbol = "hand.raised"
        case .technicalFailure:
            title = copy("服务出错", "Service error")
            detail = copy("本次请求因技术问题未完成，请先核对已保存状态。", "This request failed because of a technical problem. Check saved state first.")
            symbol = "exclamationmark.triangle"
        }
        guard isCurrent() else { return nil }
        return Self(
            id: message.id, input: message.input, response: message.text, status: message.status,
            userLabel: copy("你", "You"), assistantLabel: "VisePanda",
            statusTitle: title, statusDetail: detail, statusSymbol: symbol
        )
    }
}
