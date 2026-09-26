import Foundation
import SwiftUI

private struct AssistantConversation: Decodable {
    let version: Int
    let kind: String
    let conversationId: String?
    let nextSequence: Int
    let messages: [AssistantMessage]
    let goals: [AssistantGoal]
    var valid: Bool {
        version == 5 && kind == "conversation" && (conversationId == nil || UUID(uuidString: conversationId!) != nil)
        && nextSequence > 0 && messages.allSatisfy(\.valid)
        && zip(messages, messages.dropFirst()).allSatisfy { $0.0.sequence < $0.1.sequence }
        && goals.allSatisfy { UUID(uuidString: $0.goalId) != nil && $0.scopeVersion > 0 }
    }
}

private struct AssistantGoal: Decodable, Identifiable {
    let goalId: String
    let scopeVersion: Int
    let text: String
    var id: String { goalId }
}

private struct AssistantMessage: Decodable, Identifiable {
    let messageId: String
    let sequence: Int
    let locale: String
    let text: String
    let relationship: String
    let goalId: String?
    let scopeVersion: Int?
    let taskId: String?
    let parentMessageId: String?
    let turnId: String?
    let status: String
    let outcome: String?
    let output: String?
    var id: String { messageId }
    var valid: Bool {
        UUID(uuidString: messageId) != nil && sequence > 0 && ["zh", "en"].contains(locale)
        && !text.isEmpty && text.utf16.count <= 4000
        && ["independent_question", "goal_start", "follow_up", "amendment", "clarification"].contains(relationship)
        && (goalId == nil || UUID(uuidString: goalId!) != nil)
        && (scopeVersion == nil || scopeVersion! > 0)
        && (turnId == nil || UUID(uuidString: turnId!) != nil)
        && (turnId != nil || status == "recorded")
        && (output == nil || outcome != nil)
    }
}

private struct AssistantSubmission: Encodable {
    let conversationId: String
    let messageId: String
    let idempotencyKey: String
    let policyId: String
    let locale: String
    let text: String
    let relationship: String
    let goalId: String?
    let expectedGoalVersion: Int?
    let taskId: String?
    let parentMessageId: String?
    let turnId: String?
    private enum CodingKeys: String, CodingKey {
        case conversationId, messageId, idempotencyKey, policyId, locale, text, relationship
        case goalId, expectedGoalVersion, taskId, parentMessageId, turnId
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(conversationId, forKey: .conversationId)
        try c.encode(messageId, forKey: .messageId)
        try c.encode(idempotencyKey, forKey: .idempotencyKey)
        try c.encode(policyId, forKey: .policyId)
        try c.encode(locale, forKey: .locale)
        try c.encode(text, forKey: .text)
        try c.encode(relationship, forKey: .relationship)
        try c.encode(goalId, forKey: .goalId)
        try c.encode(expectedGoalVersion, forKey: .expectedGoalVersion)
        try c.encode(taskId, forKey: .taskId)
        try c.encode(parentMessageId, forKey: .parentMessageId)
        try c.encode(turnId, forKey: .turnId)
    }
}

/// Opt-in v5 consumer. Conversation membership is read back from the server;
/// the old Ask modes remain separate and their four-Turn rules are unchanged.
struct NativeAssistantConversationView: View {
    var isActive: Bool
    @Environment(AppSettings.self) private var settings
    @State private var policy: NativeTextPolicy?
    @State private var conversation: AssistantConversation?
    @State private var draft = ""
    @State private var operation = "independent_question"
    @State private var agreed = false
    @State private var busy = false
    @State private var notice: String?
    @State private var pending: AssistantSubmission?
    @State private var boundScope: NativeDataScope?
    private var session: NativeSession { settings.nativeSession }
    private var chinese: Bool { settings.selectedLocale == .zh }
    private var goal: AssistantGoal? { conversation?.goals.last }
    private var actions: [String] { goal == nil ? ["independent_question", "goal_start"] : ["independent_question", "goal_start", "follow_up", "amendment"] }
    private var waitingKey: String { (conversation?.messages ?? []).filter { ["accepted","planning","retrieving","generating","validating"].contains($0.status) }.map(\.messageId).joined(separator: ":") }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                BrandHeader()
                Text(chinese ? "与 VP 继续" : "Continue with VP").font(.title2.bold())
                Text(chinese ? "对话和目标会保存。独立问题沿用当前文本回答；目标改口先记录，尚不会自动启动规划任务。" : "Your conversation and goal are saved. Separate questions use the current text answer; goal changes are recorded without starting planning work.")
                    .font(.footnote).foregroundStyle(Color.vpSecondaryText)
                if let policy {
                    if policy.consentState == .accepted {
                        if let goal { Text((chinese ? "当前目标 v" : "Current goal v") + String(goal.scopeVersion) + ": " + goal.text).font(.headline) }
                        ForEach(conversation?.messages ?? []) { message in
                            VStack(alignment: .leading, spacing: 8) {
                                Text(message.text).font(.body)
                                Text(label(message)).font(.caption).foregroundStyle(Color.vpSecondaryText)
                                if let output = message.output { Text(output).textSelection(.enabled) }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading).padding(14)
                            .background(Color.vpSurface, in: RoundedRectangle(cornerRadius: 16))
                            .accessibilityIdentifier("assistant.message.\(message.sequence)")
                        }
                        Button(chinese ? "撤回文本授权" : "Withdraw text consent", role: .destructive) { Task { await withdraw() } }
                            .disabled(busy)
                    } else {
                        Text(chinese ? policy.noticeZh : policy.noticeEn)
                        Toggle(chinese ? "我同意上述文本处理" : "I agree to this text processing", isOn: $agreed)
                        Button(chinese ? "同意并继续" : "Agree and continue") { Task { await accept() } }
                            .disabled(!agreed || busy)
                    }
                } else { Text(chinese ? "正在读取授权状态" : "Loading consent") }
                if notice != nil { Text(chinese ? "请求未确认，请重试或刷新。" : "Request not confirmed. Retry or refresh.").font(.footnote) }
            }.padding(VPSpacing.standard)
        }
        .background(Color.vpBackground)
        .safeAreaInset(edge: .bottom) {
            if policy?.consentState == .accepted && session.dataScope != nil {
                VStack(spacing: 8) {
                    Picker(chinese ? "消息类型" : "Message type", selection: $operation) {
                        ForEach(actions, id: \.self) { action in Text(actionLabel(action)).tag(action) }
                    }.pickerStyle(.menu)
                    HStack {
                        TextField(chinese ? "告诉 VP…" : "Ask VP…", text: $draft, axis: .vertical)
                            .lineLimit(1...5).accessibilityIdentifier("assistant.composer")
                        Button(chinese ? "发送" : "Send") { Task { await send() } }
                            .disabled(busy || (pending == nil && draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty))
                            .accessibilityIdentifier("assistant.send")
                    }
                }.padding().background(.bar)
            }
        }
        .toolbar { ToolbarItem(placement: .topBarTrailing) { Button(chinese ? "刷新" : "Refresh") { Task { await reload() } }.disabled(busy) } }
        .task(id: session.dataScope) {
            if boundScope != session.retainedDataScope {
                pending = nil; draft = ""; boundScope = session.retainedDataScope
            }
            policy = nil; conversation = nil; notice = nil
            if session.dataScope != nil { await reload() }
        }
        .task(id: waitingKey) {
            guard isActive, !waitingKey.isEmpty else { return }
            for _ in 0..<60 {
                do { try await Task.sleep(for: .seconds(1)) } catch { return }
                guard !Task.isCancelled, session.dataScope != nil, !waitingKey.isEmpty else { return }
                await reload()
            }
        }
    }

    private func actionLabel(_ action: String) -> String {
        switch action {
        case "goal_start": return chinese ? "建立目标" : "Start goal"
        case "follow_up": return chinese ? "继续目标" : "Follow up"
        case "amendment": return chinese ? "修改目标" : "Change goal"
        default: return chinese ? "独立问题" : "Separate question"
        }
    }
    private func label(_ message: AssistantMessage) -> String {
        let prefix = actionLabel(message.relationship) + " · #" + String(message.sequence)
        if message.status == "recorded" { return prefix + (chinese ? " · 已记录，未启动任务" : " · Saved, no task started") }
        return prefix + " · " + message.status
    }
    private func reload() async {
        guard !busy, let initial = session.dataScope else { return }
        busy = true; defer { busy = false }
        do {
            let policyData = try await session.askRequest(path: "api/chat/native/v5/policy", method: "GET")
            guard session.dataScope == initial else { return }
            let policyReply = try JSONDecoder().decode(NativeTextPolicyReply.self, from: policyData)
            guard policyReply.kind == "policy", policyReply.policy.valid else { throw NativeDataError.invalidResponse }
            policy = policyReply.policy
            if policyReply.policy.consentState != .accepted { conversation = nil; pending = nil; return }
            let data = try await session.askRequest(path: "api/chat/native/v5/conversation", method: "GET")
            guard session.dataScope == initial else { return }
            let read = try JSONDecoder().decode(AssistantConversation.self, from: data)
            guard read.valid else { throw NativeDataError.invalidResponse }
            conversation = read
            if let pending, read.messages.contains(where: { $0.messageId == pending.messageId }) { self.pending = nil; draft = "" }
            notice = nil
        } catch {
            guard session.dataScope == initial else { return }
            policy = nil; conversation = nil; notice = "retry"
        }
    }
    private func accept() async {
        guard !busy, agreed, let policy, let initial = session.dataScope else { return }
        busy = true
        do {
            let body = try JSONEncoder().encode(["policyId": policy.id, "noticeHash": policy.noticeHash])
            _ = try await session.askRequest(path: "api/chat/native/v5/consent", method: "POST", body: body)
            guard session.dataScope == initial else { return }
            self.policy = nil
        } catch { if session.dataScope == initial { notice = "retry" } }
        busy = false
        await reload()
    }
    private func withdraw() async {
        guard !busy, let policy, let initial = session.dataScope else { return }
        busy = true
        do {
            let body = try JSONEncoder().encode(["policyId": policy.id])
            _ = try await session.askRequest(path: "api/chat/native/v5/consent", method: "DELETE", body: body)
            guard session.dataScope == initial else { return }
            conversation = nil; pending = nil; draft = ""; self.policy = nil
        } catch { if session.dataScope == initial { notice = "retry" } }
        busy = false
        await reload()
    }
    private func send() async {
        guard !busy, let policy, policy.consentState == .accepted, let initial = session.dataScope else { return }
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard pending != nil || (!text.isEmpty && text.utf16.count <= 4000) else { return }
        let request: AssistantSubmission
        if let pending { request = pending }
        else {
            let relationship = operation
            let relatedGoal = ["follow_up", "amendment"].contains(relationship) ? goal : nil
            guard relatedGoal != nil || !["follow_up", "amendment"].contains(relationship) else { return }
            let parent = relatedGoal.flatMap { current in conversation?.messages.last(where: { $0.goalId == current.goalId }) }
            guard relatedGoal == nil || parent != nil else { return }
            request = AssistantSubmission(conversationId: conversation?.conversationId ?? UUID().uuidString.lowercased(),
                messageId: UUID().uuidString.lowercased(), idempotencyKey: UUID().uuidString.lowercased(), policyId: policy.id,
                locale: chinese ? "zh" : "en", text: text, relationship: relationship,
                goalId: relationship == "goal_start" ? UUID().uuidString.lowercased() : relatedGoal?.goalId,
                expectedGoalVersion: relatedGoal?.scopeVersion, taskId: nil, parentMessageId: parent?.messageId,
                turnId: relationship == "independent_question" ? UUID().uuidString.lowercased() : nil)
            pending = request
        }
        busy = true
        do {
            let body = try JSONEncoder().encode(request)
            let data = try await session.askRequest(path: "api/chat/native/v5/conversation", method: "POST", body: body)
            guard session.dataScope == initial else { return }
            let accepted = try JSONDecoder().decode(AssistantAccepted.self, from: data)
            guard accepted.version == 5 && accepted.kind == "accepted" && accepted.messageId == request.messageId else { throw NativeDataError.invalidResponse }
            notice = nil
        } catch { if session.dataScope == initial { notice = "retry" } }
        busy = false
        await reload()
    }
}

private struct AssistantAccepted: Decodable {
    let version: Int
    let kind: String
    let messageId: String
}
