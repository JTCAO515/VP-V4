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
    var valid: Bool {
        version == 5 && kind == "goal_trip_links" && links.count <= 100
        && links.allSatisfy { $0.valid && $0.tripId != nil }
        && Set(links.map(\.goalId)).count == links.count
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
    @State private var policy: NativeTextPolicy?
    @State private var conversation: AssistantConversation?
    @State private var resultStore = NativeResultStore()
    @State private var draft = ""
    @State private var operation = "independent_question"
    @State private var agreed = false
    @State private var busy = false
    @State private var notice: String?
    @State private var pending: AssistantSubmission?
    @State private var boundScope: NativeDataScope?
    @State private var tripLink: AssistantGoalTripLink?
    @State private var ownedTrips: [NativeTripSummary] = []
    @State private var pendingTripMutation: AssistantTripMutation?
    @State private var privacyLinks: [AssistantGoalTripLink] = []
    @State private var tripBusy = false
    @State private var tripNotice: String?
    @State private var showTripPicker = false
    @State private var tripConfirmation: AssistantTripConfirmation?
    private var session: NativeSession { settings.nativeSession }
    private var chinese: Bool { settings.selectedLocale == .zh }
    private var goal: AssistantGoal? { conversation?.goals.last }
    private var actions: [String] { goal == nil ? ["independent_question", "goal_start"] : ["independent_question", "goal_start", "follow_up", "amendment"] }
    private var waitingKey: String { (conversation?.messages ?? []).filter { ["accepted","planning","retrieving","generating","validating"].contains($0.status) }.map(\.messageId).joined(separator: ":") }
    private var linkedTripTitle: String {
        guard let id = tripLink?.tripId else { return "" }
        return ownedTrips.first(where: { $0.id == id })?.title ?? (chinese ? "已关联行程" : "Linked Trip")
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                BrandHeader()
                Text(chinese ? "与 VP 继续" : "Continue with VP").font(.title2.bold())
                Text(chinese ? "对话和目标会保存。独立问题沿用当前文本回答；目标改口先记录，尚不会自动启动规划任务。" : "Your conversation and goal are saved. Separate questions use the current text answer; goal changes are recorded without starting planning work.")
                    .font(.footnote).foregroundStyle(Color.vpSecondaryText)
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
                        TimelineView(.periodic(from: .now, by: 1)) { _ in
                            NativeResultCard(store: resultStore, scope: session.dataScope, chinese: chinese)
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
                            .disabled(busy || (pending == nil && draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty))
                            .accessibilityIdentifier("assistant.send")
                    }
                }.padding().background(.bar)
            }
        }
        .toolbar { ToolbarItem(placement: .topBarTrailing) { Button(chinese ? "刷新" : "Refresh") { Task { await reload() } }.disabled(busy) } }
        .task(id: session.dataScope) {
            let requested = session.dataScope
            if boundScope != session.retainedDataScope {
                pending = nil; draft = ""; boundScope = session.retainedDataScope
            }
            policy = nil; conversation = nil; resultStore.clear(); notice = nil
            tripLink = nil; ownedTrips = []; pendingTripMutation = nil; privacyLinks = []
            tripNotice = nil; tripConfirmation = nil; showTripPicker = false
            guard requested != nil else { return }
            while busy {
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
            tripNotice = nil
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
            if pendingTripMutation?.action == "link" { pendingTripMutation = nil }
            if let pendingTripMutation, pendingTripMutation.action == "unlink",
               !read.links.contains(where: { $0.goalId == pendingTripMutation.goalId }) {
                self.pendingTripMutation = nil
            }
            if !read.links.isEmpty {
                do { ownedTrips = try await ownedTripList(initial) }
                catch { if session.dataScope == initial { ownedTrips = [] } }
            } else { ownedTrips = [] }
        } catch {
            if session.dataScope == initial { privacyLinks = []; tripNotice = "retry" }
        }
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
            if policyReply.policy.consentState != .accepted {
                conversation = nil; pending = nil; resultStore.clear(); tripLink = nil
                await loadPrivacyLinks(initial)
                return
            }
            privacyLinks = []
            let data = try await session.askRequest(path: "api/chat/native/v5/conversation", method: "GET")
            guard session.dataScope == initial else { return }
            let read = try JSONDecoder().decode(AssistantConversation.self, from: data)
            guard read.valid else { throw NativeDataError.invalidResponse }
            conversation = read
            await resultStore.load(scope: initial, using: session)
            if let currentGoal = read.goals.last, let conversationID = read.conversationId {
                do {
                    let linkData = try await session.askRequest(path: tripPath(currentGoal.goalId), method: "GET")
                    guard session.dataScope == initial else { return }
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
                    tripNotice = nil
                } catch {
                    guard session.dataScope == initial else { return }
                    tripLink = nil; tripNotice = "retry"
                }
            } else { tripLink = nil; ownedTrips = [] }
            if let pending, read.messages.contains(where: { $0.messageId == pending.messageId }) { self.pending = nil; draft = "" }
            notice = nil
        } catch {
            guard session.dataScope == initial else { return }
            policy = nil; conversation = nil; resultStore.clear(); tripLink = nil; notice = "retry"
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
        do {
            let body = try JSONEncoder().encode(["policyId": policy.id])
            _ = try await session.askRequest(path: "api/chat/native/v5/consent", method: "DELETE", body: body)
            guard session.dataScope == initial else { throw NativeDataError.staleSessionResponse }
            conversation = nil; resultStore.clear(); pending = nil; pendingTripMutation = nil
            draft = ""; tripLink = nil; self.policy = nil
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
            guard session.dataScope == initial else { throw NativeDataError.staleSessionResponse }
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

private struct AssistantGoalTripAccepted: Decodable {
    let version: Int
    let kind: String
    let operationId: String
    let linkVersion: Int
    let goalScopeVersion: Int
    let tripId: String?
}
