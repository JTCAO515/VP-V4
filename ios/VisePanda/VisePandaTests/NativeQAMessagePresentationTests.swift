import Foundation
import Testing
@testable import VisePanda

/// Every message below is synthetic. These checks do not contact a provider or persistence.
@MainActor
struct NativeQAMessagePresentationTests {
    private let session = "00000000-0000-4000-8000-000000000001"
    private let request = "00000000-0000-4000-8000-000000000002"

    private func message(
        status: NativeQAMessage.Status = .answered, input: String = "Synthetic question",
        text: String? = "Synthetic response", sessionID: String? = nil,
        turnID: String? = nil, requestID: String? = nil, createdAt: String = "synthetic-date"
    ) -> NativeQAMessage {
        .init(requestId: requestID ?? request, turnId: turnID ?? request,
              sessionId: sessionID ?? session, input: input, text: text,
              status: status, createdAt: createdAt)
    }

    private func resolve(_ value: NativeQAMessage, chinese: Bool = true) -> NativeQAMessagePresentation? {
        NativeQAMessagePresentation.resolve(message: value, expectedSessionID: session, isCurrent: { true }, chinese: chinese)
    }

    @Test(arguments: [NativeQAMessage.Status.pending, .reconciliationRequired, .answered, .partial, .clarification, .blocked, .technicalFailure])
    func allWireStatesHaveDistinctTruthfulBilingualPresentation(status: NativeQAMessage.Status) throws {
        let value = message(status: status, text: status.waiting ? nil : "Synthetic response")
        let zh = try #require(resolve(value))
        let en = try #require(resolve(value, chinese: false))
        #expect(zh.status == status)
        #expect(zh.input == value.input && zh.response == value.text)
        #expect(zh.userLabel == "你" && en.userLabel == "You")
        #expect(zh.assistantLabel == "VisePanda" && en.assistantLabel == "VisePanda")
        #expect(!zh.statusDetail.isEmpty && !en.statusDetail.isEmpty)
        #expect(zh.statusTitle != en.statusTitle)
        #expect((zh.statusTitle == "回答已保存") == (status == .answered))
        #expect((en.statusTitle == "Answer saved") == (status == .answered))
        if status == .reconciliationRequired {
            #expect(zh.statusTitle == "结果未确认")
            #expect(en.statusDetail.contains("before sending again"))
        }
        if status == .partial { #expect(zh.statusDetail.contains("尚未完成")) }
        if status == .clarification { #expect(zh.statusDetail.contains("当前会话")) }
    }

    @Test func blockedAndFailureCanHaveNoResponse() throws {
        for status in [NativeQAMessage.Status.blocked, .technicalFailure] {
            #expect(try #require(resolve(message(status: status, text: nil))).response == nil)
        }
    }

    @Test func invalidPayloadsNeverProjectEvenWithCurrentScope() {
        let invalid = [
            message(input: " \n\t"), message(input: String(repeating: "a", count: 4001)),
            message(text: " \n"), message(text: String(repeating: "a", count: 8001)),
            message(text: nil), message(status: .partial, text: nil),
            message(status: .clarification, text: nil), message(status: .pending),
            message(status: .reconciliationRequired), message(turnID: session),
            message(requestID: "broken"), message(createdAt: ""),
            message(sessionID: "00000000-0000-4000-8000-000000000003")
        ]
        for value in invalid { #expect(resolve(value) == nil) }
        #expect(NativeQAMessagePresentation.resolve(message: message(sessionID: "invalid"), expectedSessionID: "invalid", isCurrent: { true }, chinese: true) == nil)
    }

    @MainActor private final class LiveGate {
        var current = true
    }

    @Test func liveGateIsNotCachedAcrossReadsAndRechecksBeforeReturning() {
        let value = message()
        let authority = LiveGate()
        let gate: @MainActor () -> Bool = { authority.current }
        #expect(NativeQAMessagePresentation.resolve(message: value, expectedSessionID: session, isCurrent: gate, chinese: true) != nil)
        authority.current = false
        #expect(NativeQAMessagePresentation.resolve(message: value, expectedSessionID: session, isCurrent: gate, chinese: true) == nil)
        var reads = 0
        #expect(NativeQAMessagePresentation.resolve(message: value, expectedSessionID: session, isCurrent: { reads += 1; return reads == 1 }, chinese: true) == nil)
        #expect(reads == 2)
    }

    @Test func longChineseEnglishAndLiteralMarkupKeepOriginalUTF8Bytes() throws {
        let input = "  " + String(repeating: "广州 e\u{301} family 👩‍👩‍👧‍👦\n", count: 70) + "\n"
        let response = String(repeating: "中文回答 / English answer\n", count: 150)
            + "[link](https://synthetic.invalid) ![image](https://synthetic.invalid/image)\n```swift\nprint(1)\n```  "
        let value = message(input: input, text: response)
        #expect(value.valid(sessionID: session))
        for chinese in [true, false] {
            let projection = try #require(resolve(value, chinese: chinese))
            #expect(Array(projection.input.utf8) == Array(input.utf8))
            #expect(Array(try #require(projection.response).utf8) == Array(response.utf8))
        }
    }

    @Test func unknownWireStatusFailsDecodingInsteadOfInventingSuccess() throws {
        let object: [String: Any] = ["requestId": request, "turnId": request, "sessionId": session,
                                     "input": "Synthetic", "text": "Synthetic", "status": "unknown", "createdAt": "synthetic"]
        let data = try JSONSerialization.data(withJSONObject: object)
        #expect(throws: (any Error).self) { try JSONDecoder().decode(NativeQAMessage.self, from: data) }
    }
}
