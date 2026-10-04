import SwiftUI

struct NativeRecoveryView: View {
    let tripID: String
    @Environment(AppSettings.self) private var settings
    @Environment(\.scenePhase) private var phase
    @State private var store = NativeRecoveryStore()
    @State private var traffic = NativeTrafficStore()
    @State private var trafficItemID = ""
    @State private var originID = ""
    @State private var destinationID = ""
    @State private var mode = "driving"
    @State private var mapConsent = false
    @State private var dayID = ""
    @State private var selected: [String] = []
    @State private var fixed: Set<String> = []
    @State private var bindings: [String: String] = [:]
    @State private var report = NativeRecoveryReport.fatigue
    @State private var selectedTransportScope: NativeTransportScope?
    @State private var navigation: Review?
    @State private var task: Task<Void, Never>?
    @State private var trafficTask: Task<Void, Never>?
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
        active && !store.busy && !traffic.busy && store.pending == nil && !selected.isEmpty && selected.count <= 8
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
                    trafficSection
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
            Section(t("交通变化与核实方式", "Transport changes and where to check")) {
                Text(t("前台检查仅用于所选地点之间的整段路线。缺少来源资格、覆盖或当前期限时，不能据此恢复行程。封路、实时公交到站、未来预测、退订和退款须另向原供应商或官方核实。", "Foreground checks cover the selected whole route. Missing source qualification, coverage or current expiry prevents recovery. Check closures, real bus arrivals, forecasts, cancellations and refunds with the original supplier or official channel."))
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
        .onChange(of: dayID) { _, _ in selected = []; trafficItemID = ""; originID = ""; destinationID = ""; store.clearPreview(); endTraffic() }
        .task(id: contextKey) { await loadTrafficContext() }
        .onChange(of: trafficItemID) { _, _ in originID = ""; destinationID = ""; store.clearPreview(); endTraffic() }
        .onChange(of: originID) { _, _ in store.clearPreview(); endTraffic() }
        .onChange(of: destinationID) { _, _ in store.clearPreview(); endTraffic() }
        .onChange(of: mode) { _, _ in store.clearPreview(); endTraffic() }
        .onChange(of: mapConsent) { _, consent in if !consent { store.clearPreview(); endTraffic() } }
        .onChange(of: report) { _, _ in store.clearPreview() }
        .onChange(of: session.dataScope) { _, scope in task?.cancel(); trafficTask?.cancel(); clearInput(); store.bind(scope); traffic.bind(scope) }
        .onChange(of: phase) { _, value in
            task?.cancel(); trafficTask?.cancel(); navigation = nil
            if value == .active { run { await refresh() } } else { endTraffic(); traffic.clearContext(); store.suspend() }
        }
        .onDisappear {
            task?.cancel(); trafficTask?.cancel()
            if traffic.reviewReference == nil { endTraffic(); traffic.clearContext() }
            store.suspend()
        }
        .navigationDestination(item: $navigation) { review in
            NativeTripView(initialTripID: review.tripID, initialTripScope: review.scope,
                           initialProposalReference: review.reference, initialTripVersion: review.version)
                .onDisappear {
                    if traffic.reviewReference == review.reference { endTraffic(); store.clearPreview() }
                }
        }
    }

    private var contextKey: String {
        "\(session.dataScope.map { "\($0.endpoint)|\($0.subject)|\($0.mobileEpoch)|\($0.generation)" } ?? "")|\(store.detail?.trip.headVersion ?? -1)|\(dayID)|\(trafficItemID)"
    }
    private var placeReferences: [NativeTrafficContext.Reference] {
        guard let detail = store.detail, let context = traffic.context,
              context.matches(trip: tripID, version: detail.trip.headVersion, day: dayID, item: trafficItemID) else { return [] }
        return context.references.filter { $0.displayStatus == "current" && $0.display != nil }
    }
    private var transportScope: NativeTransportScope? {
        guard let detail = store.detail, detail.content.days.contains(where: { $0.id == dayID && $0.items.contains(where: { $0.id == trafficItemID }) }),
              let origin = placeReferences.first(where: { $0.id == originID }), let destination = placeReferences.first(where: { $0.id == destinationID }),
              origin.id != destination.id, origin.canonicalPoiId != destination.canonicalPoiId else { return nil }
        return .init(tripId: tripID, expectedHeadVersion: detail.trip.headVersion, dayId: dayID, itemId: trafficItemID,
                     originPlaceReferenceId: originID, destinationPlaceReferenceId: destinationID, mode: mode, departure: "now")
    }
    private var trafficSection: some View {
        Section(t("明确前台检查交通", "Explicit foreground transport check")) {
            if let day = store.detail?.content.days.first(where: { $0.id == dayID }) {
                Picker(t("本次交通关联项目", "Item for this transport check"), selection: $trafficItemID) {
                    Text(t("请选择", "Choose an item")).tag("")
                    ForEach(day.items) { item in Text(item.title).tag(item.id) }
                }
            }
            Picker(t("明确选择起点", "Choose origin explicitly"), selection: $originID) {
                Text(t("请选择已核实地址", "Choose a current address")).tag("")
                ForEach(placeReferences) { reference in Text(placeLabel(reference)).tag(reference.id) }
            }
            Picker(t("明确选择终点", "Choose destination explicitly"), selection: $destinationID) {
                Text(t("请选择已核实地址", "Choose a current address")).tag("")
                ForEach(placeReferences) { reference in Text(placeLabel(reference)).tag(reference.id) }
            }
            if placeReferences.count < 2 {
                Text(t("当前可核实地址不足。缺少地址名称或资料未完整读取时，保持待核验；可返回原行程导航。", "Not enough current addresses. Missing labels or incomplete source reads remain pending; use original Trip navigation."))
                    .font(.footnote).accessibilityIdentifier("recovery.traffic.address.pending")
            }
            Picker(t("整段方式 · 现在出发", "Whole-route mode · depart now"), selection: $mode) {
                Text(t("驾车", "Driving")).tag("driving")
                Text(t("步行", "Walking")).tag("walking")
                Text(t("公共交通整段方案", "Whole transit plan")).tag("transit")
            }
            Toggle(t("同意本次前台地图检查", "Consent to this foreground Maps check"), isOn: $mapConsent)
                .accessibilityIdentifier("recovery.traffic.consent")
            Text(t("起终点由你明确选择，不推断地点关联。仅在此流程前台发送；不读取后台位置。耗时是取回时路线估算，不是公交到站或封路证据。", "You explicitly choose endpoints; no place relation is inferred. Requests run only in this foreground flow, without background location. Duration is a fetch-time route estimate, not bus arrival or closure evidence."))
                .font(.footnote)
            Button(t("明确检查现在的整段路线", "Check this whole route now")) { runTraffic { await checkTraffic(refresh: false) } }
                .disabled(!active || !mapConsent || transportScope == nil || traffic.busy || store.busy)
                .accessibilityIdentifier("recovery.traffic.check")
            TimelineView(.periodic(from: .now, by: 1)) { timeline in
                if let observation = traffic.visible(scope: transportScope, foreground: active && mapConsent, now: timeline.date) {
                    trafficResult(observation)
                    Button(t("刷新同一起终点和方式", "Refresh the same endpoints and mode")) { runTraffic { await checkTraffic(refresh: true) } }
                        .disabled(traffic.busy || store.busy || observation.durableReceipt == nil)
                        .accessibilityIdentifier("recovery.traffic.refresh")
                    Button(t("按这份已核实交通参考准备局部候选", "Prepare local candidates using this qualified transport reference")) { run { await prepareTransport() } }
                        .disabled(!canPrepare || traffic.receipt(scope: transportScope, foreground: active && mapConsent, now: timeline.date) == nil)
                        .accessibilityIdentifier("recovery.traffic.prepare")
                } else {
                    Text(t("尚无当前可核实观察；检查未完成、资格缺失或期限已过均保持待核验。", "No current verified observation. An incomplete check, missing qualification or expiry remains pending."))
                        .font(.footnote)
                }
            }
            Button(t("停止本范围的前台检查", "Stop foreground checks for this scope")) { endTraffic() }
                .disabled(traffic.attemptedScope == nil).accessibilityIdentifier("recovery.traffic.stop")
            if let notice = traffic.notice {
                Text(notice == "FOREGROUND_STOPPED" ? t("服务器已确认停止本范围。", "Server confirmed this scope stopped.") : t("交通检查或停止尚未核实（\(notice)）。保留原行程导航。", "Transport check or stop remains unverified (\(notice)). Keep original Trip navigation."))
                    .font(.footnote).accessibilityIdentifier("recovery.traffic.notice")
            }
        }.disabled(store.busy || store.pending != nil)
    }
    private func placeLabel(_ reference: NativeTrafficContext.Reference) -> String {
        guard let display = reference.display else { return t("地址待核实", "Address pending") }
        return (chinese ? display.zh : display.en) + " · " + display.addressLines.joined(separator: ", ")
    }
    private func trafficResult(_ observation: NativeTrafficObservation) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(t("高德 · 取回时参考", "AMap · fetch-time reference")).font(.headline)
            Text(t("取回：", "Fetched: ") + observation.fetchedAt)
            if let receipt = observation.durableReceipt {
                Text(t("来源版本：", "Source version: ") + receipt.sourceVersion + " · " + observation.policy.licenceVersion)
            }
            Text(t("有效期限：", "Expires: ") + (observation.durableReceipt?.expiresAt ?? observation.expiresAt))
            Text(t("整段路线估算：\(observation.selected.durationSeconds) 秒 · \(observation.selected.distanceMeters) 米", "Whole-route estimate: \(observation.selected.durationSeconds) sec · \(observation.selected.distanceMeters) m"))
            if let delta = observation.comparison.durationDeltaSeconds {
                Text(t("与先前参考的耗时差：\(delta) 秒", "Duration change from previous reference: \(delta) sec"))
            }
            if observation.traffic.status == "observed", let meters = observation.traffic.meters {
                Text(t("返回路线的路况分类米数：未知 \(Int(meters["unknown"] ?? 0))、畅通 \(Int(meters["clear"] ?? 0))、缓慢 \(Int(meters["slow"] ?? 0))、拥堵 \(Int(meters["congested"] ?? 0))、严重拥堵 \(Int(meters["severe"] ?? 0))。", "Returned-route TMC metres: unknown \(Int(meters["unknown"] ?? 0)), clear \(Int(meters["clear"] ?? 0)), slow \(Int(meters["slow"] ?? 0)), congested \(Int(meters["congested"] ?? 0)), severe \(Int(meters["severe"] ?? 0))."))
            }
            Text(t("路况分类变化可能来自不同的返回路线，不证明同一道路发生事件。没有供应商观察时间，也不证明封路、到站或未来状况。", "TMC changes may reflect a different returned route; they do not prove an incident on the same road. No provider observation timestamp, closure, arrival or forecast is established."))
            if observation.qualification.status != "qualified" {
                Text(t("本参考尚不具备局部恢复来源资格。", "This reference is not qualified for local recovery."))
            }
            ForEach(Array(observation.alternatives.enumerated()), id: \.offset) { _, alternative in
                Text(t("其他整段方式 ", "Alternative whole-route mode ") + alternative.option.mode + " · \(alternative.option.durationSeconds)s · \(alternative.option.distanceMeters)m")
                Text(t("仅估算，需核实换乘、步行和费用；不会自动更换恢复方式。", "Estimate only; verify transfers, walking and costs. Recovery mode is not changed automatically."))
            }
        }.font(.footnote).accessibilityIdentifier("recovery.traffic.observation")
    }
    private func loadTrafficContext() async {
        traffic.bind(session.dataScope)
        guard active, let detail = store.detail, !dayID.isEmpty, !trafficItemID.isEmpty else { traffic.clearContext(); return }
        await traffic.loadContext(trip: tripID, version: detail.trip.headVersion, day: dayID, item: trafficItemID,
                                  scope: nil, current: { session.dataScope }, post: { body in
            try await session.tripRequest(path: "api/trips/native/v2/\(tripID)/traffic-observations/context", method: "POST", body: body)
        })
    }
    private func checkTraffic(refresh: Bool) async {
        guard active, mapConsent, let scope = transportScope else { return }
        if let detail = store.detail {
            await traffic.loadContext(trip: tripID, version: detail.trip.headVersion, day: dayID, item: trafficItemID,
                                      scope: scope, current: { session.dataScope }, post: { body in
                try await session.tripRequest(path: "api/trips/native/v2/\(tripID)/traffic-observations/context", method: "POST", body: body)
            })
        }
        guard active, mapConsent, transportScope == scope, !Task.isCancelled else { return }
        await traffic.check(scope: scope, refresh: refresh, consent: mapConsent, current: { session.dataScope }, post: trafficPost)
    }
    private func trafficPost(_ body: Data) async throws -> Data {
        try await session.tripRequest(path: "api/trips/native/v2/\(tripID)/traffic-observations", method: "POST", body: body)
    }
    private func endTraffic() {
        trafficTask?.cancel(); traffic.invalidate()
        Task { await traffic.stop(current: { session.dataScope }, post: trafficPost) }
    }
    private func prepareTransport() async {
        guard canPrepare, let detail = store.detail,
              let receipt = traffic.receipt(scope: transportScope, foreground: active && mapConsent, now: Date()) else { return }
        selectedTransportScope = receipt.scope
        let input = NativeTransportRecoveryInput(operationId: UUID().uuidString.lowercased(), expectedHeadVersion: detail.trip.headVersion,
            dayId: dayID, selectedItemIds: selected, fixedItemIds: fixed.union(forcedFixed).sorted(), reservationBindings: mapping,
            receiptId: receipt.receiptId, scope: receipt.scope, locale: chinese ? "zh" : "en")
        await store.prepare(input: .transport(input), current: { session.dataScope }, post: post)
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
                Text(t("暂时无法完整核实订单信息。请稍后重试；核实前不能选择调整方案。", "Reservation information cannot be fully checked right now. Try again later; an adjustment cannot be selected until this is checked."))
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
            Text(t("将订单关联到行程项目，只表示你要求保留原项目、日期和时间，不代表供应商已确认。订单状态不明、信息变化、关联重复或日期不一致时，仍需核实。", "Linking a reservation to a Trip item means you want to keep its original details, date and time. It is not confirmation from the supplier. Unknown status, changed information, duplicate links or mismatched dates still need checking."))
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
                Text(t("这次核验已过期，请重新报告变化并核实；旧结果不能继续使用。", "This check has expired. Report the change and check again; the old result can no longer be used."))
            }
        }
    }
    private func pendingSection(_ pending: NativeRecoveryPending) -> some View {
        Section(t("请求进度与原提案结果", "Request progress and original proposal result")) {
            Text(pending.operationID).font(.caption).textSelection(.enabled)
            Text(t("请求可能已经处理，但暂时无法确认结果。我们会保留同一请求。请先核对结果；如仍无法确认，可在核实身份后明确重试同一请求。如果此前尚未处理，重试可能首次处理它，不会重复创建结果。当前账号无权访问时不能重试。", "Your request may have been processed, but the result cannot be confirmed yet. The same request is retained. Check the result first; if it is still unclear, you can explicitly retry the same request after your identity is verified. If it was never processed, retrying may process it for the first time without creating a duplicate result. You cannot retry if this account does not have access."))
                .font(.footnote)
            if pending.stage != "select" {
                Text(t("候选核验的处理结果目前无法直接查询。查不到提案结果，也不代表候选核验没有发生。", "The result of the candidate check cannot be queried directly yet. An unavailable proposal result does not mean the candidate check never happened."))
                    .font(.footnote)
            }
            Button(t("核对这次请求的结果", "Check this request's result")) { run { await store.recover(current: { session.dataScope }, post: post) } }
                .disabled(store.busy).accessibilityIdentifier("recovery.receipt")
            if store.outcome == nil {
                Button(t("结果仍不明确，重试同一请求", "Result still unclear; retry the same request")) { run {
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
                        Button(t("审阅这份原提案", "Review this original proposal")) {
                            // Only the exact original proposal extends this foreground recovery flow.
                            if let pending = store.pending, pending.transportReference != nil {
                                do { try traffic.beginReview(pending: pending, outcome: outcome, current: session.dataScope) }
                                catch { store.clearPreview(); return }
                            }
                            task?.cancel(); trafficTask?.cancel()
                            navigation = .init(scope: scope, tripID: tripID, reference: reference, version: outcome.operation.receipt.baseVersion)
                        }.accessibilityIdentifier("recovery.review")
                    } else if outcome.operation.state == "pending" {
                        Text(t("这份原提案已过期，或相关信息尚未核实。请先核对结果，目前不能确认。", "This original proposal has expired or its information is unverified. Check its result first; it cannot be confirmed right now."))
                    }
                    if ["applied", "rejected", "expired", "stale"].contains(outcome.operation.state) {
                        Button(t("完成这次请求，刷新后报告新变化", "Finish this request; refresh before reporting another change")) {
                            do { try store.finishTerminal(current: session.dataScope); run { await refresh() } } catch { store.suspend() }
                        }.disabled(store.busy)
                    }
                }
            }
        }
    }
    private func stateText(_ state: String) -> String {
        switch state {
        case "applied": t("原提案已应用，结果已核实", "Original proposal applied; result verified")
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
        case "OTHER_TRIP_OPERATION_PENDING": t("另一份行程的请求结果尚未确认。请返回该行程，核对那次请求的结果。", "A request for another Trip is still unconfirmed. Return to that Trip and check that request's result.")
        case "JOURNAL_UNAVAILABLE": t("暂时无法核实本机保存的请求记录，因此没有发送新请求。请稍后重新核对。", "The request saved on this device cannot be verified right now, so no new request was sent. Try checking again later.")
        case "HIGH_RISK_UNWELL": t("停止并寻求当地官方帮助；当前没有可核实的官方入口。", "Stop and seek local official help; no qualified official entry is available here.")
        default: t("相关信息或请求结果尚未确认（\(code)）。原行程和同一请求仍保留；请重新核对，暂时不要视为已解决。", "The information or request result is still unconfirmed (\(code)). Your original Trip and the same request are retained. Check again before treating this as resolved.")
        }
    }
    private func runTraffic(_ operation: @escaping @MainActor () async -> Void) {
        trafficTask?.cancel(); trafficTask = Task { await operation() }
    }
    private func run(_ operation: @escaping @MainActor () async -> Void) { task?.cancel(); task = Task { await operation() } }
    private func clearInput() { selectedTransportScope = nil; dayID = ""; selected = []; fixed = []; bindings = [:]; navigation = nil; trafficItemID = ""; originID = ""; destinationID = ""; mapConsent = false; traffic.clearContext() }
    private func refresh() async {
        store.bind(session.dataScope); traffic.bind(session.dataScope); endTraffic(); clearInput()
        await store.refresh(tripID: tripID, current: { session.dataScope }, request: { path, method, body in
            try await session.tripRequest(path: path, method: method, body: body)
        })
        if let pending = store.pending {
            selectedTransportScope = pending.transportReference?.scope
            if pending.stage == "transport" { selectedTransportScope = try? pending.transportInput().scope }
            traffic.restoreStopScope(selectedTransportScope)
            await store.recover(current: { session.dataScope }, post: post)
        }
    }
    private func post(_ body: Data) async throws -> Data {
        try await session.tripRequest(path: "api/trips/native/v2/\(tripID)/recovery", method: "POST", body: body)
    }
    private func prepare() async {
        guard canPrepare, let detail = store.detail else { return }
        selectedTransportScope = nil
        let input = NativeRecoveryInput(operationId: UUID().uuidString.lowercased(), expectedHeadVersion: detail.trip.headVersion,
                                        dayId: dayID, selectedItemIds: selected, fixedItemIds: fixed.union(forcedFixed).sorted(),
                                        reservationBindings: mapping,
                                        report: .init(source: "user_report", kind: report, observedAt: ISO8601DateFormatter().string(from: Date())),
                                        locale: chinese ? "zh" : "en")
        await store.prepare(input: input, current: { session.dataScope }, post: post)
    }
}
