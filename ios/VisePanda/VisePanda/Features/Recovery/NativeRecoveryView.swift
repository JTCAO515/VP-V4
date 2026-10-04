import SwiftUI

struct NativeRecoveryView: View {
    let tripID: String
    @Environment(AppSettings.self) private var settings
    @Environment(\.scenePhase) private var phase
    @State private var store = NativeRecoveryStore()
    @State private var dayID = ""
    @State private var selected: [String] = []
    @State private var fixed: Set<String> = []
    @State private var bindings: [String: String] = [:]
    @State private var report = NativeRecoveryReport.fatigue
    @State private var navigation: Review?
    @State private var task: Task<Void, Never>?
    private var session: NativeSession { settings.nativeSession }
    private var chinese: Bool { settings.selectedLocale == .zh }
    private func t(_ zh: String, _ en: String) -> String { chinese ? zh : en }
    private var active: Bool { phase == .active && session.dataScope != nil && store.scope == session.dataScope }
    private var items: [NativeTripItem] { store.detail?.content.days.flatMap(\.items) ?? [] }
    private var activeReferences: [NativeRecoveryReservation] { store.reservations.filter { ["reserved", "amended"].contains($0.status) } }
    private var forcedFixed: Set<String> { Set(activeReferences.compactMap { bindings[$0.id] }) }
    private var mapping: [NativeRecoveryBinding] {
        activeReferences.compactMap { reference in
            guard let id = bindings[reference.id], let item = items.first(where: { $0.id == id }) else { return nil }
            return .init(referenceId: reference.id, revision: reference.revision, dayId: item.dayId, itemId: item.id)
        }
    }
    private var canPrepare: Bool {
        active && !store.busy && store.pending == nil && !selected.isEmpty && selected.count <= 8
        && store.reservationComplete && !store.reservations.contains(where: { $0.status == "unknown" })
        && mapping.count == activeReferences.count && Set(mapping.map(\.itemId)).count == mapping.count
        && Set(selected).isDisjoint(with: fixed.union(forcedFixed)) && fixed.union(forcedFixed).count <= 64
        && report != .highRiskUnwell
    }
    private struct Review: Identifiable, Hashable {
        let scope: NativeDataScope; let tripID: String; let reference: String; let version: Int
        var id: String { reference }
    }

    var body: some View {
        Form {
            if active, let detail = store.detail {
                Section {
                    Text(detail.trip.title).font(.headline)
                    Text(t("已确认行程 · 版本 \(detail.trip.headVersion)", "Confirmed Trip · version \(detail.trip.headVersion)"))
                    Text(t("仅处理你明确选择的可变项目。固定项目、订单保留绑定和其他范围不变；省略日程不等于取消订单或退款。", "Only your explicitly optional selection can change. Fixed items, preservation bindings and the remaining scope stay intact. Omission is not booking cancellation or refund."))
                        .font(.footnote)
                    Button(t("读取当前行程与订单依据", "Read current Trip and reservation basis")) { run { await refresh() } }
                        .disabled(store.busy).accessibilityIdentifier("recovery.refresh")
                }
                if store.pending == nil {
                    scopeSection(detail)
                    reservationSection
                    Section(t("本次用户报告", "Your report for this check")) {
                        Picker(t("发生了什么", "What changed"), selection: $report) {
                            ForEach(NativeRecoveryReport.allCases) { Text($0.label(chinese: chinese)).tag($0) }
                        }
                        Text(t("只发送上述报告类型、本次时间、明确选区和保留绑定；不发送照片、聊天、健康原文。用户报告不等于供应商事实。", "Sends only this report category, current time, explicit scope and preservation bindings. No photos, chats or health text. A user report is not supplier evidence."))
                            .font(.footnote)
                        if report == .highRiskUnwell {
                            Text(t("停止行程并寻求当地帮助。当前没有可核实的官方求助入口；不会生成删项候选或建议继续出行。请使用你已知的当地官方紧急求助渠道。", "Stop and seek local help. No qualified official help entry is available here. No omission candidate or instruction to keep travelling is produced. Use a known local official emergency channel."))
                                .accessibilityIdentifier("recovery.highRisk")
                        } else {
                            Button(t("明确报告并核验局部候选", "Report and check local candidates")) { run { await prepare() } }
                                .disabled(!canPrepare).accessibilityIdentifier("recovery.prepare")
                        }
                    }.disabled(store.busy)
                    candidatesSection
                }
            } else {
                Section {
                    Text(t("当前账号无法核实这份已确认行程。联网并恢复权限后，重新读取。", "This account cannot verify the confirmed Trip. Reconnect and restore access, then read again."))
                    Button(t("重新读取", "Read again")) { run { await refresh() } }.disabled(store.busy || !active)
                }
            }
            if active, let pending = store.pending { pendingSection(pending) }
            if active, let notice = store.notice { Text(noticeText(notice)).accessibilityIdentifier("recovery.notice") }
            Section(t("交通变化与外部出口", "Transport changes and external next steps")) {
                Text(t("交通变化恢复未支持：当前没有 #366 合格交通回执读取器。不会提供实时到站、取消或退款结论。请回原行程核对已保存地址，并用原供应商／官方渠道核实。当前没有可核实的官方链接。", "Transport-change recovery is unsupported: no qualified #366 receipt reader is installed. No live ETA, cancellation or refund conclusion. Check saved addresses in the original Trip and verify with the original supplier or official channel. No qualified official link is available here."))
                    .font(.footnote).accessibilityIdentifier("recovery.transport.unsupported")
                if let actor = session.dataScope {
                    NavigationLink(t("打开原行程和已保存地址", "Open original Trip and saved addresses")) {
                        NativeTripView(initialTripID: tripID, initialTripScope: actor)
                    }.accessibilityIdentifier("recovery.originalTrip")
                }
            }
        }
        .navigationTitle(t("局部恢复", "Local recovery"))
        .task(id: session.dataScope) { await refresh() }
        .onChange(of: dayID) { _, _ in selected = []; store.clearPreview() }
        .onChange(of: report) { _, _ in store.clearPreview() }
        .onChange(of: session.dataScope) { _, scope in task?.cancel(); clearInput(); store.bind(scope) }
        .onChange(of: phase) { _, value in
            task?.cancel(); navigation = nil
            if value == .active { run { await refresh() } } else { store.suspend() }
        }
        .onDisappear { task?.cancel(); store.suspend() }
        .navigationDestination(item: $navigation) { review in
            NativeTripView(initialTripID: review.tripID, initialTripScope: review.scope,
                           initialProposalReference: review.reference, initialTripVersion: review.version)
        }
    }

    private func scopeSection(_ detail: NativeTripDetail) -> some View {
        Section(t("明确选择本次范围", "Choose the scope explicitly")) {
            Picker(t("日期", "Day"), selection: $dayID) {
                Text(t("请选择", "Choose a day")).tag("")
                ForEach(detail.content.days) { Text($0.date + " · " + $0.id).tag($0.id) }
            }
            Text(t("最多 8 个明确可省略项目；首先选择的项目用于单项候选。晚餐等固定项目请在下方明确保留。", "Choose up to 8 explicitly optional items. The first selection is used for the one-item candidate. Explicitly preserve dinner and other fixed items below."))
                .font(.footnote)
            if let day = detail.content.days.first(where: { $0.id == dayID }) {
                ForEach(day.items) { item in
                    Toggle(item.title + " · " + item.id, isOn: Binding(get: { selected.contains(item.id) }, set: { value in
                        if value, selected.count < 8 { selected.append(item.id) } else { selected.removeAll { $0 == item.id } }
                        store.clearPreview()
                    }))
                    .disabled(fixed.contains(item.id) || forcedFixed.contains(item.id) || (!selected.contains(item.id) && selected.count >= 8))
                    .accessibilityIdentifier("recovery.optional.\(item.id)")
                }
            }
            ForEach(detail.content.days) { day in
                Text(t("固定保留 · ", "Keep fixed · ") + day.date).font(.subheadline)
                ForEach(day.items) { item in
                    Toggle(item.title + " · " + item.id, isOn: Binding(get: { fixed.contains(item.id) || forcedFixed.contains(item.id) }, set: { value in
                        if value { fixed.insert(item.id); selected.removeAll { $0 == item.id } } else { fixed.remove(item.id) }
                        store.clearPreview()
                    }))
                    .disabled(forcedFixed.contains(item.id) || (!fixed.contains(item.id) && fixed.union(forcedFixed).count >= 64))
                    .accessibilityIdentifier("recovery.fixed.\(item.id)")
                }
            }
        }.disabled(store.busy)
    }
    private var reservationSection: some View {
        Section(t("当前订单保留绑定", "Current reservation preservation bindings")) {
            if !store.reservationComplete {
                Text(t("订单读取未完成／能力尚未安装：待核验，不可执行候选。", "Reservation read incomplete or capability not installed: pending; candidates cannot execute."))
            } else if store.reservations.isEmpty {
                Text(t("当前完整读取没有已登记订单参考；不代表外部没有订单。", "The complete current read has no registered reservation references; this does not prove there are no external bookings."))
            }
            ForEach(store.reservations) { reference in
                VStack(alignment: .leading) {
                    Text(reference.title).font(.headline)
                    Text("\(reference.id) · r\(reference.revision) · \(reference.status) · \(reference.evidenceTier)").font(.caption).textSelection(.enabled)
                    if let start = reference.startsAt { Text(start).font(.caption) }
                    if let end = reference.endsAt { Text(end).font(.caption) }
                    if ["reserved", "amended"].contains(reference.status) {
                        Picker(t("我明确保留在此真实行程项目", "I explicitly preserve this actual Trip item"), selection: Binding(get: { bindings[reference.id] ?? "" }, set: { value in
                            bindings[reference.id] = value.isEmpty ? nil : value
                            selected.removeAll { $0 == value }; store.clearPreview()
                        })) {
                            Text(t("未绑定 · 待核验", "Unbound · pending")).tag("")
                            ForEach(items) { item in Text(item.title + " · " + item.dayId + "/" + item.id).tag(item.id) }
                        }.accessibilityIdentifier("recovery.binding.\(reference.id)")
                    }
                }
            }
            Text(t("绑定仅表示 user_confirmed_preservation：你要求原项目、日期与时间不变；不会变成供应商证明。未知状态、版本变化、重复绑定或日期不兼容仍待核验。", "Bindings mean user_confirmed_preservation: your instruction to keep the original item, date and time. They do not become supplier proof. Unknown status, changed revisions, duplicate bindings or incompatible dates stay pending."))
                .font(.footnote)
        }.disabled(store.busy)
    }
    private var candidatesSection: some View {
        TimelineView(.periodic(from: .now, by: 1)) { _ in
            if let preview = store.visiblePreview(current: session.dataScope, foreground: phase == .active, now: Date()) {
                Section(t("候选与待核依据", "Candidates and evidence to check")) {
                    Text(t("偏好只作柔性参考：", "Preference is a soft reference: ") + (preview.preferenceContext.travelPace ?? t("未知", "unknown")))
                    if let date = preview.preferenceContext.updatedAt { Text(date).font(.caption) }
                    if let expiry = preview.expiresAt { Text(t("当前依据到期：", "Current basis expires: ") + expiry).font(.caption) }
                    ForEach(preview.candidates) { candidate in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(candidate.label).font(.headline)
                            ForEach(candidate.dayDiffs, id: \.dayId) { diff in
                                Text(diff.date)
                                ForEach(diff.items, id: \.itemId) { change in
                                    Text(t("原项目：", "Before: ") + change.title)
                                    if let original = items.first(where: { $0.id == change.itemId }) {
                                        Text((original.startsAt ?? t("时间未知", "Time unknown")) + " → " + (original.endsAt ?? t("未知", "unknown"))).font(.caption)
                                    }
                                    Text(t("候选：仅从行程省略此项目", "Candidate: omit this item from Trip only"))
                                }
                            }
                            Text(t("保留固定项 \(candidate.fixedItemIds.count) 个，其余 \(candidate.unchangedItemIds.count) 个项目不变。", "Preserves \(candidate.fixedItemIds.count) fixed items; \(candidate.unchangedItemIds.count) other items remain unchanged."))
                            Text(t("可行性：", "Feasibility: ") + candidate.feasibility.status)
                            ForEach(Array(candidate.feasibility.lines.enumerated()), id: \.offset) { _, line in
                                Text("\(line.constraint) · \(line.status) · \(line.reason)").font(.caption)
                            }
                            Text(t("后续交通、开门、订单及外部取消／退款仍须核实；此候选不是安全保证。", "Onward routes, opening, reservations and external cancellation/refund still need verification. This candidate is not a safety guarantee."))
                                .font(.footnote)
                            Button(t("明确选择此候选，再审阅原提案", "Select this candidate, then review the original proposal")) {
                                run { await store.select(candidateID: candidate.id, current: { session.dataScope }, post: post) }
                            }.disabled(store.busy).accessibilityIdentifier("recovery.select.\(candidate.id)")
                        }
                    }
                    if preview.candidates.isEmpty { Text(noticeText(preview.reason ?? "RECOVERY_PENDING")) }
                }
            } else if store.preview != nil {
                Text(t("依据已过期，请重新明确报告并核验；不会延长旧上下文。", "Basis expired. Explicitly report and check again; the old context is not extended."))
            }
        }
    }
    private func pendingSection(_ pending: NativeRecoveryPending) -> some View {
        Section(t("同一操作与原提案回执", "Same operation and original proposal receipt")) {
            Text(pending.operationID).font(.caption).textSelection(.enabled)
            Text(t("未核实 ACK 不等于未写入。所有读失败仍保持结果未知，原请求保留。明确重放会重新核验账号与 epoch，先尝试读原操作，再用冻结原字节取回执；若原请求未提交，可能首次创建原操作对象，不生成新操作或重复创建。失权当轮不重放。", "An unverified ACK does not mean no write occurred. Failed reads keep the result unknown and retain the original request. Explicit replay verifies the account and epoch, tries the original operation read, then uses frozen bytes to obtain a receipt. If the original request never committed, this can first create the original operation object, without a new operation or duplicate. No replay in an access-denied round."))
                .font(.footnote)
            if pending.stage == "preview" {
                Text(t("准备操作尚无可用精确回执读取器；选择操作读取失败不能证明准备未发生。", "Preparation has no available exact receipt reader. Failed selection-operation reads cannot prove the preparation did not occur."))
                    .font(.footnote)
            }
            Button(t("读取同一操作的精确回执", "Read this operation's exact receipt")) { run { await store.recover(current: { session.dataScope }, post: post) } }
                .disabled(store.busy).accessibilityIdentifier("recovery.receipt")
            if store.outcome == nil {
                Button(t("结果仍未知，明确重发冻结原请求以取回执", "Result still unknown; explicitly replay frozen request for receipt")) { run {
                    await store.replayOriginal(current: { session.dataScope }, verify: {
                        guard !session.busy, let actor = session.dataScope else { return nil }
                        let bytes = try await session.tripRequest(path: "api/trips/native/v2/\(tripID)", method: "GET")
                        guard bytes.count <= 512000, session.dataScope == actor else { return nil }
                        let current = try JSONDecoder().decode(NativeTripDetail.self, from: bytes)
                        guard current.trip.id == tripID, current.confirmationState == "confirmed" else { return nil }
                        return session.dataScope == actor ? actor : nil
                    }, post: post)
                } }
                    .disabled(store.busy).accessibilityIdentifier("recovery.retry")
            }
            TimelineView(.periodic(from: .now, by: 1)) { _ in
                if let outcome = store.outcome {
                    Text(stateText(outcome.operation.state))
                    if let version = outcome.operation.resultingVersion { Text(t("原提案实际应用版本：", "Original proposal applied version: ") + String(version)) }
                    if let reference = store.reviewReference, let scope = session.dataScope {
                        Text(t("只审阅这份原提案的差异并明确确认或拒绝。需要改方案，请先拒绝后重新报告核验。", "Review this original proposal's diff and explicitly confirm or reject. To change the plan, reject first and report/check again."))
                        Button(t("打开精确原提案审阅", "Open exact original proposal review")) {
                            navigation = .init(scope: scope, tripID: tripID, reference: reference, version: outcome.operation.receipt.baseVersion)
                        }.accessibilityIdentifier("recovery.review")
                    } else if outcome.operation.state == "pending" {
                        Text(t("原提案到期或依据不可核实，请读取精确回执；不能继续确认。", "Original proposal expired or basis unverified. Read its exact receipt; confirmation is unavailable."))
                    }
                    if ["applied", "rejected", "expired", "stale"].contains(outcome.operation.state) {
                        Button(t("结束此已核实操作，重新读取后报告", "Finish verified operation; reread before a new report")) {
                            do { try store.finishTerminal(current: session.dataScope); run { await refresh() } } catch { store.suspend() }
                        }.disabled(store.busy)
                    }
                }
            }
        }
    }
    private func stateText(_ state: String) -> String {
        switch state {
        case "applied": t("原提案已应用 · 精确回执", "Original proposal applied · exact receipt")
        case "rejected": t("原提案已拒绝，行程未因此改变", "Original proposal rejected; no Trip change from rejection")
        case "expired": t("原提案已过期，不可确认", "Original proposal expired; cannot confirm")
        case "stale": t("原提案依据失效，不可确认", "Original proposal basis stale; cannot confirm")
        default: t("候选已成为原待审提案，尚未应用", "Candidate is an original pending proposal; not applied")
        }
    }
    private func noticeText(_ code: String) -> String {
        switch code {
        case "RESERVATION_READER_PENDING", "RESERVATION_READER_UNAVAILABLE", "RESERVATION_SCOPE_INCOMPLETE":
            t("订单依据缺失或读取不完整，保持待核验，不可执行候选。", "Reservation basis missing or incomplete. Pending; candidates cannot execute.")
        case "RESERVATION_STATUS_UNKNOWN", "FIXED_RESERVATION_UNBOUND", "RESERVATION_BINDING_STALE", "RESERVATION_BINDING_AMBIGUOUS":
            t("订单状态或保留绑定需核实；请重读当前版本并明确绑定，不推断订单事实。", "Verify reservation status or preservation binding. Reread current revisions and bind explicitly; no inferred booking facts.")
        case "OTHER_TRIP_OPERATION_PENDING": t("另一份行程有未决操作；请回到该行程读取原回执。", "Another Trip has an unresolved operation. Return to that Trip and read the original receipt.")
        case "JOURNAL_UNAVAILABLE": t("无法核实本机持久化记录，未开始新请求。请恢复本机存储后重新读取。", "Local durable record could not be verified. No new request started. Restore local storage, then reread.")
        case "HIGH_RISK_UNWELL": t("停止并寻求当地官方帮助；当前没有可核实的官方入口。", "Stop and seek local official help; no qualified official entry is available here.")
        default: t("当前依据或回执待核实（\(code)）。原行程与未决操作保留；不要把技术失败当作已解决。", "Current basis or receipt unverified (\(code)). Original Trip and unresolved operation are retained; technical failure is not resolution.")
        }
    }
    private func run(_ operation: @escaping @MainActor () async -> Void) { task?.cancel(); task = Task { await operation() } }
    private func clearInput() { dayID = ""; selected = []; fixed = []; bindings = [:]; navigation = nil }
    private func refresh() async {
        store.bind(session.dataScope); clearInput()
        await store.refresh(tripID: tripID, current: { session.dataScope }, request: { path, method, body in
            try await session.tripRequest(path: path, method: method, body: body)
        })
        if store.pending != nil { await store.recover(current: { session.dataScope }, post: post) }
    }
    private func post(_ body: Data) async throws -> Data {
        try await session.tripRequest(path: "api/trips/native/v2/\(tripID)/recovery", method: "POST", body: body)
    }
    private func prepare() async {
        guard canPrepare, let detail = store.detail else { return }
        let input = NativeRecoveryInput(operationId: UUID().uuidString.lowercased(), expectedHeadVersion: detail.trip.headVersion,
                                        dayId: dayID, selectedItemIds: selected, fixedItemIds: fixed.union(forcedFixed).sorted(),
                                        reservationBindings: mapping,
                                        report: .init(source: "user_report", kind: report, observedAt: ISO8601DateFormatter().string(from: Date())),
                                        locale: chinese ? "zh" : "en")
        await store.prepare(input: input, current: { session.dataScope }, post: post)
    }
}
