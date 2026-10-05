import SwiftUI

private struct NativeServiceFreshGrant: Decodable {
    let caseId: String
    let problem: String
    let grantRevision: Int
    let grantState: String
    let expiresAt: String?
}
private struct NativeServiceGrantPage: Decodable { let cases: [NativeServiceFreshGrant] }
private struct NativeServiceGrantReply: Decodable { let data: NativeServiceGrantPage }
private struct NativeServiceReview: Identifiable {
    let tripId: String
    let scope: NativeDataScope
    let baseVersion: Int
    let reference: String
    var id: String { reference }
}

struct NativeServiceOperationsView: View {
    let caseId: String
    @Environment(AppSettings.self) private var settings
    @Environment(\.scenePhase) private var phase
    @State private var store = NativeServiceOperationStore()
    @State private var trips = NativeTripStore()
    @State private var grant: NativeServiceFreshGrant?
    @State private var grantDeadline = 0.0
    @State private var urgent = false
    @State private var linkTrip = false
    @State private var selectedTrip = ""
    @State private var refresh = UUID()
    @State private var actionGeneration = UUID()
    @State private var actionTask: Task<Void, Never>?
    @State private var grantError = false
    @State private var review: NativeServiceReview?
    @State private var reviewError = false
    @State private var deleteConfirm = false
    @State private var exportConfirm = false
    @State private var exportFile: NativeServiceExportFile?
    @State private var exportBundle: NativeServiceDataBundle?
    @State private var exportCleanup: Task<Void, Never>?
    @State private var share: NativeServiceExportFile?
    @State private var dataError = false
    private var session: NativeSession { settings.nativeSession }
    private var actor: NativeDataScope? { session.dataScope }
    private var zh: Bool { settings.selectedLocale == .zh }
    private func t(_ zh: String, _ en: String) -> String { self.zh ? zh : en }
    private struct Key: Equatable { let actor: NativeDataScope?; let active: Bool; let refresh: UUID }
    private var key: Key { .init(actor: actor, active: phase == .active, refresh: refresh) }
    private var currentGrant: NativeServiceFreshGrant? {
        guard phase == .active, ProcessInfo.processInfo.systemUptime < grantDeadline else { return nil }; return grant
    }
    private var tripSelection: NativeTripDetail? {
        guard let actor, trips.scope == actor, trips.detail?.trip.id == selectedTrip else { return nil }; return trips.detail
    }
    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { _ in
            Form {
                Section {
                    Text(t("接单前没有负责人或预计完成时间；服务不会代订、退款或自动修改行程。", "Before acceptance there is no assignee or completion estimate. This service does not book, refund or change your Trip automatically."))
                    Text(t("紧急危险请立即联系当地官方紧急渠道；在中国大陆：警务110、急救120、消防119。供应商订单问题可直接通过原订单的官方客服渠道处理。", "For immediate danger, contact local official emergency services. In mainland China: police 110, ambulance 120, fire 119. For supplier orders, use the official support channel on your original order."))
                        .font(.footnote).accessibilityIdentifier("service.operations.official")
                }
                if let actor, phase == .active {
                    if let value = store.visible(caseId: caseId, actor: actor) { projection(value, actor: actor) }
                    else if store.isFresh(actor), let currentGrant {
                        Section(t("运营请求", "Operational request")) {
                            Text(currentGrant.problem)
                            Text(t("尚无运营请求记录；授权不代表已排队或接单。", "No operational request is recorded. Sharing permission does not mean queued or accepted."))
                            capacity(store.capacity)
                            requestControls(currentGrant, actor: actor)
                        }
                    } else {
                        Section { Text(t("服务状态或授权暂不可读，请刷新；当前状态未知。", "Service status or sharing permission is unavailable. Refresh; current status is unknown.")) }
                    }
                    recovery(actor: actor)
                    serviceData(actor: actor)
                    if let receipt = store.receipt {
                        Section(t("操作回执", "Operation receipt")) {
                            Text(receipt.outcome == "deleted" ? t("此服务记录已删除；保留最小删除回执，这不代表全部账户数据已删除。", "This service record was deleted; a minimal deletion receipt remains. This is not deletion of all account data.") : receipt.outcome == "cancelled" ? t("原操作已终止；请重新读取服务状态。", "The original operation was stopped. Read service status again.") : t("原操作已记录；服务结果以重新读取的状态为准。", "The original operation was recorded. Read current status for the service outcome."))
                        }
                    }
                    if store.notice != nil || grantError || reviewError || dataError {
                        Text(t("暂未确认操作或当前资格。可刷新状态、查询原回执，或返回管理授权。", "The operation or current eligibility is not confirmed. Refresh, check the original receipt, or return to manage sharing."))
                            .foregroundStyle(.red).accessibilityIdentifier("service.operations.unavailable")
                    }
                    Button(t("刷新状态与授权", "Refresh status and sharing")) { reload() }
                        .disabled(store.busy || actionTask != nil).accessibilityIdentifier("service.operations.refresh")
                } else { Text(t("登录后读取你自己的服务请求。", "Sign in to read your own service request.")) }
            }
        }
        .navigationTitle(t("服务进度", "Service progress"))
        .task(id: key) { let captured = key; guard captured.active, let actor = captured.actor else { clear(); return }; await load(actor: actor, captured: captured) }
        .onChange(of: actor) { _, _ in clear() }
        .onChange(of: phase) { _, value in if value != .active { clear() } }
        .onDisappear { actionGeneration = UUID(); actionTask?.cancel(); actionTask = nil; if review == nil && share == nil { clear() } }
        .confirmationDialog(t("删除此服务记录？", "Delete this service record?"), isPresented: $deleteConfirm, titleVisibility: .visible) {
            Button(t("确认删除服务记录及相关服务数据", "Confirm deletion of this service and its related data"), role: .destructive) { if let actor { deleteService(actor: actor) } }
            Button(t("保留记录", "Keep record"), role: .cancel) {}
        } message: {
            Text(t("会删除本服务问题、授权记录和运营资料，并保留最小回执。删除无法撤销；不会删除整个行程或全部账户数据，已导出副本无法召回。", "Deletes this issue, grant history and operational data, leaving a minimal receipt. Deletion cannot be undone. It does not delete the Trip or all account data, and exported copies cannot be recalled."))
        }
        .confirmationDialog(t("导出服务数据？", "Export service data?"), isPresented: $exportConfirm, titleVisibility: .visible) {
            Button(t("准备仅服务范围的 JSON 文件", "Prepare a JSON file for service data only")) { if let actor { run { await exportService(actor: actor) } } }
            Button(t("取消", "Cancel"), role: .cancel) {}
        } message: {
            Text(t("仅导出当前可核服务范围；Brief、附件和其他账户数据不在此文件内。共享给其他应用需你主动选择，取得的副本无法召回。", "Exports only the currently verified service scope. Briefs, attachments and other account data are not included. You choose whether to share with another app; downloaded copies cannot be recalled."))
        }
        .sheet(item: $share, onDismiss: { eraseExport() }) { file in
            NativeServiceExportShare(file: file)
        }
        .sheet(item: $review, onDismiss: { reload() }) { item in
            NavigationStack {
                NativeTripView(initialTripID: item.tripId, initialTripScope: item.scope, initialProposalReference: item.reference, initialTripVersion: item.baseVersion)
                    .toolbar { ToolbarItem(placement: .topBarLeading) { Button(t("返回服务", "Return to service")) { review = nil } } }
            }
        }
    }
    @ViewBuilder private func capacity(_ value: NativeServiceCapacity?) -> some View {
        switch value?.state {
        case "available": Text(t("本次核对有可用人员容量，尚不代表此申请已接单。", "This check found staff capacity. It does not mean this request is accepted."))
        case "full": Text(t("本次核对人员容量已满。可等待或退出，订单问题可联系原供应商官方客服。", "Staff capacity is full at this check. Wait or withdraw; use the original supplier's official support for order issues."))
        default: Text(t("人员容量未知；不承诺接单或处理时间。", "Staff capacity is unknown. Acceptance and timing are not promised."))
        }
    }
    @ViewBuilder private func requestControls(_ value: NativeServiceFreshGrant, actor: NativeDataScope) -> some View {
        if value.grantState == "active", let expiry = value.expiresAt, let end = try? NativeServiceOperationWire.date(expiry), end > Date() {
            Toggle(t("紧急问题（仍请先联系官方渠道）", "Urgent issue (contact official channels first)"), isOn: $urgent)
            Toggle(t("明确关联我选择的行程，仅供本人返回", "Link my selected Trip for my own return"), isOn: $linkTrip)
                .onChange(of: linkTrip) { _, enabled in if enabled { run { await trips.list(using: session) } } else { selectedTrip = ""; trips.reset(for: nil) } }
            if linkTrip {
                Picker(t("行程", "Trip"), selection: $selectedTrip) {
                    Text(t("请选择", "Choose")).tag("")
                    ForEach(trips.trips) { Text($0.title).tag($0.id) }
                }.onChange(of: selectedTrip) { _, id in if !id.isEmpty { run { await trips.select(id, using: session) } } }
                Text(t("员工仍仅获授权问题说明，行程关联不授予行程或 Brief 访问。", "Staff still receive only the shared issue description. Linking does not grant Trip or Brief access.")).font(.footnote)
            }
            Button(t("提交运营请求并检查容量", "Request service and check capacity")) { submit(action: "request", actor: actor) }
                .disabled(store.pending != nil || store.busy || actionTask != nil || linkTrip && (tripSelection == nil || trips.busy))
                .accessibilityIdentifier("service.operations.request")
        } else { Text(t("返回上一页选择接收员工并预览授权；已撤回或过期的授权不能提交运营请求。", "Return to choose a recipient and preview sharing. Revoked or expired permission cannot submit an operational request.")) }
    }
    @ViewBuilder private func projection(_ value: NativeServiceProjection, actor: NativeDataScope) -> some View {
        Section(t("真实服务状态", "Current service status")) {
            Text(value.problem)
            Text(value.status.label(zh: zh)).font(.headline).accessibilityIdentifier("service.operations.status")
            Text(Date(timeIntervalSince1970: value.updatedAt / 1000), style: .date)
            Text(Date(timeIntervalSince1970: value.updatedAt / 1000), style: .time)
            capacity(value.capacity)
            if value.status.mayShowAcceptance, let staff = value.staff {
                Text(t("负责人：", "Assignee: ") + staff.label)
                Text(t("实际接单时间", "Actual acceptance time")); Text(Date(timeIntervalSince1970: staff.acceptedAt / 1000), style: .time)
                Text(t("已登记班次结束时间（不是解决承诺）", "Recorded shift end (not a resolution promise)")); Text(Date(timeIntervalSince1970: staff.shiftEndsAt / 1000), style: .time)
            }
            Text(t("已记录人工分钟：\(value.manualMinutes)；实际总分钟未知，不代表费用或购买承诺。", "Recorded human minutes: \(value.manualMinutes). Actual total time is unknown; this is not a charge or purchase commitment."))
                .accessibilityIdentifier("service.operations.minutes")
            Text(t("Brief 和来源资格未知。", "Brief and source eligibility are unknown.")).font(.footnote)
            Text(t("授权状态：", "Sharing status: ") + grantLabel(value.grantState))
            if let expiry = value.expiresAt { Text(Date(timeIntervalSince1970: expiry / 1000), style: .relative) }
            if !value.status.isTerminal {
                Button(t("取消此服务请求", "Cancel this service request"), role: .destructive) { submit(action: "cancel", actor: actor) }
                    .disabled(store.pending != nil || store.busy || actionTask != nil).accessibilityIdentifier("service.operations.cancel")
            }
            Text(t("返回上一页可随时撤回访问。撤权、取消、未解决与已解决分别保留真实记录。", "Return to revoke access at any time. Revocation, cancellation, unresolved and resolved outcomes remain distinct."))
        }
        Section(t("结果依据", "Result evidence")) {
            if value.evidence.isEmpty { Text(t("尚无结果依据。", "No result evidence is recorded.")) }
            ForEach(Array(value.evidence.enumerated()), id: \.offset) { _, evidence in
                VStack(alignment: .leading) {
                    Text(evidence.label(zh: zh)).font(.headline)
                    Text(evidence.note); Text(evidence.reference).font(.caption)
                    Text(Date(timeIntervalSince1970: evidence.observedAt / 1000), style: .date)
                }
            }
            Text(t("教程、已联系服务方和外部实际解决分别记录；联系记录不等于问题已解决。", "Tutorials, provider contact and external resolution have separate evidence. Contact does not mean resolution.")).font(.footnote)
        }
        if value.trip.kind == "bound", let id = value.trip.tripId, let version = value.trip.headVersion {
            Section(t("同一行程", "Same Trip")) {
                NavigationLink(t("返回关联行程", "Return to the linked Trip")) { NativeTripView(initialTripID: id, initialTripScope: actor) }
                    .accessibilityIdentifier("service.operations.trip")
                Text(t("归档行程不会删除未完成服务。此关联不会修改行程。", "Archiving a Trip does not delete unfinished service. This link does not change the Trip.")).font(.footnote)
                Button(t("读取此行程已有待确认提议", "Read this Trip's existing pending proposal")) { run { await trips.select(id, using: session) } }
                if trips.scope == actor, let proposal = trips.pending?.proposal, trips.detail?.trip.id == id,
                   trips.detail?.trip.headVersion == version, proposal.baseTripVersion == version, proposal.status == "pending", !proposal.stale {
                    Button(t("选择此已有提议作为服务候选", "Select this existing proposal as a service candidate")) { submit(action: "select_proposal", actor: actor, proposal: proposal) }
                        .disabled(store.pending != nil || store.busy || actionTask != nil || value.grantState != "active")
                }
                if let proposal = value.proposal {
                    Button(t("核对原提议并审阅差异", "Verify the original proposal and review its diff")) { run { await openProposal(proposal, actor: actor) } }
                        .disabled(store.busy || actionTask != nil || store.pending != nil || value.grantState != "active")
                        .accessibilityIdentifier("service.operations.proposal")
                    Text(t("服务候选不是行程修改；须在原提议流程由你确认。", "A service candidate is not a Trip change. Confirm it yourself in the original proposal workflow.")).font(.footnote)
                }
            }
        } else { Section { Text(t("尚无权威行程关联，不能推断本服务属于当前行程。", "No authoritative Trip link exists. This service cannot be assumed to belong to the current Trip.")) } }
    }
    @ViewBuilder private func recovery(actor: NativeDataScope) -> some View {
        if let pending = store.pending {
            Section(t("原操作结果尚待核对", "Original operation needs verification")) {
                Text(t("保留原始请求。回执缺失不证明操作没有执行。", "The original request is retained. A missing receipt does not prove it did not execute."))
                if (try? NativeServiceOperationCommand(body: pending.body).caseId) != caseId { Text(t("待核对操作属于另一条服务请求；完成它之前不能覆盖。", "The pending operation belongs to another service request and cannot be overwritten.")) }
                Button(t("查询原操作回执", "Check original receipt")) { recover(.read, actor: actor) }
                if store.erased {
                    Text(t("服务端记录已擦除，操作结果未知；停止本机恢复不会撤销服务端操作。", "The server record was erased and its outcome is unknown. Stopping device recovery does not undo any server operation."))
                    Button(t("明确停止恢复并擦除本机原请求", "Stop recovery and erase the device request"), role: .destructive) {
                        store.stopErasedRecovery(actor: actor, current: { self.actor }, read: { try session.serviceOperationRecovery(actor: actor) }, complete: { try session.completeServiceOperation($0, actor: actor) })
                    }
                }
                Button(t("明确重试原始请求", "Explicitly retry original request")) { recover(.retry, actor: actor) }.disabled(store.erased || !store.isFresh(actor))
                Button(t("终止原操作并核对回执", "Stop original operation and check receipt"), role: .destructive) { recover(.abandon, actor: actor) }
            }.disabled(store.busy || actionTask != nil)
        }
    }
    @ViewBuilder private func serviceData(actor: NativeDataScope) -> some View {
        Section(t("服务数据", "Service data")) {
            Text(t("仅处理服务范围的数据。Brief 和附件尚不可用；此功能不代表全部账户导出或删除已完成。", "Handles service data only. Briefs and attachments are unavailable. This does not complete all account export or deletion."))
            Button(t("导出服务范围数据…", "Export service data…")) { exportConfirm = true }
                .disabled(store.busy || actionTask != nil || store.pending != nil).accessibilityIdentifier("service.data.export")
            if let file = exportFile, file.current(actor: actor), let bundle = exportBundle {
                Text(t("文件已准备：真实 \(bundle.rowCount) 条服务记录。", "File prepared: \(bundle.rowCount) actual service records."))
                ForEach(NativeServiceDataBundle.domains, id: \.self) { domain in Text(domainLabel(domain) + ": " + String(bundle.counts[domain] ?? 0)).font(.caption) }
                Text(t("该文件仅含服务问题、授权审计、运营状态、已记录分钟、运营审计和操作记录；Brief 与附件不可用。", "The file covers cases, grant audit, service state, recorded minutes, service audit and operations. Briefs and attachments are unavailable."))
                Button(t("主动共享此 JSON 文件", "Share this JSON file")) { if file.current(actor: self.actor), phase == .active { share = file } }
                Text(t("已取得的副本无法召回；本应用的临时文件会在到期、离开或退出时清理。", "Downloaded copies cannot be recalled. This app removes its temporary file on expiry, leaving or sign-out.")).font(.footnote)
            }
            Button(t("明确删除此服务记录…", "Explicitly delete this service record…"), role: .destructive) { deleteConfirm = true }
                .disabled(store.busy || actionTask != nil || store.pending != nil || currentGrant == nil && store.visible(caseId: caseId, actor: actor) == nil)
                .accessibilityIdentifier("service.data.delete")
        }
    }
    private func deleteService(actor: NativeDataScope) {
        guard self.actor == actor, phase == .active, let grant = currentGrant ?? grantFromProjection(actor), store.pending == nil else { return }
        do {
            let command = NativeServiceOperationCommand(body: try NativeServiceOperationWire.bytes(["action": "delete", "operationId": UUID().uuidString.lowercased(), "caseId": caseId.lowercased(), "grantRevision": grant.grantRevision, "confirmed": true]))
            try command.validate(); eraseExport(); run { await perform(command: command, actor: actor) }
        } catch { dataError = true }
    }
    private func exportService(actor: NativeDataScope) async {
        eraseExport(); dataError = false
        do {
            try NativeServiceExportFile.sweepOrphans()
            let sessionId = try session.serviceCaseExportSessionId(actor: actor), requestId = UUID().uuidString.lowercased()
            let started = ProcessInfo.processInfo.systemUptime
            let bytes = try await session.serviceCaseDataRequest(body: NativeServiceOperationWire.bytes(["action": "export", "requestId": requestId, "confirmed": true]), actor: actor)
            guard self.actor == actor, phase == .active, !Task.isCancelled,
                  try session.serviceCaseExportSessionId(actor: actor) == sessionId else { throw NativeDataError.staleSessionResponse }
            let bundle = try NativeServiceDataBundle.decode(bytes, actor: actor, sessionId: sessionId, requestId: requestId)
            let file = try NativeServiceExportFile.create(bundle: bundle, actor: actor, started: started)
            exportBundle = bundle; exportFile = file
            exportCleanup = Task {
                let duration = max(0, min(file.deadline - ProcessInfo.processInfo.systemUptime, file.expiresAt.timeIntervalSinceNow))
                do { try await Task.sleep(for: .seconds(duration)) } catch { return }
                if exportFile?.id == file.id { eraseExport() }
            }
        } catch { if self.actor == actor { dataError = true } }
    }
    private func eraseExport() {
        exportCleanup?.cancel(); exportCleanup = nil
        if let file = exportFile { do { try NativeServiceExportFile.erase(file); exportFile = nil; exportBundle = nil } catch { dataError = true } }
        share = nil
    }
    private func domainLabel(_ domain: String) -> String {
        switch domain {
        case "case": t("服务问题", "Service issues")
        case "grant_audit": t("授权记录", "Sharing history")
        case "service": t("服务状态", "Service state")
        case "minutes": t("已记录人工时段", "Recorded human work")
        case "service_audit": t("服务进度记录", "Service history")
        default: t("操作记录", "Operation records")
        }
    }
    private func grantLabel(_ state: String) -> String {
        switch state {
        case "active": t("有效", "Active")
        case "expired": t("已过期", "Expired")
        default: t("已撤回", "Revoked")
        }
    }
    private func load(actor: NativeDataScope, captured: Key) async {
        do { try NativeServiceExportFile.sweepOrphans() } catch { dataError = true }
        store.restore(actor: actor) { try session.serviceOperationRecovery(actor: actor) }
        await store.load(actor: actor, current: { self.actor }) { try await session.serviceOperationRequest(body: $0, actor: actor) }
        guard key == captured, !Task.isCancelled else { return }
        grant = nil; grantDeadline = 0; grantError = false
        if store.visible(caseId: caseId, actor: actor) != nil { return }
        do {
            for offset in stride(from: 0, to: 1000, by: 50) {
                let body = try NativeServiceOperationWire.bytes(["action": "list", "offset": offset])
                let started = ProcessInfo.processInfo.systemUptime
                let bytes = try await session.serviceCaseRequest(body: body)
                guard key == captured, self.actor == actor, !Task.isCancelled else { return }
                let rows = try JSONDecoder().decode(NativeServiceGrantReply.self, from: bytes).data.cases
                if let row = rows.first(where: { $0.caseId.lowercased() == caseId.lowercased() }) {
                    guard row.grantRevision >= 0, NativeServiceOperationWire.uuid(row.caseId), row.problem.count <= 1000 else { throw NativeDataError.invalidResponse }
                    grant = row; grantDeadline = started + 30; return
                }
                if rows.count < 50 { throw NativeDataError.invalidResponse }
            }
            throw NativeDataError.invalidResponse
        } catch { if key == captured { grantError = true } }
    }
    private func submit(action: String, actor: NativeDataScope, proposal: NativeTripPending.Proposal? = nil) {
        guard let currentGrant = currentGrant ?? grantFromProjection(actor), store.isFresh(actor), !store.busy, store.pending == nil else { return }
        do {
            let value = store.visible(caseId: caseId, actor: actor)
            var input: [String: Any] = ["action": action, "operationId": UUID().uuidString.lowercased(), "caseId": caseId.lowercased(), "expectedRevision": value?.revision ?? 0, "grantRevision": currentGrant.grantRevision]
            if action == "request" {
                input["urgency"] = urgent ? "urgent" : "normal"
                if linkTrip {
                    guard let detail = tripSelection, detail.trip.headVersion >= 0 else { return }
                    input["trip"] = ["kind": "bound", "tripId": detail.trip.id, "headVersion": detail.trip.headVersion]
                } else { input["trip"] = ["kind": "unknown"] }
            }
            if action == "select_proposal" {
                guard let proposal, let value, value.trip.kind == "bound", let tripId = value.trip.tripId,
                      proposal.baseTripVersion == value.trip.headVersion, trips.scope == actor, trips.detail?.trip.id == tripId else { return }
                input["proposal"] = ["proposalId": proposal.id, "tripId": tripId, "baseVersion": proposal.baseTripVersion]
            }
            let command = NativeServiceOperationCommand(body: try NativeServiceOperationWire.bytes(input)); try command.validate()
            run { await perform(command: command, actor: actor) }
        } catch { grantError = true }
    }
    private func grantFromProjection(_ actor: NativeDataScope) -> NativeServiceFreshGrant? {
        guard let value = store.visible(caseId: caseId, actor: actor) else { return nil }
        return .init(caseId: value.id, problem: value.problem, grantRevision: value.grantRevision, grantState: value.grantState, expiresAt: nil)
    }
    private func recover(_ recovery: NativeServiceOperationStore.Recovery, actor: NativeDataScope) { run { await perform(command: nil, recovery: recovery, actor: actor) } }
    private func perform(command: NativeServiceOperationCommand?, recovery: NativeServiceOperationStore.Recovery? = nil, actor: NativeDataScope) async {
        await store.perform(command: command, recovery: recovery, actor: actor, current: { self.actor },
                            read: { try session.serviceOperationRecovery(actor: actor) },
                            retain: { try session.rememberServiceOperation($0, actor: actor) },
                            complete: { try session.completeServiceOperation($0, actor: actor) }) { bytes, dataFamily in
            if dataFamily { return try await session.serviceCaseDataRequest(body: bytes, actor: actor) }
            return try await session.serviceOperationRequest(body: bytes, actor: actor)
        }
        guard self.actor == actor, !Task.isCancelled else { return }
        if store.pending == nil { refresh = UUID() }
    }
    private func openProposal(_ pointer: NativeServiceProjection.Proposal, actor: NativeDataScope) async {
        reviewError = false
        do {
            let bytes = try await session.tripRequest(path: "api/trips/native/v2/\(pointer.tripId)/proposal", method: "GET", queryItems: [URLQueryItem(name: "proposalId", value: pointer.proposalId)])
            let value = try JSONDecoder().decode(NativeTripPending.self, from: bytes)
            guard self.actor == actor, phase == .active, !Task.isCancelled,
                  store.visible(caseId: caseId, actor: actor)?.proposal?.proposalId == pointer.proposalId,
                  value.trip.id == pointer.tripId, value.proposal.id == pointer.proposalId,
                  value.proposal.baseTripVersion == pointer.baseVersion, value.trip.headVersion == pointer.baseVersion,
                  value.proposal.status == "pending", !value.proposal.stale else { throw NativeDataError.invalidResponse }
            review = .init(tripId: pointer.tripId, scope: actor, baseVersion: pointer.baseVersion, reference: "\(value.proposal.id):\(value.proposal.revision):\(value.proposal.digest)")
        } catch { reviewError = true }
    }
    private func run(_ body: @escaping @MainActor () async -> Void) {
        guard actionTask == nil else { return }
        let own = UUID(); actionGeneration = own
        actionTask = Task { await body(); if actionGeneration == own { actionTask = nil } }
    }
    private func reload() { eraseExport(); store.invalidate(); grant = nil; grantDeadline = 0; refresh = UUID() }
    private func clear() { eraseExport(); deleteConfirm = false; exportConfirm = false; actionGeneration = UUID(); actionTask?.cancel(); actionTask = nil; store.clear(); grant = nil; grantDeadline = 0; trips.reset(for: nil); selectedTrip = ""; linkTrip = false; review = nil }
}
