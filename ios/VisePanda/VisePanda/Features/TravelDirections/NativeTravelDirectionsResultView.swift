import SwiftUI

struct NativeTravelDirectionsResultView: View {
    let artifactID: String
    let revision: Int
    let session: NativeSession
    let chinese: Bool
    var active = true
    @Environment(\.scenePhase) private var phase
    @State private var store = NativeTravelDirectionsStore()
    @State private var refresh = UUID()
    @State private var startDate = ""
    @State private var review: Review?
    private struct Review: Identifiable { let id = UUID(); let scope: NativeDataScope; let proposal: NativeTravelDirectionsReceipt.Proposal }
    private struct Load: Equatable { let key: NativeTravelDirectionsStore.Key?; let refresh: UUID }
    private var authority: NativeTravelDirectionsStore.Key? {
        guard let scope = session.dataScope else { return nil }
        return .init(scope: scope, artifactID: artifactID)
    }
    private var key: NativeTravelDirectionsStore.Key? { active && phase == .active ? authority : nil }
    private func t(_ zh: String, _ en: String) -> String { chinese ? zh : en }
    private func act(_ action: NativeTravelDirectionsAction) async {
        await store.perform(action, current: { key }, post: { try await session.travelDirectionsActionRequest(action: $0, body: $1) },
            read: { try await session.fiveResultRequest(artifactID: $0, revision: $1) })
        if let proposal = store.proposal, let scope = key?.scope { review = .init(scope: scope, proposal: proposal) }
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Button(t("重新读取当前所选成果", "Reload the selected result")) { refresh = UUID() }
                .disabled(store.busy)
            if store.pending != nil {
                Text(t("上次操作尚未确认。可明确重试同一请求，或返回成果列表刷新。", "The last action is unconfirmed. Explicitly retry the same request, or refresh the result list."))
                Button(t("重试同一次操作", "Retry the same action")) {
                    Task {
                        await store.retry(current: { key }, post: { try await session.travelDirectionsActionRequest(action: $0, body: $1) },
                            read: { try await session.fiveResultRequest(artifactID: $0, revision: $1) })
                    }
                }.disabled(store.busy)
            }
            TimelineView(.periodic(from: .now, by: 1)) { _ in
                if let record = store.visible(current: key), let content = store.content(current: key) {
                    Text(content.title).font(.title2.bold())
                    Text(content.summary)
                    NativeTravelDirectionsEditor(options: content.directions.map { .init(id: $0.id, title: $0.title, tradeoff: $0.tradeoff, days: []) },
                        selectedID: content.selectedDirectionId, unknown: unknown(content), basisSummary: basis(record, content),
                        qualified: record.current && store.pending == nil && !store.editingNeedsReview, busy: store.busy, chinese: chinese, editing: $store.editing,
                        select: { id in Task { await act(.choose(id)) } },
                        save: {
                            Task {
                                if store.editing.hasChanges {
                                    let ids = Set(store.editing.changedIDs)
                                    let changes = store.editing.days.filter { ids.contains($0.id) }.map {
                                        NativeTravelDirectionsAction.Replacement(ordinal: $0.relativeDay, destination: $0.city, activities: $0.activities)
                                    }
                                    await act(.edit(changes))
                                } else { await act(.save) }
                            }
                        })
                    if store.editingNeedsReview {
                        Text(t("成果版本已变化。未保存修改仍保留；请先放弃这些修改并刷新，再重新编辑。", "The result revision changed. Unsaved edits are retained; discard them and reload before editing again."))
                        Button(t("放弃旧版本未保存修改并刷新", "Discard old unsaved edits and reload"), role: .destructive) {
                            store.editing.discard(); refresh = UUID()
                        }
                    }
                    if content.draft == nil {
                        Text(t("选方向尚未保存相对日草稿。请点击保存。", "Choosing a direction has not saved a relative-day draft. Save it explicitly."))
                            .font(.footnote)
                    }
                    if let draft = content.draft {
                        ForEach(Array(draft.limitations.enumerated()), id: \.offset) { _, line in Text(line).font(.footnote) }
                        if !draft.days.isEmpty {
                            TextField(t("明确开始日期 YYYY-MM-DD", "Explicit start date YYYY-MM-DD"), text: $startDate)
                                .textInputAutocapitalization(.never).autocorrectionDisabled()
                                .accessibilityIdentifier("directions.bind.startDate")
                            if let tripID = record.source.tripId, let tripVersion = record.source.tripVersion {
                                Button(t("创建行程提议并审阅差异", "Create a Trip proposal and review its diff")) {
                                    Task { await act(.bind(tripID: tripID, tripVersion: tripVersion, startDate: startDate)) }
                                }
                                .disabled(!store.canAct(current: key) || store.editing.hasChanges || !NativeTravelIntake.validDates(.init(startDate: startDate, endDate: startDate)))
                                .accessibilityIdentifier("directions.bind.review")
                            } else {
                                Text(t("请先在对话中明确关联同一目标的行程，再刷新成果；不会替你创建或覆盖旧行程。", "Explicitly link a Trip to this goal in the conversation, then refresh the result."))
                                    .font(.footnote)
                            }
                        }
                    }
                } else if store.busy { ProgressView() }
                else {
                    Text(t("成果暂不可读、依据已变化或读取已过期。请刷新当前成果。", "The result is unavailable, changed, or its read has expired. Refresh the current result."))
                        .accessibilityIdentifier("directions.result.unavailable")
                }
            }
        }
        .task(id: Load(key: key, refresh: refresh)) {
            guard let key else { store.suspend(); return }
            await store.load(key: key, revision: store.readRevision ?? revision, current: { self.key },
                read: { try await session.fiveResultRequest(artifactID: $0, revision: $1) })
        }
        .onChange(of: authority) { _, _ in store.clear(); review = nil; startDate = "" }
        .onChange(of: session.assistantEventsInvalidation?.id) { _, _ in
            guard let signal = session.assistantEventsInvalidation,
                  signal.matches(scope: session.dataScope, sessionID: (try? session.communitySafetyActor())?.sessionID) else { return }
            store.invalidateAssistantEvent(signal)
        }
        .onChange(of: session.resultDataErasure?.id) { _, _ in
            guard let erased = session.resultDataErasure, (try? session.communitySafetyActor()) == erased.actor,
                  erased.artifactIDs.contains(artifactID) else { return }
            store.clear(); review = nil; startDate = ""
        }
        .onDisappear { store.clear() }
        .sheet(item: $review) { value in
            NavigationStack { NativeTravelDirectionsTripReview(scope: value.scope, proposal: value.proposal, session: session, chinese: chinese) }
        }
    }
    private func unknown(_ content: NativeTravelDirectionsContent) -> [String] {
        var lines: [String] = []
        if content.intake.durationDays == nil { lines.append(t("天数未知", "Duration unknown")) }
        if content.intake.destinations.isEmpty { lines.append(t("目的地未知", "Destination unknown")) }
        if content.intake.dates == nil { lines.append(t("日期未定", "Dates undecided")) }
        if content.intake.budget == nil { lines.append(t("预算未定", "Budget undecided")) }
        return lines
    }
    private func basis(_ record: NativeFiveResultRecord, _ content: NativeTravelDirectionsContent) -> [String] {
        var lines = [t("成果版本 \(record.revision) · 输入序号 \(record.source.inputSequence ?? 0)", "Result revision \(record.revision) · Input sequence \(record.source.inputSequence ?? 0)")]
        if let draft = content.draft, let pace = draft.pace {
            lines.append(draft.paceSource == "profile" ? t("使用已授权 Profile 节奏：\(pace)", "Authorized Profile pace used: \(pace)") : t("本次明确节奏：\(pace)", "Explicit pace for this journey: \(pace)"))
        }
        if !record.memories.isEmpty { lines.append(t("已核对 \(record.memories.count) 条 Memory 版本", "\(record.memories.count) Memory revisions qualified")) }
        return lines
    }
}

/// First obtains the original pending proposal/digest. Then the existing Trip view
/// reloads that exact reference and renders its original explicit confirmation UI.
struct NativeTravelDirectionsTripReview: View {
    let scope: NativeDataScope
    let proposal: NativeTravelDirectionsReceipt.Proposal
    let session: NativeSession
    let chinese: Bool
    @State private var trips = NativeTripStore()
    @State private var reference: String?
    @State private var failed = false
    var body: some View {
        Group {
            if let reference, session.dataScope == scope {
                NativeTripView(initialTripID: proposal.tripID, initialTripScope: scope, initialProposalReference: reference, initialTripVersion: proposal.tripVersion)
            } else if failed {
                Text(chinese ? "原提议已变化或不可读。请返回成果重新核对。" : "The original proposal changed or is unavailable. Return to the result and recheck.")
            } else { ProgressView() }
        }
        .task(id: session.dataScope) {
            reference = nil; failed = false
            guard session.dataScope == scope else { failed = true; return }
            trips.reset(for: scope)
            await trips.select(proposal.tripID, using: session)
            guard session.dataScope == scope, !Task.isCancelled, trips.scope == scope,
                  trips.detail?.trip.headVersion == proposal.tripVersion, trips.canEdit,
                  let pending = trips.pending, pending.proposal.id == proposal.proposalID,
                  pending.proposal.revision == proposal.proposalRevision,
                  pending.proposal.baseTripVersion == proposal.tripVersion,
                  pending.proposal.status == "pending", !pending.proposal.stale else { failed = true; return }
            reference = trips.confirmationReference
        }
    }
}
