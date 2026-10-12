import SwiftUI

/// Uses the existing qualified intake writer and result consumer. No text
/// extraction, background generation, new cache, or independent Trip writer.
struct NativeJourneyDirectionsView: View {
    let selection: NativeTravelDirectionsSelection
    let currentSelection: () -> NativeTravelDirectionsSelection?
    let originalRequest: String
    let session: NativeSession
    let chinese: Bool
    let store: NativeTravelDirectionsIntakeStore
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var phase
    @State private var refresh = UUID()
    @State private var values = NativeTravelDirectionsFormValues()
    @State private var initialized = false
    @State private var showDetails = false
    @State private var knownRequirements: NativeTravelIntakeBasis?
    @State private var knownRequirementsUntil: TimeInterval = 0
    @State private var requirementsGeneration = UUID()
    private struct Load: Equatable {
        let selection: NativeTravelDirectionsSelection?
        let active: Bool
        let refresh: UUID
    }
    private var authority: NativeTravelDirectionsSelection? {
        guard session.dataScope == selection.scope, let live = currentSelection(),
              selection.sameRequestContext(as: live) else { return nil }
        return live
    }
    private var current: NativeTravelDirectionsSelection? { phase == .active ? authority : nil }
    private func t(_ zh: String, _ en: String) -> String { chinese ? zh : en }
    private var visibleKnownRequirements: NativeTravelIntakeBasis? {
        guard current == selection, !store.busy, store.pendingBody == nil,
              ProcessInfo.processInfo.systemUptime < knownRequirementsUntil else { return nil }
        return knownRequirements
    }
    private func clearKnownRequirements() {
        knownRequirements = nil; knownRequirementsUntil = 0; requirementsGeneration = UUID()
    }
    private func readKnownRequirements() async {
        let own = UUID(); requirementsGeneration = own
        knownRequirements = nil; knownRequirementsUntil = 0
        guard current == selection, !Task.isCancelled else { return }
        let started = ProcessInfo.processInfo.systemUptime
        do {
            let bytes = try await session.travelIntakeRequest(conversationID: selection.conversationID, goalID: selection.goalID)
            guard requirementsGeneration == own, current == selection, !Task.isCancelled else { return }
            let basis = try NativeTravelIntakeBasis.decode(bytes)
            let expected = NativeJourneyReadAnchor(conversationID: selection.conversationID, goalID: selection.goalID,
                goalVersion: selection.goalVersion, messageID: selection.parentMessageID)
            let source = NativeJourneyReadAnchor(conversationID: basis.conversationId, goalID: basis.goalId,
                goalVersion: basis.goalVersion, messageID: basis.messageId)
            guard expected.accepts(source, started: started, now: ProcessInfo.processInfo.systemUptime) else { return }
            // Display the original authority only. Its party/date fields cannot
            // silently become a directions or model source without that owner's
            // versioned projection contract. No second intake is persisted here.
            knownRequirements = basis; knownRequirementsUntil = started + 20
        } catch { /* Missing, denied or unsupported input remains unknown. */ }
    }
    private func generate() async {
        await store.submit(values: values, text: originalRequest, locale: chinese ? "zh" : "en", current: { current },
            post: { try await session.travelDirectionsActionRequest(action: "submit", body: $0) },
            read: { try await session.fiveResultRequest(artifactID: $0, revision: $1) },
            readIntake: { try await session.travelDirectionsReadRequest(kind: "intake", conversationID: $0, goalID: $1) })
    }
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if session.dataScope != selection.scope || phase != .active {
                        Text(t("当前会话不可读取原输入。请返回后重新核对。", "The original input cannot be read in this session. Return and recheck."))
                    } else if let publication = store.publication {
                        NativeTravelDirectionsResultView(artifactID: publication.artifactID, revision: publication.revision,
                            session: session, chinese: chinese)
                    } else {
                        Text(originalRequest).textSelection(.enabled)
                        Text(t("先比较方向，日期和预算可以留空。只复用已核实需求；这一步不会从原话推测城市、日期或人数。", "Compare directions first; dates and budget can stay open. Only verified requirements are reused. This step does not infer cities, dates or party size from your words."))
                        TimelineView(.periodic(from: .now, by: 1)) { _ in
                            if let known = visibleKnownRequirements {
                                VStack(alignment: .leading, spacing: 8) {
                                    Text(t("你已明确保存的需求", "Requirements you explicitly saved")).font(.headline)
                                    if let party = known.intake.partySize { Text(t("同行人数：\(party)", "Party size: \(party)")) }
                                    if let dates = known.intake.dates { Text(t("日期：", "Dates: ") + dates.startDate + " – " + dates.endDate) }
                                    if let city = known.intake.city { Text(t("目的地：", "Destination: ") + city) }
                                    Text(t("这些需求仍在原任务中。本页方向尚未自动采用它们；需要补充或纠正时，可展开下方需求。", "These requirements remain in the original task. Directions here have not automatically adopted them; open the requirements below if you want to add or correct details."))
                                        .font(.footnote)
                                }.accessibilityIdentifier("journeyEntry.knownRequirements")
                            }
                        }
                        if !values.destinations.isEmpty { Text(t("已核实目的地：", "Verified destinations: ") + values.destinations) }
                        if !values.duration.isEmpty { Text(t("已核实天数：", "Verified duration: ") + values.duration) }
                        Button(t("先看可保存的方向 · 跳过补充", "Show directions I can save · Skip extra details")) { Task { await generate() } }
                            .disabled(!initialized || !store.qualified(current) || !values.valid)
                            .accessibilityIdentifier("journeyEntry.directions.generate")
                        DisclosureGroup(t("主动补充或纠正需求", "Add or correct requirements"), isExpanded: $showDetails) {
                            NativeTravelDirectionsIntakeForm(originalRequest: "", chinese: chinese,
                                qualified: store.qualified(current), busy: store.busy, savedPaceSummary: nil,
                                values: $values, generate: { Task { await generate() } })
                        }
                        if store.busy { ProgressView(t("核对当前依据", "Checking the current basis")) }
                        if store.notice != nil || current == nil {
                            Text(t("尚无可确认的新成果。权限、配额或依据需要重新核对；原目标和已保存成果保留。", "No new result is confirmed. Permissions, quota or basis need rechecking; your goal and saved results remain."))
                        }
                        if store.pendingBody != nil {
                            Button(t("重试同一次请求", "Retry the same request")) {
                                Task {
                                    await store.retry(current: { current },
                                        post: { try await session.travelDirectionsActionRequest(action: "submit", body: $0) },
                                        read: { try await session.fiveResultRequest(artifactID: $0, revision: $1) },
                                        readIntake: { try await session.travelDirectionsReadRequest(kind: "intake", conversationID: $0, goalID: $1) })
                                }
                            }.disabled(store.busy || current == nil)
                        } else {
                            Button(t("重新核对依据", "Recheck the basis")) { refresh = UUID() }
                                .disabled(store.busy || current == nil)
                        }
                    }
                }.padding()
            }
            .navigationTitle(t("从想法到方向", "From idea to directions"))
            .toolbar { ToolbarItem(placement: .cancellationAction) {
                Button(t("返回同一目标", "Return to the same goal")) { dismiss() }.disabled(store.busy)
            } }
            .interactiveDismissDisabled(store.busy)
            .task(id: Load(selection: authority, active: phase == .active, refresh: refresh)) {
                store.bind(session.dataScope == selection.scope ? selection : nil)
                clearKnownRequirements()
                guard current != nil, store.pendingBody == nil else { return }
                await store.load(current: { current }, read: { try await session.travelDirectionsReadRequest(kind: $0, conversationID: $1, goalID: $2) })
                if store.qualified(current), !initialized {
                    if let intake = store.intake { values = .init(intake: intake.intake) }
                    initialized = true
                }
                await readKnownRequirements()
            }
            .onChange(of: session.assistantEventsInvalidation?.id) { _, _ in
                guard let signal = session.assistantEventsInvalidation,
                      signal.matches(scope: session.dataScope, sessionID: (try? session.communitySafetyActor())?.sessionID) else { return }
                clearKnownRequirements()
            }
            .onChange(of: session.conversationDataErasure?.id) { _, _ in
                guard let erased = session.conversationDataErasure, (try? session.communitySafetyActor()) == erased.actor,
                      erased.conversationIDs.contains(selection.conversationID) else { return }
                clearKnownRequirements()
            }
            .onChange(of: session.turnDataErasure?.id) { _, _ in
                guard let erased = session.turnDataErasure, (try? session.communitySafetyActor()) == erased.actor,
                      erased.messageIDs.contains(selection.parentMessageID) else { return }
                clearKnownRequirements()
            }
            .onChange(of: session.memoryPreferences.profiles) { _, _ in clearKnownRequirements() }
            .onChange(of: store.busy) { _, busy in if busy { clearKnownRequirements() } }
            .onDisappear { clearKnownRequirements() }
        }
    }
}
