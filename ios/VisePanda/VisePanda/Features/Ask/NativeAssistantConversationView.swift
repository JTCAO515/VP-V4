import Foundation
import SwiftUI
import OSLog

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

struct AssistantConversationRefreshState {
    private var active: UUID?
    var busy: Bool { active != nil }
    mutating func begin() -> UUID { let token = UUID(); active = token; return token }
    mutating func invalidate() { active = nil }
    func owns(_ token: UUID) -> Bool { active == token }
    mutating func finish(_ token: UUID) { if owns(token) { active = nil } }
}

struct AssistantConversationSelection {
    var conversationID: String?
    var goalEntry: NativeJourneyGoalEntry?
    private(set) var generation = UUID()
    mutating func select(_ id: String?) { conversationID = id; goalEntry = nil; generation = UUID() }
    mutating func selectGoal(_ entry: NativeJourneyGoalEntry) { conversationID = entry.conversationID; goalEntry = entry; generation = UUID() }
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

protocol AssistantTaskStatus {
    var turnId: String { get }
    var serviceTaskId: String? { get }
    var scopeVersion: Int? { get }
    var relationship: String? { get }
    var parentTurnId: String? { get }
    var status: String { get }
    var valid: Bool { get }
    var waiting: Bool { get }
}

extension NativeTextTurn: AssistantTaskStatus {}

struct AssistantConversationTaskStatus: Decodable, AssistantTaskStatus {
    let turnId: String
    let serviceTaskId: String?
    let scopeVersion: Int?
    let relationship: String?
    let parentTurnId: String?
    let status: String
    let outcome: NativeTextTurn.Outcome?
    let goalScopeVersion: Int
    let currentGoalScopeVersion: Int
    var waiting: Bool { ["accepted", "planning", "retrieving", "generating", "validating"].contains(status) }
    var goalScopeCurrent: Bool { goalScopeVersion == currentGoalScopeVersion }
    var valid: Bool {
        guard UUID(uuidString: turnId) != nil, serviceTaskId.flatMap(UUID.init(uuidString:)) != nil,
              (scopeVersion ?? 0) > 0, (1...10001).contains(goalScopeVersion),
              (1...10001).contains(currentGoalScopeVersion) else { return false }
        switch outcome {
        case .answered, .partial, .clarification: return status == "completed"
        case .blocked: return status == "unavailable"
        case .technicalFailure: return status == "failed"
        case nil: return waiting || status == "cancelled" || status == "failed"
        }
    }
}

struct AssistantConversationTaskPage: Decodable {
    let version: Int
    let kind: String
    let conversationId: String
    let conversationSequence: Int
    let limit: Int
    let messages: [AssistantMessage]
    let turns: [AssistantConversationTaskStatus]
    let nextCursor: String?
    var valid: Bool {
        version == 5 && kind == "conversation_tasks" && UUID(uuidString: conversationId) != nil
            && (1...1000001).contains(conversationSequence) && limit == 20 && messages.count <= limit
            && messages.count == turns.count && messages.allSatisfy { $0.valid && $0.taskId != nil && $0.turnId == nil }
            && Set(messages.compactMap(\.taskId)).count == messages.count
            && turns.allSatisfy(\.valid) && Set(turns.compactMap(\.serviceTaskId)).count == turns.count
            && Set(messages.compactMap(\.taskId)) == Set(turns.compactMap(\.serviceTaskId))
            && messages.allSatisfy { message in turns.contains { $0.serviceTaskId == message.taskId && $0.goalScopeVersion == message.scopeVersion } }
            && zip(messages, messages.dropFirst()).allSatisfy { $0.0.sequence > $0.1.sequence }
            && AssistantTaskProjection.eligibleHistory(turns, messages: messages).count == turns.count
            && (nextCursor == nil || (messages.count == limit && nextCursor!.utf8.count <= 512))
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

    static func turn<T: AssistantTaskStatus>(for message: AssistantMessage, in history: [T]) -> T? {
        guard let taskID = message.taskId else { return nil }
        return history.first { $0.serviceTaskId == taskID }
    }

    static func eligibleHistory<T: AssistantTaskStatus>(_ history: [T], messages: [AssistantMessage]) -> [T] {
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

    static func waitingTurnIDs<T: AssistantTaskStatus>(messages: [AssistantMessage], history: [T]) -> [String] {
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
    var onSwitchBlock: ((Bool) -> Void)?
    var goalEntry: Binding<NativeJourneyGoalEntry?> = .constant(nil)
    @State private var entryBusy = false
    @State private var entryFailed = false
    @State private var entryConfirm: NativeJourneyGoalEntry?
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
    @State private var taskTurns: [AssistantConversationTaskStatus] = []
    @State private var taskSourceMessages: [AssistantMessage] = []
    @State private var taskNextCursor: String?
    @State private var taskPageCursor: String?
    @State private var taskSnapshotSequence: Int?
    @State private var taskNotice: String?
    @State private var activityPresentation: ActivityPresentation?
    @State private var selectedTaskID: String?
    @State private var selectedArtifactID: String?
    @State private var resultFence = AssistantResultReadFence()
    @State private var selectedArtifactTaskID: String?
    @State private var selectedResult: AssistantResult?
    @State private var resultNotice: String?
    @State private var operation = "independent_question"
    @State private var agreed = false
    @State private var busy = false
    @State private var refreshState = AssistantConversationRefreshState()
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
    private var refreshBusy: Bool { refreshState.busy }
    private var shellSwitchBlocked: Bool {
        AssistantShellSwitchGate.blocked(busy: busy || planningBusy || tripBusy || entryBlocking,
            intakePending: pending != nil, planningPending: planningPending != nil, tripPending: pendingTripMutation != nil)
    }
    private var composerScopeCurrent: Bool { session.dataScope != nil && boundScope == session.dataScope }
    private var confirmedConversation: Bool {
        guard composerScopeCurrent, let conversation else { return false }
        return conversation.valid && conversation.conversationId == selection.conversationID
    }
    private var composerWaitingForAuthority: Bool { entryBlocking || (refreshBusy && !confirmedConversation) }
    private var explicitGoalEntry: NativeJourneyGoalEntry? {
        get { selection.goalEntry }
        nonmutating set { selection.goalEntry = newValue }
    }
    private var entryPinInvalid: Bool { explicitGoalEntry != nil && explicitGoalEntry?.goal(in: conversation, scope: session.dataScope) == nil }
    private var entryBlocking: Bool { goalEntry.wrappedValue != nil || entryBusy || entryFailed || entryConfirm != nil || entryPinInvalid }
    private var goal: AssistantGoal? {
        if let explicitGoalEntry {
            let selected = explicitGoalEntry.goal(in: conversation, scope: session.dataScope)
            return selected
        }
        return conversation?.goals.last
    }
    private var goalHasCurrentMessage: Bool {
        guard let goal else { return false }
        return AssistantPlanningEligibility.parent(for: goal, messages: conversation?.messages ?? []) != nil
    }
    private var actions: [String] { goal == nil || goal?.scopeVersion == 10001 || !goalHasCurrentMessage ? ["independent_question", "goal_start"] : ["independent_question", "goal_start", "follow_up", "amendment"] }
    private var waitingKey: String {
        let messages = (conversation?.messages ?? []).filter { $0.turnId != nil && ["accepted","planning","retrieving","generating","validating"].contains($0.status) }.map(\.messageId)
        let tasks = AssistantTaskProjection.waitingTurnIDs(messages: taskSourceMessages, history: taskTurns)
        return (messages + tasks).joined(separator: ":")
    }
    private struct ActivityPresentation: Identifiable {
        let id = UUID()
        let target: NativeTaskActivitySelection
        let selectionGeneration: UUID
        let goalID: String?
        let goalVersion: Int?
    }
    private func activityTarget(for taskID: String) -> NativeTaskActivitySelection? {
        guard resultActive, composerScopeCurrent, !entryBusy, !entryFailed, policy?.consentState == .accepted,
              let scope = session.dataScope, let conversationID = conversation?.conversationId,
              taskMessages.contains(where: { $0.taskId == taskID }),
              let turn = taskTurns.first(where: { $0.serviceTaskId == taskID }), turn.valid, turn.goalScopeCurrent else { return nil }
        return NativeTaskActivitySelection(scope: scope, conversationID: conversationID, taskID: taskID,
            latestTurnID: turn.turnId, eligible: true)
    }
    private var currentActivityTarget: NativeTaskActivitySelection? {
        guard let presentation = activityPresentation,
              selection.owns(presentation.selectionGeneration), goal?.goalId == presentation.goalID,
              goal?.scopeVersion == presentation.goalVersion,
              activityTarget(for: presentation.target.taskID) == presentation.target else { return nil }
        return presentation.target
    }
    private func openActivity(for taskID: String) {
        traceActivity("open", taskIndex: taskMessages.firstIndex(where: { $0.taskId == taskID }))
        guard let target = activityTarget(for: taskID) else { traceActivity("rejected"); return }
        activityPresentation = ActivityPresentation(target: target, selectionGeneration: selection.generation,
            goalID: goal?.goalId, goalVersion: goal?.scopeVersion)
        traceActivity("selected")
    }
    private func traceActivity(_ phase: String, taskIndex: Int? = nil) {
        guard ProcessInfo.processInfo.arguments.contains("-VisePandaActivityTrace"), session.dataScope.flatMap({ URL(string: $0.endpoint) })?.scheme == "http" else { return }
        let data: [String: Any] = ["phase": phase, "taskIndex": taskIndex ?? -1, "active": resultActive,
            "scope": composerScopeCurrent, "sheet": activityPresentation != nil, "qualified": currentActivityTarget != nil]
        if let bytes = try? JSONSerialization.data(withJSONObject: data) {
            let safe = String(decoding: bytes, as: UTF8.self)
            Logger(subsystem: "space.go2china.activity", category: "local-test").notice("VP_ACTIVITY_TRACE \(safe, privacy: .public)")
        }
    }

    private var taskMessages: [AssistantMessage] { AssistantTaskProjection.latestMessages(taskSourceMessages) }
    private func taskTurn(for message: AssistantMessage) -> AssistantConversationTaskStatus? {
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
                if !entryBlocking && session.dataScope != nil && (policy?.consentState == .accepted || selection.conversationID != nil) {
                    conversationControls
                }
                if entryBlocking {
                    goalEntryStatus
                } else if let policy {
                    if policy.consentState == .accepted {
                        if let goal {
                            Text((chinese ? "当前目标 v" : "Current goal v") + String(goal.scopeVersion) + ": " + goal.text)
                                .font(.headline).accessibilityIdentifier("assistant.current-goal")
                            if goal.scopeVersion < 10001 { tripControls(goal) }
                            else { Text(chinese ? "此终止目标只读。" : "This terminal goal is read only.") }
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
                        if let goal, goal.scopeVersion < 10001 || planningPending != nil { planningControls(goal) }
                        if !taskMessages.isEmpty || taskNotice != nil || taskNextCursor != nil || taskPageCursor != nil || conversation?.messages.contains(where: { $0.taskId != nil }) == true { taskList }
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
                    Text(chinese ? "请求未确认，请重试或刷新。" : "Request not confirmed. Retry or refresh.").font(.footnote).accessibilityIdentifier("assistant.notice")
                }
            }.padding(VPSpacing.standard)
        }
        .sheet(item: $activityPresentation) { presentation in
            NavigationStack {
                NativeTaskActivityView(selection: currentActivityTarget, isPresented: currentActivityTarget != nil,
                    session: session, chinese: chinese, onInvalidate: {
                        if activityPresentation?.id == presentation.id { activityPresentation = nil }
                    })
                    .id(presentation.id)
                    .navigationTitle(chinese ? "任务活动" : "Task activity")
                    .toolbar { ToolbarItem(placement: .topBarTrailing) {
                        Button(chinese ? "完成" : "Done") { activityPresentation = nil }.accessibilityIdentifier("assistant.activity.done")
                    } }
            }
        }
        .onChange(of: currentActivityTarget) { _, target in
            if target == nil && currentActivityTarget == nil { traceActivity("invalidate"); activityPresentation = nil }
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
            if !entryBlocking && policy?.consentState == .accepted && session.dataScope != nil {
                VStack(spacing: 8) {
                    Picker(chinese ? "消息类型" : "Message type", selection: $operation) {
                        ForEach(actions, id: \.self) { action in Text(actionLabel(action)).tag(action) }
                    }.pickerStyle(.menu).accessibilityIdentifier("assistant.operation")
                    HStack {
                        TextField(chinese ? "告诉 VP…" : "Ask VP…", text: $draft, axis: .vertical)
                            .lineLimit(1...5).autocorrectionDisabled().accessibilityIdentifier("assistant.composer")
                        Button(pending != nil && conversation == nil ? (chinese ? "重试同一次消息" : "Retry same message") : (chinese ? "发送" : "Send")) { Task { await send() } }
                            .disabled(busy || !composerScopeCurrent || composerWaitingForAuthority || (conversation == nil && pending == nil) || (pending == nil && draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty))
                            .accessibilityIdentifier("assistant.send")
                    }
                }.padding().background(.bar)
            }
        }
        .toolbar { ToolbarItem(placement: .topBarTrailing) { Button(chinese ? "刷新" : "Refresh") { Task { await reload() } }.disabled(refreshBusy) } }
        .task(id: GoalEntryLoadKey(id: goalEntry.wrappedValue?.id, active: resultActive)) {
            guard resultActive, let entry = goalEntry.wrappedValue else { return }
            await openGoalEntry(entry, discardDraft: false)
        }
        .alert(chinese ? "切换目标？" : "Switch goal?", isPresented: Binding(
            get: { entryConfirm != nil }, set: { if !$0 { entryConfirm = nil } })) {
            Button(chinese ? "保留草稿，留在原上下文" : "Keep draft and stay") { cancelGoalEntry() }
            Button(chinese ? "丢弃未发草稿并切换" : "Discard unsent draft and switch", role: .destructive) {
                guard let entry = goalEntry.wrappedValue else { return }
                entryConfirm = nil
                Task { await openGoalEntry(entry, discardDraft: true) }
            }
        } message: {
            Text(chinese ? "当前未发送内容不会带入另一个目标。取消可保留；切换前会再次核对目标。" : "Your unsent content will not move to another goal. Cancel to keep it; switching rechecks the target first.")
        }
        .task(id: session.dataScope) {
            let requested = session.dataScope
            refreshState.invalidate()
            // Reappearance under the same actor is not a conversation switch.
            // Preserve immutable recovery and drafts; an entry owns its own read.
            if NativeAssistantScopeAppearance.preservesContext(bound: boundScope, retained: session.retainedDataScope, active: requested) {
                if requested == nil { policy = nil; clearConversationProjection() }
                else if !entryBlocking { await reload(replacing: true) }
                return
            }
            // A temporary offline scope may retain a pending immutable intake.
            // Keep its selected ID only for that exact retained account/epoch/generation.
            if explicitGoalEntry?.scope != session.retainedDataScope { explicitGoalEntry = nil; entryFailed = false; entryConfirm = nil }
            selection.select(boundScope == session.retainedDataScope ? selection.conversationID : nil)
            conversations = []; conversationsNotice = nil
            if boundScope != session.retainedDataScope {
                pending = nil; draft = ""; boundScope = session.retainedDataScope
            }
            policy = nil; conversation = nil; notice = nil
            planningPolicy = nil; planningPending = nil; planningDraft = ""; planningNotice = nil
            taskTurns = []; taskSourceMessages = []; taskNextCursor = nil; taskPageCursor = nil; taskSnapshotSequence = nil; taskNotice = nil
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
        .onChange(of: shellSwitchBlocked, initial: true) { _, blocked in onSwitchBlock?(blocked) }
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

    private struct GoalEntryLoadKey: Hashable { let id: UUID?; let active: Bool }

    private var goalEntryStatus: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(entryBusy ? (chinese ? "正在核对此会话与目标…" : "Checking this conversation and goal…")
                 : (chinese ? "尚未打开此目标。目标可能已变更，或当前有未决更改/未发草稿。" : "This goal has not been opened. It may have changed, or a pending change/unsent draft needs your decision."))
                .accessibilityIdentifier("assistant.goal-entry.status")
            Button(goalEntry.wrappedValue == nil && entryPinInvalid
                   ? (chinese ? "退出已失效的目标选择" : "Leave expired goal selection")
                   : (chinese ? "取消，保留原上下文" : "Cancel and keep previous context")) { cancelGoalEntry() }
                .accessibilityIdentifier("assistant.goal-entry.cancel")
        }
    }

    private func cancelGoalEntry() {
        let invalidAppliedPin = goalEntry.wrappedValue == nil && entryPinInvalid
        goalEntry.wrappedValue = nil; entryFailed = false; entryConfirm = nil; entryBusy = false
        if invalidAppliedPin { explicitGoalEntry = nil }
    }

    private func openGoalEntry(_ entry: NativeJourneyGoalEntry, discardDraft: Bool) async {
        guard resultActive, entry.scope == session.dataScope, goalEntry.wrappedValue?.id == entry.id else { return }
        // First mount's scope task binds/rotates selection before entry validation.
        while session.busy || boundScope != entry.scope {
            do { try await Task.sleep(for: .milliseconds(50)) } catch { return }
            guard resultActive, session.dataScope == entry.scope, goalEntry.wrappedValue?.id == entry.id, !Task.isCancelled else { return }
        }
        guard !busy, !planningBusy, !tripBusy, pending == nil, planningPending == nil, pendingTripMutation == nil else { entryFailed = true; return }
        let generation = selection.generation
        func current() -> Bool { resultActive && session.dataScope == entry.scope && goalEntry.wrappedValue?.id == entry.id && selection.owns(generation) }
        refreshState.invalidate(); entryBusy = true; entryFailed = false
        defer { if goalEntry.wrappedValue?.id == entry.id { entryBusy = false } }
        do {
            let (readPolicy, read) = try await NativeJourneyGoalReader.read(entry, isCurrent: current,
                policy: { try await session.askRequest(path: "api/chat/native/v5/policy", method: "GET") },
                conversation: { try await session.assistantConversationRequest(conversationID: entry.conversationID) })
            guard current(), !busy, !planningBusy, !tripBusy, pending == nil, planningPending == nil, pendingTripMutation == nil else { return }
            switch NativeJourneyGoalDraftDecision.decide(pending: pending != nil || planningPending != nil || pendingTripMutation != nil,
                                                        draft: draft, planningDraft: planningDraft, discard: discardDraft) {
            case .blocked: entryFailed = true; return
            case .confirmDiscard: entryConfirm = entry; return
            case .open: break
            }
            // Only now, after revalidation and the user's draft decision, replace context.
            clearConversationContext(); selection.selectGoal(entry)
            policy = readPolicy; conversation = read; boundScope = entry.scope
            operation = read.goals.first(where: { $0.goalId == entry.goalID })?.scopeVersion != 10001 && read.messages.contains(where: { $0.goalId == entry.goalID && $0.scopeVersion == entry.scopeVersion }) ? "follow_up" : "independent_question"
            goalEntry.wrappedValue = nil; entryBusy = false; entryFailed = false; entryConfirm = nil
            let appliedGeneration = selection.generation
            Task {
                guard session.dataScope == entry.scope, selection.owns(appliedGeneration) else { return }
                await reload(replacing: true)
            }
        } catch {
            guard current() else { return }
            entryFailed = true
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
        explicitGoalEntry = nil; entryFailed = false; entryConfirm = nil; goalEntry.wrappedValue = nil
        selection.select(id)
        refreshState.invalidate()
        clearConversationContext()
        Task { await reload(replacing: true) }
    }

    private func clearConversationProjection() {
        activityPresentation = nil
        conversation = nil; planningPolicy = nil; taskTurns = []; taskSourceMessages = []; taskNextCursor = nil; taskPageCursor = nil; taskSnapshotSequence = nil
        selectedTaskID = nil; selectedArtifactID = nil; selectedArtifactTaskID = nil
        invalidateResult()
        tripLink = nil; ownedTrips = []; tripConfirmation = nil; showTripPicker = false
    }

    private func clearConversationContext() {
        clearConversationProjection()
        pending = nil; draft = ""; operation = "independent_question"; notice = nil
        planningPending = nil; planningDraft = ""; planningAgreed = false; planningNotice = nil
        taskNotice = nil; pendingTripMutation = nil; tripNotice = nil
    }

    private func ownsSelection(_ initial: NativeDataScope, _ generation: UUID) -> Bool {
        session.dataScope == initial && selection.owns(generation) && !Task.isCancelled
    }

    private func ownsRefresh(_ initial: NativeDataScope, _ generation: UUID, _ refreshToken: UUID) -> Bool {
        ownsSelection(initial, generation) && refreshState.owns(refreshToken)
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
                    let eligibility = AssistantPlanningEligibility.evaluate(goal: currentGoal,
                        messages: conversation?.messages ?? [], hasPending: planningPending != nil)
                    if eligibility == .missingParent {
                        Text(chinese ? "当前消息页中没有此目标版本的消息，暂无法创建后台比较。" : "This message page has no message for this goal version. Background comparison cannot be started.")
                            .font(.footnote).accessibilityIdentifier("assistant.planning.missingParent")
                    } else if eligibility == .terminal {
                        Text(chinese ? "此目标版本已结束，无法创建后台比较。" : "This goal version has ended. Background comparison cannot be started.")
                            .font(.footnote)
                    } else {
                        TextField(chinese ? "要比较什么？" : "What should VP compare?", text: $planningDraft, axis: .vertical)
                            .lineLimit(2...5).accessibilityIdentifier("assistant.planning.composer")
                        Button(planningPending == nil ? (chinese ? "开始后台比较" : "Start background comparison")
                               : (chinese ? "重试同一次委托" : "Retry the same request")) {
                            Task { await delegateComparison(currentGoal) }
                        }
                        .disabled(planningBusy || (planningPending == nil && planningDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty))
                        .accessibilityIdentifier("assistant.planning.send")
                    }
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
            Text(chinese ? "任务（当前页，最多 20 项）" : "Tasks (current page, up to 20)").font(.headline)
            ForEach(taskMessages) { message in
                let turn = taskTurn(for: message)
                VStack(alignment: .leading, spacing: 6) {
                    Text(message.text).font(.subheadline)
                    Text(turn.map { statusLabel($0.status) } ?? (chinese ? "状态待核对" : "Checking status"))
                        .font(.caption).foregroundStyle(Color.vpSecondaryText)
                    if turn?.goalScopeCurrent == false {
                        Text(chinese ? "该任务的目标已改变，成果需重新核对。" : "This task's goal changed. Its result needs rechecking.").font(.caption)
                    }
                    HStack {
                        if let taskID = message.taskId, activityTarget(for: taskID) != nil {
                            Button(chinese ? "查看任务活动" : "View task activity") { openActivity(for: taskID) }
                                .buttonStyle(.borderless).accessibilityIdentifier("assistant.task.activity.\(message.sequence)")
                        }
                        if turn?.status == "completed", turn?.goalScopeCurrent == true, let taskID = message.taskId {
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
            if taskMessages.isEmpty && taskNotice == nil {
                Text(chinese ? "当前页没有可读取的任务。" : "No readable tasks on this page.").font(.caption)
            }
            if taskPageCursor != nil {
                Button(chinese ? "返回任务第一页" : "First task page") {
                    taskPageCursor = nil; refreshState.invalidate()
                    Task { await reload(replacing: true) }
                }.disabled(refreshBusy || busy || planningBusy).accessibilityIdentifier("assistant.tasks.first")
            }
            if taskNextCursor != nil {
                Button(chinese ? "下一页任务" : "Next task page") { Task { await nextTaskPage() } }
                    .disabled(refreshBusy || busy || planningBusy).accessibilityIdentifier("assistant.tasks.next")
            }
            if taskNotice != nil {
                Text(chinese ? "任务状态暂不可用，请刷新后重新核对。" : "Task status is unavailable. Refresh to recheck.")
                    .font(.footnote).accessibilityIdentifier("assistant.task.error")
            }
        }
        .padding(14).frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.vpSurface, in: RoundedRectangle(cornerRadius: 16))
        .accessibilityElement(children: .contain)
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
        refreshState.invalidate()
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
        await reload(replacing: true)
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
    private func nextTaskPage() async {
        guard composerScopeCurrent, !busy, !planningBusy, !refreshBusy, let initial = session.dataScope,
              let id = conversation?.conversationId, let sequence = conversation?.nextSequence,
              let cursor = taskNextCursor else { return }
        let generation = selection.generation
        let refreshToken = refreshState.begin()
        defer { refreshState.finish(refreshToken) }
        do {
            let bytes = try await session.assistantTaskHistoryRequest(conversationID: id, cursor: cursor)
            guard ownsRefresh(initial, generation, refreshToken) else { return }
            let page = try JSONDecoder().decode(AssistantConversationTaskPage.self, from: bytes)
            guard page.valid, page.conversationId == id, page.conversationSequence == sequence else { throw NativeDataError.invalidResponse }
            taskSourceMessages = page.messages; taskTurns = page.turns; taskNextCursor = page.nextCursor
            taskPageCursor = cursor; taskSnapshotSequence = page.conversationSequence
            selectedTaskID = nil; selectedArtifactID = nil; selectedArtifactTaskID = nil; invalidateResult()
            taskNotice = nil
        } catch {
            guard ownsRefresh(initial, generation, refreshToken) else { return }
            taskSourceMessages = []; taskTurns = []; taskNextCursor = nil; invalidateResult(); taskNotice = "retry"
        }
    }

    private func reload(replacing: Bool = false) async {
        guard !entryBlocking else { return }
        guard let initial = session.dataScope else { return }
        let generation = selection.generation
        let requestedID = selection.conversationID
        // Background work coalesces. A mutation readback takes ownership immediately;
        // an older slow response cannot keep the composer or the new readback waiting.
        guard !busy, replacing || !refreshBusy else { return }
        let refreshToken = refreshState.begin()
        defer { refreshState.finish(refreshToken) }
        do {
            let policyData = try await session.askRequest(path: "api/chat/native/v5/policy", method: "GET")
            guard ownsRefresh(initial, generation, refreshToken) else { return }
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
                isCurrent: { ownsRefresh(initial, generation, refreshToken) },
                load: { try await session.assistantConversationRequest(conversationID: requestedID) })
            guard ownsRefresh(initial, generation, refreshToken) else { return }
            conversation = read
            selection.conversationID = read.conversationId
            do {
                let bytes = try await session.assistantConversationRequest(list: true)
                guard ownsRefresh(initial, generation, refreshToken) else { return }
                let list = try JSONDecoder().decode(AssistantConversationList.self, from: bytes)
                guard list.valid else { throw NativeDataError.invalidResponse }
                conversations = list.conversations; conversationsNotice = nil
            } catch {
                guard ownsRefresh(initial, generation, refreshToken) else { return }
                if case NativeDataError.server(let code) = error, ["DATA_POLICY_BLOCKED", "FORBIDDEN", "UNAUTHENTICATED"].contains(code) { throw error }
                conversations = []; conversationsNotice = "retry"
            }
            do {
                if let id = read.conversationId {
                    let pageCursor = !replacing && taskSnapshotSequence == read.nextSequence ? taskPageCursor : nil
                    let bytes = try await session.assistantTaskHistoryRequest(conversationID: id, cursor: pageCursor)
                    guard ownsRefresh(initial, generation, refreshToken) else { return }
                    let page = try JSONDecoder().decode(AssistantConversationTaskPage.self, from: bytes)
                    guard page.valid, page.conversationId == id, page.conversationSequence == read.nextSequence else {
                        throw NativeDataError.invalidResponse
                    }
                    taskSourceMessages = page.messages; taskTurns = page.turns; taskNextCursor = page.nextCursor
                    taskPageCursor = pageCursor; taskSnapshotSequence = page.conversationSequence
                    taskNotice = nil
                } else { taskSourceMessages = []; taskTurns = []; taskNextCursor = nil }
            } catch {
                guard ownsRefresh(initial, generation, refreshToken) else { return }
                taskTurns = []; taskSourceMessages = []; taskNextCursor = nil; taskPageCursor = nil; taskSnapshotSequence = nil; taskNotice = "retry"
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
                    guard resultActive, ownsRefresh(initial, generation, refreshToken), self.selectedTaskID == selectedTaskID,
                          resultFence.owns(scope: initial, generation: resultGeneration) else { return }
                    guard resultFence.isCurrent(scope: initial, generation: resultGeneration, active: resultActive, now: ProcessInfo.processInfo.systemUptime)
                    else { resultNotice = "unavailable"; return }
                    let reply = try JSONDecoder().decode(AssistantResultEnvelope.self, from: bytes)
                    guard reply.version == 1, reply.data.belongs(to: selectedTaskID) else { throw NativeDataError.invalidResponse }
                    selectedResult = reply.data; resultNotice = nil
                } catch {
                    if resultActive && ownsRefresh(initial, generation, refreshToken) && self.selectedTaskID == selectedTaskID,
                       resultFence.owns(scope: initial, generation: resultGeneration) { selectedResult = nil; resultNotice = "unavailable" }
                }
            }
            if let planningPending, read.messages.contains(where: { $0.messageId == planningPending.messageId }) {
                self.planningPending = nil
                if planningDraft.trimmingCharacters(in: .whitespacesAndNewlines) == planningPending.text { planningDraft = "" }
                planningNotice = nil
            }
            do {
                let bytes = try await session.askRequest(path: "api/chat/native/v5/planning/policy", method: "GET")
                guard ownsRefresh(initial, generation, refreshToken) else { return }
                let reply = try JSONDecoder().decode(AssistantPlanningPolicyReply.self, from: bytes)
                guard reply.version == 1, reply.data.valid else { throw NativeDataError.invalidResponse }
                planningPolicy = reply.data
            } catch {
                guard ownsRefresh(initial, generation, refreshToken) else { return }
                planningPolicy = nil
            }
            if let currentGoal = read.goals.last, let conversationID = read.conversationId {
                do {
                    let linkData = try await session.askRequest(path: tripPath(currentGoal.goalId), method: "GET")
                    guard ownsRefresh(initial, generation, refreshToken) else { return }
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
                        let refreshedTrips = try await ownedTripList(initial)
                        guard ownsRefresh(initial, generation, refreshToken) else { return }
                        ownedTrips = refreshedTrips
                    }
                    guard ownsRefresh(initial, generation, refreshToken) else { return }
                    tripNotice = nil
                } catch {
                    guard ownsRefresh(initial, generation, refreshToken) else { return }
                    tripLink = nil; tripNotice = "retry"
                }
            } else { tripLink = nil; ownedTrips = [] }
            if let pending, read.messages.contains(where: { $0.messageId == pending.messageId }) {
                self.pending = nil
                if draft.trimmingCharacters(in: .whitespacesAndNewlines) == pending.text { draft = "" }
            }
            notice = nil
        } catch {
            guard ownsRefresh(initial, generation, refreshToken) else { return }
            // A lost POST receipt followed by a transient read failure must retain
            // the same immutable request keys. Only authoritative denial clears intake.
            let authorityLost: Bool
            if case NativeDataError.server(let code) = error {
                authorityLost = ["DATA_POLICY_BLOCKED", "FORBIDDEN", "UNAUTHENTICATED"].contains(code)
            } else { authorityLost = false }
            if authorityLost {
                policy = nil; clearConversationContext()
            } else { clearConversationProjection() }
            conversations = []; notice = "retry"
            if authorityLost { await loadPrivacyLinks(initial) }
        }
    }
    private func accept() async {
        guard !busy, agreed, let policy, let initial = session.dataScope else { return }
        refreshState.invalidate()
        busy = true
        do {
            let body = try JSONEncoder().encode(["policyId": policy.id, "noticeHash": policy.noticeHash])
            _ = try await session.askRequest(path: "api/chat/native/v5/consent", method: "POST", body: body)
            guard session.dataScope == initial else { throw NativeDataError.staleSessionResponse }
            self.policy = nil
        } catch { if session.dataScope == initial { notice = "retry" } }
        busy = false
        await reload(replacing: true)
    }
    private func withdraw() async {
        guard !busy, let policy, let initial = session.dataScope else { return }
        refreshState.invalidate()
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
        await reload(replacing: true)
    }
    private func send() async {
        guard !busy, !composerWaitingForAuthority, let policy, policy.consentState == .accepted, let initial = session.dataScope,
              boundScope == initial,
              conversation != nil || (pending != nil && pending?.conversationId == selection.conversationID) else { return }
        if let pending, pending.conversationId != selection.conversationID || pending.policyId != policy.id { return }
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard pending != nil || (!text.isEmpty && text.utf16.count <= 4000) else { return }
        let request: AssistantSubmission
        if let pending { request = pending }
        else {
            let relationship = operation
            let relatedGoal = ["follow_up", "amendment"].contains(relationship) ? goal : nil
            guard relatedGoal != nil || !["follow_up", "amendment"].contains(relationship) else { return }
            let parent = relatedGoal.flatMap { current in conversation?.messages.last(where: { $0.goalId == current.goalId && $0.scopeVersion == current.scopeVersion }) }
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
        refreshState.invalidate()
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
        await reload(replacing: true)
    }
    private func acceptPlanning() async {
        guard !planningBusy, planningAgreed, let planningPolicy,
              planningPolicy.consentState == "not_accepted", let policyID = planningPolicy.policyId,
              let noticeHash = planningPolicy.noticeHash, let initial = session.dataScope else { return }
        refreshState.invalidate()
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
        await reload(replacing: true)
    }
    private func delegateComparison(_ currentGoal: AssistantGoal) async {
        guard !planningBusy, goal?.goalId == currentGoal.goalId, goal?.scopeVersion == currentGoal.scopeVersion,
              let initial = session.dataScope, let conversationID = conversation?.conversationId,
              let planningPolicy, planningPolicy.consentState == "accepted",
              let policyID = planningPolicy.policyId else { return }
        let eligibility = AssistantPlanningEligibility.evaluate(goal: currentGoal,
            messages: conversation?.messages ?? [], hasPending: planningPending != nil)
        guard eligibility == .create || eligibility == .retry else { return }
        let request: AssistantPlanningSubmission
        if let planningPending { request = planningPending }
        else {
            let input = planningDraft.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !input.isEmpty, input.utf16.count <= 4000,
                  let parent = AssistantPlanningEligibility.parent(for: currentGoal, messages: conversation?.messages ?? [])
            else { return }
            request = AssistantPlanningSubmission(conversationId: conversationID, goalId: currentGoal.goalId,
                expectedGoalVersion: currentGoal.scopeVersion, parentMessageId: parent.messageId,
                messageId: UUID().uuidString.lowercased(), messageKey: UUID().uuidString.lowercased(),
                threadId: UUID().uuidString.lowercased(), turnId: UUID().uuidString.lowercased(),
                taskId: UUID().uuidString.lowercased(), taskKey: UUID().uuidString.lowercased(),
                planningPolicyId: policyID, locale: chinese ? "zh" : "en", text: input, memoryBasis: [])
            planningPending = request
        }
        refreshState.invalidate()
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
        await reload(replacing: true)
    }
    private func cancelTask(_ turnID: String) async {
        guard !planningBusy, UUID(uuidString: turnID) != nil, let initial = session.dataScope,
              AssistantTaskProjection.waitingTurnIDs(messages: taskSourceMessages, history: taskTurns).contains(turnID) else { return }
        refreshState.invalidate()
        planningBusy = true
        do {
            _ = try await session.askRequest(path: "api/chat/native/v1/turns/\(turnID)/cancel", method: "POST", body: Data("{}".utf8))
            guard session.dataScope == initial else { throw NativeDataError.staleSessionResponse }
            taskNotice = nil
        } catch { if session.dataScope == initial { taskNotice = "retry" } }
        planningBusy = false
        await reload(replacing: true) // Only server readback determines whether cancellation won the race.
    }
    private func openResult(for taskID: String) async {
        guard resultActive, let initial = session.dataScope, UUID(uuidString: taskID) != nil,
              taskMessages.contains(where: { $0.taskId == taskID }),
              taskTurns.contains(where: { $0.serviceTaskId == taskID && $0.status == "completed" && $0.goalScopeCurrent }) else { return }
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


// Navigation protection only. An uncertain immutable request is never cancelled by a mode switch.
enum AssistantShellSwitchGate {
    static func blocked(busy: Bool, intakePending: Bool, planningPending: Bool, tripPending: Bool) -> Bool {
        busy || intakePending || planningPending || tripPending
    }
}

// Retry preserves the admitted immutable request even when its parent leaves the recent page.
enum AssistantPlanningEligibility: Equatable {
    case create, retry, missingParent, terminal

    static func parent(for goal: AssistantGoal, messages: [AssistantMessage]) -> AssistantMessage? {
        messages.last { $0.goalId == goal.goalId && $0.scopeVersion == goal.scopeVersion }
    }

    static func evaluate(goal: AssistantGoal, messages: [AssistantMessage], hasPending: Bool) -> Self {
        if hasPending { return .retry }
        guard goal.scopeVersion < 10001 else { return .terminal }
        return parent(for: goal, messages: messages) == nil ? .missingParent : .create
    }
}
