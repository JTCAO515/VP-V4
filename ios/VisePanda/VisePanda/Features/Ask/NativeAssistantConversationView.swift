import Foundation
import SwiftUI

struct AssistantConversation: Decodable {
    let version: Int
    let kind: String
    let conversationId: String?
    let nextSequence: Int
    let messages: [AssistantMessage]
    let goals: [AssistantGoal]
    var valid: Bool {
        version == 5 && kind == "conversation" && (conversationId == nil || UUID(uuidString: conversationId!) != nil)
        && nextSequence > 0 && messages.count <= 50 && goals.count <= 100 && messages.allSatisfy(\.valid)
        && (conversationId != nil || (messages.isEmpty && goals.isEmpty))
        && Set(messages.map(\.messageId)).count == messages.count
        && zip(messages, messages.dropFirst()).allSatisfy { $0.0.sequence < $0.1.sequence }
        && goals.allSatisfy { UUID(uuidString: $0.goalId) != nil && $0.scopeVersion > 0 }
    }
}

@MainActor enum AssistantConversationReader {
    static func read(requestedID: String?, isCurrent: () -> Bool,
                     load: () async throws -> Data) async throws -> AssistantConversation {
        guard requestedID == nil || UUID(uuidString: requestedID ?? "") != nil,
              isCurrent(), !Task.isCancelled else { throw NativeDataError.staleSessionResponse }
        let bytes = try await load()
        guard isCurrent(), !Task.isCancelled else { throw NativeDataError.staleSessionResponse }
        guard bytes.count <= 1_000_000 else { throw NativeDataError.invalidResponse }
        let read = try JSONDecoder().decode(AssistantConversation.self, from: bytes)
        guard read.valid, requestedID == nil || read.conversationId == requestedID else { throw NativeDataError.invalidResponse }
        return read
    }
}

struct AssistantConversationSelection {
    var conversationID: String?
    private(set) var generation = UUID()
    mutating func select(_ id: String?) { conversationID = id; generation = UUID() }
    func owns(_ token: UUID) -> Bool { generation == token }
}

private struct AssistantConversationSummary: Decodable, Identifiable {
    let conversationId: String
    let createdAt: String
    let preview: String
    var id: String { conversationId }
    var valid: Bool { UUID(uuidString: id) != nil && !createdAt.isEmpty && preview.count <= 120 }
}

private struct AssistantConversationList: Decodable {
    let version: Int
    let kind: String
    let limit: Int
    let conversations: [AssistantConversationSummary]
    var valid: Bool {
        version == 5 && kind == "conversations" && limit == 20 && conversations.count <= limit
            && conversations.allSatisfy(\.valid) && Set(conversations.map(\.id)).count == conversations.count
    }
}

struct AssistantGoal: Decodable, Identifiable {
    let goalId: String
    let scopeVersion: Int
    let text: String
    var id: String { goalId }
}

struct AssistantMessage: Decodable, Identifiable {
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
        && (taskId == nil || UUID(uuidString: taskId!) != nil)
        && (scopeVersion == nil || scopeVersion! > 0)
        && (turnId == nil || UUID(uuidString: turnId!) != nil)
        && (turnId != nil || status == "recorded")
        && (output == nil || outcome != nil)
    }
}

enum AssistantTaskProjection {
    static func latestMessages(_ messages: [AssistantMessage]) -> [AssistantMessage] {
        var seen = Set<String>()
        let latest = messages.reversed().filter { message in
            guard let taskID = message.taskId else { return false }
            return seen.insert(taskID).inserted
        }
        return Array(latest.reversed())
    }

    static func turn(for message: AssistantMessage, in history: [NativeTextTurn]) -> NativeTextTurn? {
        guard let taskID = message.taskId else { return nil }
        return history.first { $0.serviceTaskId == taskID }
    }

    static func eligibleHistory(_ history: [NativeTextTurn], messages: [AssistantMessage]) -> [NativeTextTurn] {
        let visibleTaskIDs = Set(latestMessages(messages).compactMap(\.taskId))
        var seen = Set<String>()
        return history.filter { turn in
            // The history is newest first. An invalid latest row makes that task
            // unknown; never fall back to an older completed Turn.
            guard let taskID = turn.serviceTaskId, visibleTaskIDs.contains(taskID),
                  seen.insert(taskID).inserted, turn.valid,
                  let scopeVersion = turn.scopeVersion, scopeVersion > 0 else { return false }
            if turn.relationship == "new_goal" { return turn.parentTurnId == nil }
            return ["clarification", "repair"].contains(turn.relationship ?? "")
                && turn.parentTurnId.flatMap(UUID.init(uuidString:)) != nil
        }
    }

    static func waitingTurnIDs(messages: [AssistantMessage], history: [NativeTextTurn]) -> [String] {
        let eligible = eligibleHistory(history, messages: messages)
        return latestMessages(messages).compactMap { turn(for: $0, in: eligible) }.filter(\.waiting).map(\.turnId)
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

private struct AssistantPlanningPolicyReply: Decodable {
    let version: Int
    let data: AssistantPlanningPolicy
}

private struct AssistantPlanningPolicy: Decodable {
    let kind: String
    let policyId: String?
    let noticeHash: String?
    let noticeZh: String?
    let noticeEn: String?
    let consentState: String?
    var valid: Bool {
        if kind == "unavailable" { return policyId == nil }
        return kind == "planning_policy" && policyId.flatMap(UUID.init(uuidString:)) != nil
            && noticeHash?.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil
            && noticeZh != nil && noticeEn != nil
            && ["accepted", "not_accepted", "withdrawn"].contains(consentState ?? "")
    }
}

private struct AssistantPlanningSubmission: Encodable {
    let conversationId: String
    let goalId: String
    let expectedGoalVersion: Int
    let parentMessageId: String
    let messageId: String
    let messageKey: String
    let threadId: String
    let turnId: String
    let taskId: String
    let taskKey: String
    let planningPolicyId: String
    let locale: String
    let text: String
    let memoryBasis: [String]
}

private struct AssistantPlanningAccepted: Decodable {
    let version: Int
    let kind: String
    let taskId: String
    let turnId: String
    let artifactId: String
}

struct AssistantResultEnvelope: Decodable {
    let version: Int
    let data: AssistantResult
}

struct AssistantResult: Decodable {
    struct Source: Decodable { let taskId: String }
    let kind: String
    let artifactId: String?
    let revision: Int?
    let current: Bool?
    let lifecycle: String?
    let source: Source?
    let content: NativeResultContent?
    func belongs(to taskId: String) -> Bool {
        kind == "result_artifact" && current == true && lifecycle == "active"
            && source?.taskId == taskId && artifactId.flatMap(UUID.init(uuidString:)) != nil
            && (1...1000).contains(revision ?? 0) && content?.valid == true
    }
}

struct AssistantResultReadFence {
    private var scope: NativeDataScope?
    private var generation = UUID()
    private var deadline: TimeInterval = 0

    mutating func begin(scope: NativeDataScope, now: TimeInterval) -> UUID {
        generation = UUID(); self.scope = scope; deadline = now + 30
        return generation
    }
    mutating func clear() { generation = UUID(); scope = nil; deadline = 0 }
    func owns(scope: NativeDataScope?, generation: UUID? = nil) -> Bool {
        scope != nil && self.scope == scope && (generation == nil || self.generation == generation)
    }
    func isCurrent(scope: NativeDataScope?, generation: UUID? = nil, active: Bool, now: TimeInterval) -> Bool {
        active && deadline > now && owns(scope: scope, generation: generation)
    }
}

@MainActor enum AssistantTaskResultReader {
    private struct ReferenceEnvelope: Decodable {
        struct Reference: Decodable { let kind: String; let artifactId: String?; let revision: Int?; let taskId: String? }
        let version: Int
        let data: Reference
    }
    static func open(taskID: String, isCurrent: () -> Bool,
                     resolve: () async throws -> Data,
                     exact: (String, Int) async throws -> Data) async throws -> Data {
        guard UUID(uuidString: taskID) != nil, isCurrent(), !Task.isCancelled else { throw NativeDataError.staleSessionResponse }
        let referenceBytes = try await resolve()
        guard isCurrent(), !Task.isCancelled, referenceBytes.count <= 10_000 else { throw NativeDataError.staleSessionResponse }
        let reference = try JSONDecoder().decode(ReferenceEnvelope.self, from: referenceBytes)
        guard reference.version == 1, reference.data.kind == "result_reference", reference.data.taskId == taskID,
              let id = reference.data.artifactId, UUID(uuidString: id) != nil,
              let revision = reference.data.revision, (1...1000).contains(revision) else { throw NativeDataError.invalidResponse }
        let bytes = try await exact(id, revision)
        guard isCurrent(), !Task.isCancelled, bytes.count <= 100_000 else { throw NativeDataError.staleSessionResponse }
        let result = try JSONDecoder().decode(AssistantResultEnvelope.self, from: bytes)
        guard result.version == 1, result.data.belongs(to: taskID), result.data.artifactId == id,
              result.data.revision == revision else { throw NativeDataError.invalidResponse }
        return bytes
    }
}

private struct AssistantGoalTripLink: Decodable, Equatable {
    let version: Int
    let kind: String
    let conversationId: String
    let goalId: String
    let goalScopeVersion: Int
    let linkVersion: Int
    let lastOperationId: String?
    let tripId: String?
    let tripHeadVersion: Int?
    let sourceMessageId: String?
    let sourceKind: String?
    let terminalUnlinked: Bool
    let current: Bool
    var valid: Bool {
        version == 5 && kind == "goal_trip_link" && UUID(uuidString: conversationId) != nil
        && UUID(uuidString: goalId) != nil && goalScopeVersion > 0 && linkVersion >= 0
        && (lastOperationId == nil || UUID(uuidString: lastOperationId!) != nil)
        && (tripId == nil || UUID(uuidString: tripId!) != nil)
        && ((tripId == nil) == (tripHeadVersion == nil))
        && (tripHeadVersion == nil || tripHeadVersion! >= 0)
        && (sourceMessageId == nil || UUID(uuidString: sourceMessageId!) != nil)
        && (!current || tripId != nil) && (!terminalUnlinked || tripId == nil)
    }
}

private struct AssistantGoalTripLinksRead: Decodable {
    let version: Int
    let kind: String
    let links: [AssistantGoalTripLink]
    let nextCursor: String?
    var valid: Bool {
        version == 5 && kind == "goal_trip_links" && links.count <= 50
        && links.allSatisfy { $0.valid && $0.tripId != nil }
        && Set(links.map(\.goalId)).count == links.count
        && (nextCursor == nil || UUID(uuidString: nextCursor!) != nil)
        && zip(links, links.dropFirst()).allSatisfy { $0.0.goalId < $0.1.goalId }
        && (nextCursor == nil || nextCursor == links.last?.goalId)
    }
}

private struct AssistantTripMutation: Encodable, Equatable {
    let goalId: String // local retry scope; never sent as a body authority
    let operationId: String
    let conversationId: String
    let sourceMessageId: String?
    let expectedGoalScopeVersion: Int
    let expectedLinkVersion: Int
    let action: String
    let tripId: String?
    let expectedTripVersion: Int?
    let confirmed = true
    private enum CodingKeys: String, CodingKey {
        case operationId, conversationId, sourceMessageId, expectedGoalScopeVersion
        case expectedLinkVersion, action, tripId, expectedTripVersion, confirmed
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(operationId, forKey: .operationId)
        try c.encode(conversationId, forKey: .conversationId)
        try c.encode(sourceMessageId, forKey: .sourceMessageId)
        try c.encode(expectedGoalScopeVersion, forKey: .expectedGoalScopeVersion)
        try c.encode(expectedLinkVersion, forKey: .expectedLinkVersion)
        try c.encode(action, forKey: .action)
        try c.encode(tripId, forKey: .tripId)
        try c.encode(expectedTripVersion, forKey: .expectedTripVersion)
        try c.encode(confirmed, forKey: .confirmed)
    }
}

private enum AssistantTripConfirmation: Equatable {
    case link(NativeTripSummary), unlink, privacyUnlink(AssistantGoalTripLink)
}

/// Opt-in v5 consumer. Conversation membership is read back from the server;
/// the old Ask modes remain separate and their four-Turn rules are unchanged.
struct NativeAssistantConversationView: View {
    var isActive: Bool
    @Environment(AppSettings.self) private var settings
    @Environment(\.scenePhase) private var scenePhase
    @State private var policy: NativeTextPolicy?
    @State private var conversation: AssistantConversation?
    @State private var selection = AssistantConversationSelection()
    @State private var conversations: [AssistantConversationSummary] = []
    @State private var conversationsNotice: String?
    @State private var draft = ""
    @State private var planningDraft = ""
    @State private var planningPolicy: AssistantPlanningPolicy?
    @State private var planningAgreed = false
    @State private var planningBusy = false
    @State private var planningPending: AssistantPlanningSubmission?
    @State private var planningNotice: String?
    @State private var taskTurns: [NativeTextTurn] = []
    @State private var taskNotice: String?
    @State private var selectedTaskID: String?
    @State private var selectedArtifactID: String?
    @State private var resultFence = AssistantResultReadFence()
    @State private var selectedArtifactTaskID: String?
    @State private var selectedResult: AssistantResult?
    @State private var resultNotice: String?
    @State private var operation = "independent_question"
    @State private var agreed = false
    @State private var busy = false
    @State private var refreshBusy = false
    @State private var notice: String?
    @State private var pending: AssistantSubmission?
    @State private var boundScope: NativeDataScope?
    @State private var tripLink: AssistantGoalTripLink?
    @State private var ownedTrips: [NativeTripSummary] = []
    @State private var pendingTripMutation: AssistantTripMutation?
    @State private var privacyLinks: [AssistantGoalTripLink] = []
    @State private var privacyNextCursor: String?
    @State private var tripBusy = false
    @State private var tripNotice: String?
    @State private var showTripPicker = false
    @State private var tripConfirmation: AssistantTripConfirmation?
    private var session: NativeSession { settings.nativeSession }
    private var chinese: Bool { settings.selectedLocale == .zh }
    private var resultActive: Bool { isActive && scenePhase == .active }
    private var goal: AssistantGoal? { conversation?.goals.last }
    private var actions: [String] { goal == nil ? ["independent_question", "goal_start"] : ["independent_question", "goal_start", "follow_up", "amendment"] }
    private var waitingKey: String {
        let messages = (conversation?.messages ?? []).filter { $0.turnId != nil && ["accepted","planning","retrieving","generating","validating"].contains($0.status) }.map(\.messageId)
        let tasks = AssistantTaskProjection.waitingTurnIDs(messages: conversation?.messages ?? [], history: taskTurns)
        return (messages + tasks).joined(separator: ":")
    }
    private var taskMessages: [AssistantMessage] { AssistantTaskProjection.latestMessages(conversation?.messages ?? []) }
    private func taskTurn(for message: AssistantMessage) -> NativeTextTurn? {
        AssistantTaskProjection.turn(for: message, in: taskTurns)
    }
    private var linkedTripTitle: String {
        guard let id = tripLink?.tripId else { return "" }
        return ownedTrips.first(where: { $0.id == id })?.title ?? (chinese ? "已关联行程" : "Linked Trip")
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                BrandHeader()
                Text(chinese ? "与 VP 继续" : "Continue with VP").font(.title2.bold())
                Text(chinese ? "对话和目标会保存。你可以继续提问，也可以委托一项比较任务。" : "Your conversation and goal are saved. Keep asking questions while a comparison runs.")
                    .font(.footnote).foregroundStyle(Color.vpSecondaryText)
                if session.dataScope != nil && (policy?.consentState == .accepted || selection.conversationID != nil) {
                    conversationControls
                }
                if let policy {
                    if policy.consentState == .accepted {
                        if let goal {
                            Text((chinese ? "当前目标 v" : "Current goal v") + String(goal.scopeVersion) + ": " + goal.text)
                                .font(.headline).accessibilityIdentifier("assistant.current-goal")
                            tripControls(goal)
                        }
                        ForEach(conversation?.messages ?? []) { message in
                            VStack(alignment: .leading, spacing: 8) {
                                Text(message.text).font(.body).accessibilityIdentifier("assistant.message.\(message.sequence)")
                                Text(label(message)).font(.caption).foregroundStyle(Color.vpSecondaryText)
                                if let output = message.output { Text(output).textSelection(.enabled).accessibilityIdentifier("assistant.answer.\(message.sequence)") }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading).padding(14)
                            .background(Color.vpSurface, in: RoundedRectangle(cornerRadius: 16))
                        }
                        if let goal { planningControls(goal) }
                        if !taskMessages.isEmpty { taskList }
                        TimelineView(.periodic(from: .now, by: 1)) { _ in
                            if let selectedResult, let selectedTaskID, selectedResult.belongs(to: selectedTaskID),
                               resultFence.isCurrent(scope: session.dataScope, active: resultActive, now: ProcessInfo.processInfo.systemUptime) {
                                resultCard(selectedResult)
                            } else if resultNotice != nil || selectedResult != nil {
                                Text(chinese ? "请刷新以重新核对此任务的成果与授权。" : "Refresh to recheck this task's result and permissions.")
                                    .font(.footnote).accessibilityIdentifier("assistant.result.unavailable")
                            }
                        }
                        Button(chinese ? "撤回文本授权" : "Withdraw text consent", role: .destructive) { Task { await withdraw() } }
                            .disabled(busy)
                    } else if policy.consentState == .notAccepted {
                        Text(chinese ? policy.noticeZh : policy.noticeEn)
                        Toggle(chinese ? "我同意上述文本处理" : "I agree to this text processing", isOn: $agreed)
                            .accessibilityIdentifier("assistant.agree")
                        Button(chinese ? "同意并继续" : "Agree and continue") { Task { await accept() } }
                            .disabled(!agreed || busy)
                            .accessibilityIdentifier("assistant.accept")
                    } else {
                        Text(chinese ? "文本授权已撤回。无法在此恢复；已有行程关联仍可在下方解除。" : "Text consent was withdrawn and cannot be restored here. Existing Trip links can still be removed below.")
                            .font(.footnote).foregroundStyle(Color.vpSecondaryText)
                            .accessibilityIdentifier("assistant.consent.withdrawn")
                    }
                } else {
                    Text(privacyLinks.isEmpty
                         ? (chinese ? "正在读取授权状态" : "Loading consent")
                         : (chinese ? "对话暂不可用；已有行程关联仍可在下方解除。" : "Conversation unavailable; existing Trip links can still be removed below."))
                }
                if policy?.consentState != .accepted && !privacyLinks.isEmpty { privacyTripControls }
                if notice != nil && privacyLinks.isEmpty {
                    Text(chinese ? "请求未确认，请重试或刷新。" : "Request not confirmed. Retry or refresh.").font(.footnote)
                }
            }.padding(VPSpacing.standard)
        }
        .sheet(isPresented: $showTripPicker) {
            NavigationStack {
                List(ownedTrips) { trip in
                    Button {
                        showTripPicker = false
                        tripConfirmation = .link(trip)
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(trip.title)
                            Text((chinese ? "行程版本 " : "Trip version ") + String(trip.headVersion))
                                .font(.caption).foregroundStyle(Color.vpSecondaryText)
                        }
                    }.accessibilityIdentifier("assistant.trip.select.\(trip.id)")
                }
                .navigationTitle(chinese ? "选择已有行程" : "Choose an existing Trip")
                .toolbar { ToolbarItem(placement: .topBarTrailing) {
                    Button(chinese ? "完成" : "Done") { showTripPicker = false }
                } }
            }
        }
        .alert(chinese ? "确认行程关联" : "Confirm Trip link", isPresented: Binding(
            get: { tripConfirmation != nil }, set: { if !$0 { tripConfirmation = nil } })) {
            if case .link(let trip) = tripConfirmation {
                Button(chinese ? "确认关联" : "Confirm link") { Task { await changeTrip(to: trip) } }
                    .accessibilityIdentifier("assistant.trip.confirm-link")
            } else if case .unlink = tripConfirmation {
                Button(chinese ? "确认解除" : "Confirm unlink", role: .destructive) { Task { await changeTrip(to: nil) } }
                    .accessibilityIdentifier("assistant.trip.confirm-unlink")
            } else if case .privacyUnlink(let link) = tripConfirmation {
                Button(chinese ? "确认隐私解除" : "Confirm privacy unlink", role: .destructive) { Task { await unlinkPrivacy(link) } }
                    .accessibilityIdentifier("assistant.trip.confirm-privacy-unlink")
            }
            Button(chinese ? "取消" : "Cancel", role: .cancel) { tripConfirmation = nil }
        } message: {
            if case .link(let trip) = tripConfirmation {
                Text((chinese ? "把「" : "Link ") + trip.title + (chinese ? "」（版本 \(trip.headVersion)）关联到当前目标？不会更改行程。" : " (version \(trip.headVersion)) to this goal? The Trip will not change."))
            } else if case .privacyUnlink = tripConfirmation {
                Text(chinese ? "文本授权已撤回。这里只解除已有行程关联，不恢复授权，也不删除行程。" : "Text consent is withdrawn. Remove only this saved Trip link without restoring consent or deleting the Trip.")
            } else {
                Text(chinese ? "只解除当前目标与行程的关联，不删除或更改行程。" : "Remove this goal's link only. The Trip will not be deleted or changed.")
            }
        }
        .background(Color.vpBackground)
        .safeAreaInset(edge: .bottom) {
            if policy?.consentState == .accepted && session.dataScope != nil {
                VStack(spacing: 8) {
                    Picker(chinese ? "消息类型" : "Message type", selection: $operation) {
                        ForEach(actions, id: \.self) { action in Text(actionLabel(action)).tag(action) }
                    }.pickerStyle(.menu).accessibilityIdentifier("assistant.operation")
                    HStack {
                        TextField(chinese ? "告诉 VP…" : "Ask VP…", text: $draft, axis: .vertical)
                            .lineLimit(1...5).autocorrectionDisabled().accessibilityIdentifier("assistant.composer")
                        Button(chinese ? "发送" : "Send") { Task { await send() } }
                            .disabled(busy || refreshBusy || conversation == nil || (pending == nil && draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty))
                            .accessibilityIdentifier("assistant.send")
                    }
                }.padding().background(.bar)
            }
        }
        .toolbar { ToolbarItem(placement: .topBarTrailing) { Button(chinese ? "刷新" : "Refresh") { Task { await reload() } }.disabled(refreshBusy) } }
        .task(id: session.dataScope) {
            let requested = session.dataScope
            // A temporary offline scope may retain a pending immutable intake.
            // Keep its selected ID only for that exact retained account/epoch/generation.
            selection.select(boundScope == session.retainedDataScope ? selection.conversationID : nil)
            conversations = []; conversationsNotice = nil
            if boundScope != session.retainedDataScope {
                pending = nil; draft = ""; boundScope = session.retainedDataScope
            }
            policy = nil; conversation = nil; notice = nil
            planningPolicy = nil; planningPending = nil; planningDraft = ""; planningNotice = nil
            taskTurns = []; taskNotice = nil
            selectedTaskID = nil; selectedArtifactID = nil; selectedArtifactTaskID = nil
            selectedResult = nil; resultNotice = nil; resultFence.clear()
            tripLink = nil; ownedTrips = []; pendingTripMutation = nil; privacyLinks = []; privacyNextCursor = nil
            tripNotice = nil; tripConfirmation = nil; showTripPicker = false
            guard requested != nil else { return }
            while busy || refreshBusy {
                do { try await Task.sleep(for: .milliseconds(50)) } catch { return }
                guard !Task.isCancelled, session.dataScope == requested else { return }
            }
            await reload()
        }
        .onChange(of: session.busy) { wasBusy, isBusy in
            if wasBusy && !isBusy && session.dataScope != nil {
                Task { await reload() }
            }
        }
        .onChange(of: resultActive) { _, active in
            if !active { invalidateResult() }
        }
        .task(id: resultActive) {
            guard resultActive else { invalidateResult(); return }
            while refreshBusy || busy {
                do { try await Task.sleep(for: .milliseconds(50)) } catch { return }
                guard !Task.isCancelled, resultActive else { return }
            }
            await reload()
        }
        .task(id: waitingKey + ":" + String(resultActive)) {
            guard resultActive, !waitingKey.isEmpty else { return }
            while true {
                do { try await Task.sleep(for: .seconds(5)) } catch { return }
                guard !Task.isCancelled, resultActive, session.dataScope != nil, !waitingKey.isEmpty else { return }
                await reload()
            }
        }
    }

    private var conversationControls: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(chinese ? "当前会话" : "Current conversation").font(.headline)
            if let id = conversation?.conversationId {
                Text(conversations.first(where: { $0.id == id })?.preview ?? (chinese ? "已保存的会话" : "Saved conversation"))
                    .lineLimit(3).accessibilityIdentifier("assistant.conversation.selected")
            }
            Menu(chinese ? "选择会话（最近 20 条）" : "Choose conversation (latest 20)") {
                ForEach(conversations) { item in
                    Button {
                        selectConversation(item.id)
                    } label: {
                        if item.id == conversation?.conversationId {
                            Label(item.preview.isEmpty ? item.createdAt : item.preview, systemImage: "checkmark")
                        } else { Text(item.preview.isEmpty ? item.createdAt : item.preview) }
                    }.accessibilityIdentifier("assistant.conversation.select.\(item.id)")
                }
            }.disabled(conversations.isEmpty || busy || planningBusy || tripBusy)
                .accessibilityIdentifier("assistant.conversation.choose")
            Button(chinese ? "返回最新会话" : "Return to latest conversation") { selectConversation(nil) }
                .disabled(busy || planningBusy || tripBusy)
                .accessibilityIdentifier("assistant.conversation.latest")
            if conversationsNotice != nil {
                Text(chinese ? "会话列表暂不可用，请刷新。" : "Conversation list unavailable. Refresh to retry.")
                    .font(.footnote)
            }
        }
    }

    private func selectConversation(_ id: String?) {
        guard !busy, !planningBusy, !tripBusy else { return }
        selection.select(id)
        clearConversationContext()
        Task { await reload() }
    }

    private func clearConversationContext() {
        conversation = nil; pending = nil; draft = ""; operation = "independent_question"; notice = nil
        planningPolicy = nil; planningPending = nil; planningDraft = ""; planningAgreed = false; planningNotice = nil
        taskTurns = []; taskNotice = nil; selectedTaskID = nil; selectedArtifactID = nil; selectedArtifactTaskID = nil
        invalidateResult()
        tripLink = nil; ownedTrips = []; pendingTripMutation = nil; tripNotice = nil
        tripConfirmation = nil; showTripPicker = false
    }

    private func ownsSelection(_ initial: NativeDataScope, _ generation: UUID) -> Bool {
        session.dataScope == initial && selection.owns(generation) && !Task.isCancelled
    }

    private func invalidateResult() {
        resultFence.clear(); selectedResult = nil
        if selectedTaskID != nil { resultNotice = "retry" }
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
        if message.status == "recorded" {
            return prefix + (message.taskId == nil
                ? (chinese ? " · 已记录，未启动任务" : " · Saved, no task started")
                : (chinese ? " · 已关联任务，状态见下方" : " · Task linked; see status below"))
        }
        return prefix + " · " + statusLabel(message.status)
    }
    private func statusLabel(_ status: String) -> String {
        switch status {
        case "accepted": return chinese ? "已接纳，等待处理" : "Accepted, waiting"
        case "planning", "retrieving", "generating", "validating": return chinese ? "处理中" : "Working"
        case "completed": return chinese ? "已完成" : "Completed"
        case "cancelled": return chinese ? "已取消" : "Cancelled"
        case "failed", "unavailable": return chinese ? "未完成" : "Not completed"
        default: return chinese ? "状态待核对" : "Checking status"
        }
    }
    private func planningControls(_ currentGoal: AssistantGoal) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(chinese ? "委托比较" : "Delegate a comparison").font(.headline)
            if let planningPolicy, planningPolicy.kind == "planning_policy" {
                if tripLink?.goalId == currentGoal.goalId && tripLink?.tripId != nil {
                    Text(chinese ? "当前目标已关联行程；此版后台比较仅支持未关联行程的目标。" : "This goal is linked to a Trip. Background comparison currently supports goals without a Trip link.")
                        .font(.footnote)
                } else if planningPolicy.consentState == "accepted" {
                    TextField(chinese ? "要比较什么？" : "What should VP compare?", text: $planningDraft, axis: .vertical)
                        .lineLimit(2...5).accessibilityIdentifier("assistant.planning.composer")
                    Button(planningPending == nil ? (chinese ? "开始后台比较" : "Start background comparison")
                           : (chinese ? "重试同一次委托" : "Retry the same request")) {
                        Task { await delegateComparison(currentGoal) }
                    }
                    .disabled(planningBusy || (planningPending == nil && planningDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty))
                    .accessibilityIdentifier("assistant.planning.send")
                } else if planningPolicy.consentState == "not_accepted" {
                    Text(chinese ? (planningPolicy.noticeZh ?? "") : (planningPolicy.noticeEn ?? ""))
                        .font(.footnote)
                    Toggle(chinese ? "我同意上述规划处理" : "I agree to this planning processing", isOn: $planningAgreed)
                    Button(chinese ? "同意规划处理" : "Agree to planning processing") { Task { await acceptPlanning() } }
                        .disabled(!planningAgreed || planningBusy).accessibilityIdentifier("assistant.planning.accept")
                } else {
                    Text(chinese ? "规划授权已撤回。" : "Planning consent was withdrawn.")
                }
            } else {
                Text(chinese ? "此环境暂未开放后台比较。" : "Background comparison is unavailable in this environment.")
                    .font(.footnote).foregroundStyle(Color.vpSecondaryText)
            }
            if planningNotice != nil {
                Text(chinese ? "委托尚未确认；请重试同一次请求或刷新。" : "Delegation is unconfirmed. Retry the same request or refresh.")
                    .font(.footnote).accessibilityIdentifier("assistant.planning.error")
            }
        }
        .padding(14).frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.vpSurface, in: RoundedRectangle(cornerRadius: 16))
        .accessibilityIdentifier("assistant.planning.controls")
    }
    private var taskList: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(chinese ? "任务" : "Tasks").font(.headline)
            ForEach(taskMessages) { message in
                let turn = taskTurn(for: message)
                VStack(alignment: .leading, spacing: 6) {
                    Text(message.text).font(.subheadline)
                    Text(turn.map { statusLabel($0.status) } ?? (chinese ? "状态待核对" : "Checking status"))
                        .font(.caption).foregroundStyle(Color.vpSecondaryText)
                    HStack {
                        if turn?.status == "completed", let taskID = message.taskId {
                            Button(chinese ? "打开此任务成果" : "Open this task's result") {
                                Task { await openResult(for: taskID) }
                            }.accessibilityIdentifier("assistant.task.open.\(message.sequence)")
                        }
                        if let turn, turn.waiting {
                            Button(chinese ? "取消任务" : "Cancel task", role: .destructive) {
                                Task { await cancelTask(turn.turnId) }
                            }.accessibilityIdentifier("assistant.task.cancel.\(message.sequence)")
                        }
                    }
                }.padding(.vertical, 4)
            }
            if taskNotice != nil {
                Text(chinese ? "任务操作尚未确认，请刷新状态后重试。" : "Task action is unconfirmed. Refresh its status before retrying.")
                    .font(.footnote).accessibilityIdentifier("assistant.task.error")
            }
        }
        .padding(14).frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.vpSurface, in: RoundedRectangle(cornerRadius: 16))
        .accessibilityIdentifier("assistant.tasks")
    }
    private func resultCard(_ result: AssistantResult) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(chinese ? "此任务的成果" : "Result for this task").font(.headline)
            if let content = result.content {
                Text(content.title).font(.title3.bold()).textSelection(.enabled)
                Text(content.summary).textSelection(.enabled)
                if content.schemaVersion == "comparison/1", let options = content.options {
                    ForEach(options) { option in
                        VStack(alignment: .leading, spacing: 3) {
                            Text(option.title).font(.subheadline.bold())
                            Text(option.tradeoff)
                        }
                    }
                } else {
                    Text(chinese ? "此成果需要更新版本的应用查看。" : "Update the app to view this result format.")
                        .font(.footnote)
                }
            }
            Text("\(result.artifactId ?? "") · r\(result.revision ?? 0)")
                .font(.caption2).textSelection(.enabled).accessibilityIdentifier("assistant.result.identity")
        }
        .padding(14).frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.vpSurface, in: RoundedRectangle(cornerRadius: 16))
    }
    private func tripControls(_ currentGoal: AssistantGoal) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if let link = tripLink, link.goalId == currentGoal.goalId {
                if link.tripId != nil {
                    Text(linkedTripTitle + " · v" + String(link.tripHeadVersion ?? 0)
                         + (link.current ? (chinese ? " · 已关联" : " · Linked") : (chinese ? " · 需重新核对" : " · Needs review")))
                        .font(.subheadline).accessibilityIdentifier("assistant.trip.linked")
                    Button(chinese ? "解除行程关联" : "Unlink Trip", role: .destructive) { tripConfirmation = .unlink }
                        .disabled(tripBusy || pendingTripMutation != nil).accessibilityIdentifier("assistant.trip.unlink")
                } else {
                    Text(link.terminalUnlinked
                         ? (chinese ? "已达到关联版本上限；请建立新目标继续。" : "Trip linking is closed at its version limit. Start a new goal to continue.")
                         : (chinese ? "尚未关联行程" : "No Trip linked"))
                        .font(.subheadline).foregroundStyle(Color.vpSecondaryText).accessibilityIdentifier("assistant.trip.unlinked")
                }
                Button(link.tripId == nil ? (chinese ? "选择已有行程" : "Choose existing Trip")
                       : (chinese ? "改关联其他行程" : "Change linked Trip")) { Task { await chooseTrip() } }
                    .disabled(tripBusy || pendingTripMutation != nil || link.terminalUnlinked)
                    .accessibilityIdentifier("assistant.trip.choose")
            } else {
                Text(chinese ? "正在核对行程关联" : "Checking Trip link")
                    .font(.footnote).foregroundStyle(Color.vpSecondaryText)
            }
            if pendingTripMutation?.goalId == currentGoal.goalId {
                Button(chinese ? "重试上次行程操作" : "Retry the same Trip action") { Task { await retryTripMutation() } }
                    .disabled(tripBusy).accessibilityIdentifier("assistant.trip.retry")
            }
            if tripNotice != nil {
                Text(chinese ? "行程关联尚未确认，请刷新或重试。" : "Trip link not confirmed. Refresh or retry.")
                    .font(.caption).foregroundStyle(Color.vpSecondaryText).accessibilityIdentifier("assistant.trip.error")
            }
        }
        .padding(14).frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.vpSurface, in: RoundedRectangle(cornerRadius: 16))
    }
    private var privacyTripControls: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(chinese ? "已有行程关联" : "Existing Trip links").font(.headline)
            Text(chinese ? "文本授权未开放。你仍可解除已有行程关联；不会恢复授权或更改行程。" : "Text processing is unavailable. You can still remove an existing Trip link without restoring consent or changing the Trip.")
                .font(.footnote).foregroundStyle(Color.vpSecondaryText)
            ForEach(privacyLinks, id: \.goalId) { link in
                let title = ownedTrips.first(where: { $0.id == link.tripId })?.title
                    ?? String((link.tripId ?? link.goalId).prefix(8))
                Text(title + " · " + (chinese ? "目标 " : "Goal ") + String(link.goalId.prefix(8)))
                    .font(.subheadline).accessibilityIdentifier("assistant.trip.privacy-link.\(link.goalId)")
                Button(chinese ? "解除此关联" : "Unlink this Trip", role: .destructive) {
                    tripConfirmation = .privacyUnlink(link)
                }
                .disabled(tripBusy || (pendingTripMutation?.action == "unlink" && pendingTripMutation?.goalId != link.goalId))
                .accessibilityIdentifier("assistant.trip.privacy-unlink.\(link.goalId)")
                if pendingTripMutation?.goalId == link.goalId && pendingTripMutation?.action == "unlink" {
                    Button(chinese ? "重试同一次解除" : "Retry the same unlink") { Task { await retryTripMutation() } }
                        .disabled(tripBusy).accessibilityIdentifier("assistant.trip.privacy-retry.\(link.goalId)")
                }
            }
            if privacyNextCursor != nil {
                Button(chinese ? "加载更多关联" : "Load more Trip links") { Task { await loadMorePrivacyLinks() } }
                    .disabled(tripBusy).accessibilityIdentifier("assistant.trip.privacy-more")
            }
        }
        .padding(14).frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.vpSurface, in: RoundedRectangle(cornerRadius: 16))
    }
    private func tripPath(_ goalID: String) -> String { "api/chat/native/v5/goals/\(goalID)/trip" }
    private func ownedTripList(_ initial: NativeDataScope) async throws -> [NativeTripSummary] {
        let data = try await session.tripRequest(path: "api/trips/native/v2", method: "GET")
        guard session.dataScope == initial else { throw NativeDataError.staleSessionResponse }
        let list = try JSONDecoder().decode(NativeTripList.self, from: data)
        guard list.version == 2, Set(list.trips.map(\.id)).count == list.trips.count,
              list.trips.allSatisfy({ UUID(uuidString: $0.id) != nil && !$0.title.isEmpty && $0.headVersion >= 0 })
        else { throw NativeDataError.invalidResponse }
        return list.trips
    }
    private func chooseTrip() async {
        guard !tripBusy, pendingTripMutation == nil, goal != nil, tripLink != nil,
              let initial = session.dataScope else { return }
        tripBusy = true; defer { tripBusy = false }
        do {
            ownedTrips = try await ownedTripList(initial)
            guard session.dataScope == initial else { return }
            if ownedTrips.isEmpty { tripNotice = "empty"; return }
            tripNotice = nil; showTripPicker = true
        } catch { if session.dataScope == initial { tripNotice = "retry" } }
    }
    private func changeTrip(to selected: NativeTripSummary?) async {
        guard !tripBusy, let initial = session.dataScope, let goal,
              let conversationId = conversation?.conversationId, let link = tripLink,
              link.goalId == goal.goalId, link.goalScopeVersion == goal.scopeVersion else { return }
        let request: AssistantTripMutation
        if let pendingTripMutation, pendingTripMutation.goalId == goal.goalId { request = pendingTripMutation }
        else {
            let source = selected == nil ? nil : conversation?.messages.last(where: {
                $0.goalId == goal.goalId && $0.scopeVersion == goal.scopeVersion
            })?.messageId
            request = AssistantTripMutation(goalId:goal.goalId, operationId: UUID().uuidString.lowercased(), conversationId: conversationId,
                sourceMessageId: source, expectedGoalScopeVersion: goal.scopeVersion,
                expectedLinkVersion: link.linkVersion, action: selected == nil ? "unlink" : "link",
                tripId: selected?.id, expectedTripVersion: selected?.headVersion)
            self.pendingTripMutation = request
        }
        tripConfirmation = nil
        await performTripMutation(request, initial: initial)
    }
    private func unlinkPrivacy(_ link: AssistantGoalTripLink) async {
        guard !tripBusy, let initial = session.dataScope, link.tripId != nil else { return }
        let request: AssistantTripMutation
        if let pendingTripMutation, pendingTripMutation.goalId == link.goalId,
           pendingTripMutation.action == "unlink" { request = pendingTripMutation }
        else {
            request = AssistantTripMutation(goalId:link.goalId, operationId:UUID().uuidString.lowercased(),
                conversationId:link.conversationId, sourceMessageId:nil,
                expectedGoalScopeVersion:link.goalScopeVersion, expectedLinkVersion:link.linkVersion,
                action:"unlink", tripId:nil, expectedTripVersion:nil)
            pendingTripMutation = request
        }
        tripConfirmation = nil
        await performTripMutation(request, initial:initial)
    }
    private func retryTripMutation() async {
        guard !tripBusy, let initial = session.dataScope, let pendingTripMutation else { return }
        await performTripMutation(pendingTripMutation, initial:initial)
    }
    private func performTripMutation(_ request: AssistantTripMutation, initial: NativeDataScope) async {
        tripBusy = true
        do {
            let data = try await session.askRequest(path: tripPath(request.goalId), method: "POST", body: JSONEncoder().encode(request))
            guard session.dataScope == initial else { throw NativeDataError.staleSessionResponse }
            let accepted = try JSONDecoder().decode(AssistantGoalTripAccepted.self, from: data)
            guard accepted.version == 5 && accepted.kind == "goal_trip_link" && accepted.operationId == request.operationId
                && accepted.linkVersion == request.expectedLinkVersion + 1
                && accepted.goalScopeVersion == request.expectedGoalScopeVersion + 1
                && accepted.tripId == request.tripId else { throw NativeDataError.invalidResponse }
            pendingTripMutation = nil; tripNotice = nil
        } catch {
            if session.dataScope == initial {
                if case NativeDataError.server(let code) = error,
                   ["INVALID_INPUT", "FORBIDDEN", "DATA_POLICY_BLOCKED", "SERVICE_TASK_CONFLICT", "STALE_TRIP_VERSION", "PROPOSAL_NOT_CONFIRMABLE"].contains(code) {
                    pendingTripMutation = nil
                }
                tripNotice = "retry"
            }
        }
        tripBusy = false
        await reload()
    }
    private func loadPrivacyLinks(_ initial: NativeDataScope) async {
        do {
            let data = try await session.askRequest(path: "api/chat/native/v5/goal-trips", method: "GET")
            guard session.dataScope == initial else { return }
            let read = try JSONDecoder().decode(AssistantGoalTripLinksRead.self, from: data)
            guard read.valid else { throw NativeDataError.invalidResponse }
            privacyLinks = read.links
            privacyNextCursor = read.nextCursor
            if pendingTripMutation?.action == "link" { pendingTripMutation = nil }
            if let pendingTripMutation, pendingTripMutation.action == "unlink",
               read.nextCursor == nil && !read.links.contains(where: { $0.goalId == pendingTripMutation.goalId }) {
                self.pendingTripMutation = nil
            }
            if !read.links.isEmpty {
                do { ownedTrips = try await ownedTripList(initial) }
                catch { if session.dataScope == initial { ownedTrips = [] } }
            } else { ownedTrips = [] }
        } catch {
            if session.dataScope == initial { privacyLinks = []; privacyNextCursor = nil; tripNotice = "retry" }
        }
    }
    private func loadMorePrivacyLinks() async {
        guard !tripBusy, let initial = session.dataScope, let cursor = privacyNextCursor else { return }
        tripBusy = true; defer { tripBusy = false }
        do {
            let data = try await session.askRequest(path: "api/chat/native/v5/goal-trips/\(cursor)", method: "GET")
            guard session.dataScope == initial else { return }
            let page = try JSONDecoder().decode(AssistantGoalTripLinksRead.self, from: data)
            guard page.valid && !page.links.isEmpty && page.links.allSatisfy({ $0.goalId > cursor })
                else { throw NativeDataError.invalidResponse }
            privacyLinks = privacyLinks.filter { $0.goalId <= cursor } + page.links
            privacyNextCursor = page.nextCursor
            if let pendingTripMutation, pendingTripMutation.action == "unlink",
               page.nextCursor == nil && !privacyLinks.contains(where: { $0.goalId == pendingTripMutation.goalId }) {
                self.pendingTripMutation = nil
            }
            tripNotice = nil
        } catch { if session.dataScope == initial { tripNotice = "retry" } }
    }
    private func reload() async {
        guard let initial = session.dataScope else { return }
        let generation = selection.generation
        let requestedID = selection.conversationID
        // A send/cancel readback must follow any refresh already in progress.
        // Returning early here can leave an accepted message invisible until
        // another unrelated refresh happens.
        while refreshBusy {
            do { try await Task.sleep(for: .milliseconds(50)) } catch { return }
            guard ownsSelection(initial, generation) else { return }
        }
        refreshBusy = true; defer { refreshBusy = false }
        do {
            let policyData = try await session.askRequest(path: "api/chat/native/v5/policy", method: "GET")
            guard ownsSelection(initial, generation) else { return }
            let policyReply = try JSONDecoder().decode(NativeTextPolicyReply.self, from: policyData)
            guard policyReply.kind == "policy", policyReply.policy.valid else { throw NativeDataError.invalidResponse }
            policy = policyReply.policy
            if policyReply.policy.consentState != .accepted {
                clearConversationContext(); conversations = []; conversationsNotice = nil
                selection.select(nil)
                selectedTaskID = nil; selectedArtifactID = nil; selectedArtifactTaskID = nil
                invalidateResult(); taskTurns = []; tripLink = nil
                await loadPrivacyLinks(initial)
                return
            }
            privacyLinks = []; privacyNextCursor = nil
            let read = try await AssistantConversationReader.read(requestedID: requestedID,
                isCurrent: { ownsSelection(initial, generation) },
                load: { try await session.assistantConversationRequest(conversationID: requestedID) })
            guard ownsSelection(initial, generation) else { return }
            conversation = read
            selection.conversationID = read.conversationId
            do {
                let bytes = try await session.assistantConversationRequest(list: true)
                guard ownsSelection(initial, generation) else { return }
                let list = try JSONDecoder().decode(AssistantConversationList.self, from: bytes)
                guard list.valid else { throw NativeDataError.invalidResponse }
                conversations = list.conversations; conversationsNotice = nil
            } catch {
                guard ownsSelection(initial, generation) else { return }
                if case NativeDataError.server(let code) = error, ["DATA_POLICY_BLOCKED", "FORBIDDEN", "UNAUTHENTICATED"].contains(code) { throw error }
                conversations = []; conversationsNotice = "retry"
            }
            do {
                let historyData = try await session.askRequest(path: "api/chat/native/v2/turns", method: "GET")
                guard ownsSelection(initial, generation) else { return }
                let history = try JSONDecoder().decode(NativeTextHistory.self, from: historyData)
                guard history.version == 2, history.kind == "history" else { throw NativeDataError.invalidResponse }
                taskTurns = AssistantTaskProjection.eligibleHistory(history.turns, messages: read.messages)
            } catch {
                guard ownsSelection(initial, generation) else { return }
                taskTurns = []
            }
            if let selectedTaskID,
               !taskTurns.contains(where: { $0.serviceTaskId == selectedTaskID && $0.status == "completed" }) {
                invalidateResult()
            }
            if resultActive, let selectedTaskID,
               taskTurns.contains(where: { $0.serviceTaskId == selectedTaskID && $0.status == "completed" }) {
                let resultGeneration = resultFence.begin(scope: initial, now: ProcessInfo.processInfo.systemUptime)
                selectedResult = nil
                do {
                    let bytes = try await session.taskResultRequest(taskID: selectedTaskID)
                    guard resultActive, ownsSelection(initial, generation), self.selectedTaskID == selectedTaskID,
                          resultFence.owns(scope: initial, generation: resultGeneration) else { return }
                    guard resultFence.isCurrent(scope: initial, generation: resultGeneration, active: resultActive, now: ProcessInfo.processInfo.systemUptime)
                    else { resultNotice = "unavailable"; return }
                    let reply = try JSONDecoder().decode(AssistantResultEnvelope.self, from: bytes)
                    guard reply.version == 1, reply.data.belongs(to: selectedTaskID) else { throw NativeDataError.invalidResponse }
                    selectedResult = reply.data; resultNotice = nil
                } catch {
                    if resultActive && ownsSelection(initial, generation) && self.selectedTaskID == selectedTaskID,
                       resultFence.owns(scope: initial, generation: resultGeneration) { selectedResult = nil; resultNotice = "unavailable" }
                }
            }
            if let planningPending, read.messages.contains(where: { $0.messageId == planningPending.messageId }) {
                self.planningPending = nil; planningDraft = ""; planningNotice = nil
            }
            do {
                let bytes = try await session.askRequest(path: "api/chat/native/v5/planning/policy", method: "GET")
                guard ownsSelection(initial, generation) else { return }
                let reply = try JSONDecoder().decode(AssistantPlanningPolicyReply.self, from: bytes)
                guard reply.version == 1, reply.data.valid else { throw NativeDataError.invalidResponse }
                planningPolicy = reply.data
            } catch {
                guard ownsSelection(initial, generation) else { return }
                planningPolicy = nil
            }
            if let currentGoal = read.goals.last, let conversationID = read.conversationId {
                do {
                    let linkData = try await session.askRequest(path: tripPath(currentGoal.goalId), method: "GET")
                    guard ownsSelection(initial, generation) else { return }
                    let link = try JSONDecoder().decode(AssistantGoalTripLink.self, from: linkData)
                    guard link.valid && link.goalId == currentGoal.goalId && link.conversationId == conversationID
                        && link.goalScopeVersion == currentGoal.scopeVersion else { throw NativeDataError.invalidResponse }
                    tripLink = link
                    if let pendingTripMutation {
                        if pendingTripMutation.goalId == link.goalId && pendingTripMutation.operationId == link.lastOperationId {
                            self.pendingTripMutation = nil
                        } else if pendingTripMutation.goalId == link.goalId
                                    && (link.linkVersion > pendingTripMutation.expectedLinkVersion
                                    || link.goalScopeVersion > pendingTripMutation.expectedGoalScopeVersion) {
                            // Another confirmed action superseded the uncertain request.
                            // Its old CAS cannot apply later; keep the current server read.
                            self.pendingTripMutation = nil
                        }
                    }
                    if let linkedID = link.tripId, !ownedTrips.contains(where: { $0.id == linkedID }) {
                        ownedTrips = try await ownedTripList(initial)
                    }
                    guard ownsSelection(initial, generation) else { return }
                    tripNotice = nil
                } catch {
                    guard ownsSelection(initial, generation) else { return }
                    tripLink = nil; tripNotice = "retry"
                }
            } else { tripLink = nil; ownedTrips = [] }
            if let pending, read.messages.contains(where: { $0.messageId == pending.messageId }) { self.pending = nil; draft = "" }
            notice = nil
        } catch {
            guard ownsSelection(initial, generation) else { return }
            policy = nil; clearConversationContext(); conversations = []
            invalidateResult(); tripLink = nil; notice = "retry"
            await loadPrivacyLinks(initial)
        }
    }
    private func accept() async {
        guard !busy, agreed, let policy, let initial = session.dataScope else { return }
        busy = true
        do {
            let body = try JSONEncoder().encode(["policyId": policy.id, "noticeHash": policy.noticeHash])
            _ = try await session.askRequest(path: "api/chat/native/v5/consent", method: "POST", body: body)
            guard session.dataScope == initial else { throw NativeDataError.staleSessionResponse }
            self.policy = nil
        } catch { if session.dataScope == initial { notice = "retry" } }
        busy = false
        await reload()
    }
    private func withdraw() async {
        guard !busy, let policy, let initial = session.dataScope else { return }
        busy = true
        conversations = []; selection.select(nil)
        do {
            let body = try JSONEncoder().encode(["policyId": policy.id])
            _ = try await session.askRequest(path: "api/chat/native/v5/consent", method: "DELETE", body: body)
            guard session.dataScope == initial else { throw NativeDataError.staleSessionResponse }
            conversation = nil; planningPolicy = nil; planningPending = nil; taskTurns = []; invalidateResult()
            selectedTaskID = nil; selectedArtifactID = nil; selectedArtifactTaskID = nil
            pending = nil; pendingTripMutation = nil
            draft = ""; tripLink = nil; self.policy = nil
        } catch { if session.dataScope == initial { notice = "retry" } }
        busy = false
        await reload()
    }
    private func send() async {
        guard !busy, !refreshBusy, conversation != nil, let policy, policy.consentState == .accepted, let initial = session.dataScope else { return }
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
        selection.conversationID = request.conversationId
        busy = true
        do {
            let body = try JSONEncoder().encode(request)
            let data = try await session.askRequest(path: "api/chat/native/v5/conversation", method: "POST", body: body)
            guard session.dataScope == initial else { throw NativeDataError.staleSessionResponse }
            let accepted = try JSONDecoder().decode(AssistantAccepted.self, from: data)
            guard accepted.version == 5 && accepted.kind == "accepted" && accepted.messageId == request.messageId && accepted.conversationId == request.conversationId else { throw NativeDataError.invalidResponse }
            notice = nil
        } catch { if session.dataScope == initial { notice = "retry" } }
        busy = false
        await reload()
    }
    private func acceptPlanning() async {
        guard !planningBusy, planningAgreed, let planningPolicy,
              planningPolicy.consentState == "not_accepted", let policyID = planningPolicy.policyId,
              let noticeHash = planningPolicy.noticeHash, let initial = session.dataScope else { return }
        planningBusy = true
        do {
            let body = try JSONEncoder().encode(["policyId": policyID, "noticeHash": noticeHash])
            let bytes = try await session.askRequest(path: "api/chat/native/v5/planning/policy", method: "POST", body: body)
            guard session.dataScope == initial else { throw NativeDataError.staleSessionResponse }
            let reply = try JSONDecoder().decode(AssistantPlanningConsentReply.self, from: bytes)
            guard reply.version == 1 && reply.kind == "accepted" else { throw NativeDataError.invalidResponse }
            planningNotice = nil
        } catch { if session.dataScope == initial { planningNotice = "retry" } }
        planningBusy = false
        await reload()
    }
    private func delegateComparison(_ currentGoal: AssistantGoal) async {
        guard !planningBusy, goal?.goalId == currentGoal.goalId, goal?.scopeVersion == currentGoal.scopeVersion,
              let initial = session.dataScope, let conversationID = conversation?.conversationId,
              let planningPolicy, planningPolicy.consentState == "accepted",
              let policyID = planningPolicy.policyId else { return }
        let request: AssistantPlanningSubmission
        if let planningPending { request = planningPending }
        else {
            let input = planningDraft.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !input.isEmpty, input.utf16.count <= 4000,
                  let parent = conversation?.messages.last(where: { $0.goalId == currentGoal.goalId && $0.scopeVersion == currentGoal.scopeVersion })
            else { return }
            request = AssistantPlanningSubmission(conversationId: conversationID, goalId: currentGoal.goalId,
                expectedGoalVersion: currentGoal.scopeVersion, parentMessageId: parent.messageId,
                messageId: UUID().uuidString.lowercased(), messageKey: UUID().uuidString.lowercased(),
                threadId: UUID().uuidString.lowercased(), turnId: UUID().uuidString.lowercased(),
                taskId: UUID().uuidString.lowercased(), taskKey: UUID().uuidString.lowercased(),
                planningPolicyId: policyID, locale: chinese ? "zh" : "en", text: input, memoryBasis: [])
            planningPending = request
        }
        planningBusy = true
        do {
            let bytes = try await session.askRequest(path: "api/chat/native/v5/planning/tasks", method: "POST",
                                                     body: JSONEncoder().encode(request))
            guard session.dataScope == initial else { throw NativeDataError.staleSessionResponse }
            let accepted = try JSONDecoder().decode(AssistantPlanningAccepted.self, from: bytes)
            guard accepted.version == 1, accepted.kind == "accepted", accepted.taskId == request.taskId,
                  accepted.turnId == request.turnId, UUID(uuidString: accepted.artifactId) != nil
            else { throw NativeDataError.invalidResponse }
            selectedArtifactID = accepted.artifactId
            selectedArtifactTaskID = accepted.taskId
            planningNotice = nil
        } catch {
            if session.dataScope == initial {
                if case NativeDataError.server(let code) = error,
                   ["INVALID_INPUT", "FORBIDDEN", "DATA_POLICY_BLOCKED", "SERVICE_TASK_CONFLICT"].contains(code) {
                    planningPending = nil
                }
                planningNotice = "retry"
            }
        }
        planningBusy = false
        await reload()
    }
    private func cancelTask(_ turnID: String) async {
        guard !planningBusy, UUID(uuidString: turnID) != nil, let initial = session.dataScope,
              AssistantTaskProjection.waitingTurnIDs(messages: conversation?.messages ?? [], history: taskTurns).contains(turnID) else { return }
        planningBusy = true
        do {
            _ = try await session.askRequest(path: "api/chat/native/v1/turns/\(turnID)/cancel", method: "POST", body: Data("{}".utf8))
            guard session.dataScope == initial else { throw NativeDataError.staleSessionResponse }
            taskNotice = nil
        } catch { if session.dataScope == initial { taskNotice = "retry" } }
        planningBusy = false
        await reload() // Only server readback determines whether cancellation won the race.
    }
    private func openResult(for taskID: String) async {
        guard resultActive, let initial = session.dataScope, UUID(uuidString: taskID) != nil,
              taskMessages.contains(where: { $0.taskId == taskID }),
              taskTurns.contains(where: { $0.serviceTaskId == taskID && $0.status == "completed" }) else { return }
        selectedTaskID = taskID; selectedResult = nil; resultNotice = nil
        let generation = resultFence.begin(scope: initial, now: ProcessInfo.processInfo.systemUptime)
        do {
            let bytes = try await session.taskResultRequest(taskID: taskID)
            guard resultActive, session.dataScope == initial, selectedTaskID == taskID,
                  resultFence.owns(scope: initial, generation: generation) else { return }
            guard resultFence.isCurrent(scope: initial, generation: generation, active: resultActive, now: ProcessInfo.processInfo.systemUptime)
            else { resultNotice = "unavailable"; return }
            let reply = try JSONDecoder().decode(AssistantResultEnvelope.self, from: bytes)
            guard reply.version == 1, reply.data.belongs(to: taskID) else { throw NativeDataError.invalidResponse }
            selectedArtifactID = reply.data.artifactId
            selectedArtifactTaskID = taskID
            selectedResult = reply.data
        } catch {
            if resultActive && session.dataScope == initial && selectedTaskID == taskID,
               resultFence.owns(scope: initial, generation: generation) { resultNotice = "unavailable" }
        }
    }
}

private struct AssistantPlanningConsentReply: Decodable {
    let version: Int
    let kind: String
}

private struct AssistantAccepted: Decodable {
    let conversationId: String
    let version: Int
    let kind: String
    let messageId: String
}

private struct AssistantGoalTripAccepted: Decodable {
    let version: Int
    let kind: String
    let operationId: String
    let linkVersion: Int
    let goalScopeVersion: Int
    let tripId: String?
}
