import SwiftUI

private enum NativeDataCoverageDestination: Identifiable {
    case turnData, profileData, resultData, conversationData, archiveData, coverageProgress, core, memory, trip(NativeLinkedTripDeleteSelection), deviceExport, deviceDelete, material(NativeMaterialReferenceScope), notification(NativeNotificationDataScope)
    var id: String {
        switch self { case .turnData: "turn-data"; case .profileData: "profile-data"; case .resultData: "result-data"; case .conversationData: "conversation-data"; case .archiveData: "archive-data"; case .coverageProgress: "coverage-progress"; case .core: "core"; case .memory: "memory"; case .trip(let v): v.tripID; case .deviceExport: "device-export"; case .deviceDelete: "device-delete"; case .material(let scope): scope.rawValue; case .notification(let scope): scope.rawValue }
    }
}

struct NativeDataCoverageModuleView: View {
    let module: NativeDataCoverageModule
    let store: NativeDataCoverageStore
    let session: NativeSession
    let chinese: Bool
    @Environment(\.scenePhase) private var phase
    @Environment(\.dismiss) private var dismiss
    @State private var destination: NativeDataCoverageDestination?
    @State private var ownerConfirmed = false
    @State private var confirmDelete = false
    @State private var placePicker = false
    @State private var guide: NativePlaceGuideSelection?
    @State private var guideLabel: String?
    @State private var guideDeadline: TimeInterval = 0
    @State private var cases = NativeDataCoverageCases()
    @State private var selectedCase: NativeDataCoverageCase?
    @State private var brief = NativeTravelerBriefStore()
    @State private var lifecycle = NativeTripLifecycleStore()
    @State private var actionTask: Task<Void, Never>?
    @State private var error = false
    private var actor: NativeCommunitySafetyActor? { phase == .active ? try? session.communitySafetyActor() : nil }
    private var client: NativeDataCoverageClient { .init(session: session, active: { phase == .active }) }
    private var registered: Bool { store.visibleModules(actor).contains(module) }
    private func t(_ zh: String, _ en: String) -> String { chinese ? zh : en }

    var body: some View {
        Form {
            Section(t("确认范围", "Review the scope")) {
                Text(scopeDescription)
                Text(t("保留原模块声明的操作围栏与最少审计；外部已保存副本无法召回。此操作不代表全部账户数据完成。", "The original module’s operation fences and minimal audit remain. Externally saved copies cannot be recalled. This operation does not complete all account data."))
                Button(t("刷新覆盖注册", "Refresh coverage registration")) { ownerConfirmed = false; run { await store.load(client) } }.disabled(store.busy || actor == nil)
                if !registered { Text(t("覆盖注册已到期或版本改变。刷新后重新核对范围。", "Coverage registration expired or changed version. Refresh and review the scope again.")) }
            }
            if module.location == .server {
                serverActions
            } else if module.id == "materials" {
                Section(t("所选本机文件", "Selected device files")) {
                    Button(t("在原界面选择并导出文件", "Select and export files in the original screen")) { destination = .deviceExport }
                    Button(t("在原界面预览并删除文件", "Preview and delete files in the original screen"), role: .destructive) { destination = .deviceDelete }
                    Text(t("文件字节已准备与系统最终交付分开记录；取消分享不报交付完成。", "Prepared file bytes and final system handoff are recorded separately. Cancelling sharing is not completed delivery."))
                }.disabled(actor == nil || !registered)
            } else if module.id == "offline" {
                NativeDataCoverageOfflineView(coverage: store, session: session, chinese: chinese)
            } else if module.id == "local_journals" {
                NativeJournalDataView(coverage: store, session: session, chinese: chinese)
            } else if module.id == "guide_cache" {
                NativeGuideCacheDataView(coverage: store, session: session, chinese: chinese)
            } else {
                Section { Text(NativeDataCoverageCopy.missing(module.id, chinese: chinese)) }
            }
            TimelineView(.periodic(from: .now, by: 1)) { _ in
                let rows = store.visibleRows(actor).filter { $0.moduleID == module.id }
                ForEach(rows) { row in
                    Section(row.action == .export ? t("导出回执", "Export receipt") : t("删除回执", "Deletion receipt")) {
                        Text(NativeDataCoverageCopy.state(row.state, chinese: chinese)).accessibilityIdentifier("coverage.receipt." + row.action.rawValue)
                        Text(row.selection).font(.caption).textSelection(.enabled)
                        Text(row.operationID).font(.caption).textSelection(.enabled)
                        if row.state == .scopedComplete { Text(t("只证明上列选择在该操作时的结果。", "Proves only the selection above at the time of this operation.")).font(.footnote) }
                    }
                }
                if let url = store.exportURL(moduleID: module.id, current: actor) {
                    ShareLink(item: url) { Text(t("主动保存或分享已核验文件", "Save or share the verified file explicitly")) }
                }
            }
            if error { Text(t("选择、权限、版本或受保护请求未确认；请刷新，尚未执行新的范围。", "Selection, authority, version or protected request is unconfirmed. Refresh; no new scope was executed.")) }
        }.navigationTitle(NativeDataCoverageCopy.title(module.id, chinese: chinese))
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(t("完成", "Done")) { dismiss() } } }
            .task(id: actor) { clearSelection() }
            .onChange(of: actor) { _, _ in actionTask?.cancel(); clearSelection(); destination = nil }
            .onChange(of: phase) { _, next in if next != .active { actionTask?.cancel(); clearSelection(); destination = nil } }
            .onDisappear { actionTask?.cancel(); clearSelection() }
            .sheet(item: $destination) { target in
                NavigationStack {
                    switch target {
                    case .turnData:
                        NativeTurnDataConsumer(module: module, coverage: store, client: session.turnDataClient,
                            makeStore: { session.turnDataStore(scope: $0) }, chinese: chinese)
                    case .resultData:
                        NativeResultDataConsumer(module: module, coverage: store, client: session.resultDataClient,
                            makeStore: { session.resultDataStore(scope: $0) }, chinese: chinese)
                    case .profileData:
                        NativeProfileDataConsumer(module: module, coverage: store, client: session.profileDataClient,
                            makeStore: { session.profileDataStore(scope: $0) }, chinese: chinese)
                    case .conversationData:
                        NativeConversationDataConsumer(module: module, coverage: store, client: session.conversationDataClient,
                            makeStore: { session.conversationDataStore(scope: $0) }, chinese: chinese)
                    case .archiveData: NativeArchiveDataConsumer(module: module, coverage: store, session: session, chinese: chinese)
                    case .coverageProgress: NativeCoverageProgressConsumer(module: module, coverage: store, session: session, chinese: chinese)
                    case .core: NativeDataCoverageCoreConsumer(coverage: store, session: session)
                    case .memory: NativeDataCoverageMemoryConsumer(module: module, coverage: store, session: session, chinese: chinese)
                    case .trip(let selection): NativeDataCoverageTripConsumer(module: module, coverage: store, session: session, selection: selection)
                    case .deviceExport: NativeDataCoverageDeviceExportConsumer(coverage: store, session: session, chinese: chinese)
                    case .deviceDelete: NativeDataCoverageDeviceDeleteConsumer(coverage: store, session: session, chinese: chinese)
                    case .notification(let scope): NativeNotificationDataConsumer(module: module, coverage: store, session: session, scope: scope, chinese: chinese)
                    case .material(let scope): NativeMaterialReferenceConsumer(coverage: store, session: session, scope: scope, chinese: chinese)
                    }
                }
            }
            .sheet(isPresented: $placePicker) {
                if let actor {
                    NativeCommunityPlacePicker(session: session, actor: .init(scope: actor.scope, sessionID: actor.sessionID), chinese: chinese) { selected in
                        guard selected.actor.scope == self.actor?.scope, selected.actor.sessionID == self.actor?.sessionID else { error = true; return }
                        let canonical = selected.row.selection.canonicalPoiId
                        guide = .init(scope: selected.actor.scope, canonicalPoiID: canonical, placeReferenceID: selected.referenceID,
                                      tripID: selected.tripID, tripVersion: selected.tripVersion, locale: chinese ? "zh" : "en", interest: .general)
                        guideLabel = selected.label; guideDeadline = ProcessInfo.processInfo.systemUptime + 30; ownerConfirmed = false
                    }
                }
            }
            .task(id: actor) {
                while !Task.isCancelled, actor != nil {
                    try? await Task.sleep(for: .seconds(1))
                    if !Task.isCancelled, guide != nil, ProcessInfo.processInfo.systemUptime >= guideDeadline { guide = nil; guideLabel = nil; ownerConfirmed = false }
                }
            }
            .confirmationDialog(t("确认删除刚才核对的范围？", "Delete the scope you just reviewed?"), isPresented: $confirmDelete, titleVisibility: .visible) {
                Button(t("确认所选范围并删除", "Confirm and delete the selected scope"), role: .destructive) { run { await perform(.delete) } }
            } message: { Text(scopeDescription) }
    }

    @ViewBuilder private var serverActions: some View {
        if NativeArchiveDataWire.catalog(module) {
            Section(t("归档资料与出口进度", "Archived data and exit progress")) {
                Button(t("选择归档行程、预览字段并确认导出", "Select an archived Trip, preview fields and confirm export")) { destination = .archiveData }
                Text(t("私有文件交付前核对原版本；删除仍使用原行程范围预览与回执。本出口请求与临时进度也可单独选择处理。", "Checks the original version before private-file delivery. Deletion still uses the original Trip scope preview and receipt. Exit requests and transient progress can be selected separately."))
            }.disabled(actor == nil || !registered)
        } else if NativeCoverageProgressWire.catalog(module) {
            Section(t("明确选择进度与围栏", "Explicitly select progress and fences")) {
                Button(t("选择记录、预览全部字段并确认导出或清理", "Select records, preview every field and confirm export or cleanup")) { destination = .coverageProgress }
                    .disabled(!registered || actor == nil)
                Text(t("原围栏与最小回执保留；只核验所选临时进度。", "Original fences and minimal receipts remain; verifies only selected transient progress."))
            }
        } else if let scope = NativeNotificationDataScope.catalogScope(module) {
            Section(t("明确选择通知资料范围", "Explicitly select notification data scope")) {
                Button(t("选择记录、预览全部字段并确认导出或擦除", "Select records, preview all fields and confirm export or erasure")) { destination = .notification(scope) }
                    .disabled(!registered || actor == nil)
                Text(t("核验私有文件或原操作擦除回执后，才记录所选范围的结果。", "Records selected scope only after a verified private file or original erasure receipt."))
            }
        } else if module.version == NativeMaterialReferenceWire.schema,
           module.exportHandler == "materials", module.deleteHandler == "materials",
           let scope = NativeMaterialReferenceScope(rawValue: module.scope) {
            Section(t("明确选择资料与处理范围", "Select data and operation scope explicitly")) {
                Button(t("选择记录、预览字段并确认导出或擦除", "Select records, review fields and confirm export or erasure")) { destination = .material(scope) }
                    .disabled(!registered || actor == nil)
                Text(t("只在真实文件交付或擦除回执核验后记录所选范围的结果。打开或关闭界面不代表完成。", "Records a selected scope only after actual file delivery or a verified erasure receipt. Opening or closing the screen does not complete it."))
            }
        } else {
        if module.exportHandler == "core" {
            Section(t("核心导出文件", "Core export file")) {
                Button(t("打开原核心导出与下载界面", "Open the original core export and download screen")) { destination = .core }
                Text(t("请求排队或文件准备不算导出交付。原界面核验实际下载字节及摘要后，此处才收集对应核心模块回执。", "Queued requests and prepared artifacts are not delivery. This entry collects core module receipts only after the original screen validates downloaded bytes and their digest."))
            }.disabled(actor == nil || !registered)
        } else if module.exportHandler != nil {
            Section(t("模块导出", "Module export")) {
                if module.id == "guide" { guideSelection }
                Toggle(t("明确选择此模块声明的自有资料范围", "Explicitly select the owned data scope declared by this module"), isOn: $ownerConfirmed)
                Button(t("请求此范围的导出文件", "Request an export file for this scope")) { run { await perform(.export) } }
                    .disabled(!ownerConfirmed || !registered || store.busy || actor == nil || module.id == "guide" && !validGuide)
            }
        } else { Section(t("导出缺项", "Export unavailable")) { Text(NativeDataCoverageCopy.missing(module.id, chinese: chinese)) } }

        if NativeTurnDataWire.catalog(module) {
            Section(t("本人所选轮次资料", "My selected Turn data")) {
                Button(t("选择一个已完成轮次，核对敏感副本并确认清理", "Select a completed Turn, review sensitive copies and confirm cleanup")) { destination = .turnData }
                    .disabled(!registered || actor == nil)
                Text(t("原任务、会话与轮次身份保留。相关任务摘要副本若需清理，会单独列明。跨轮次、共享或在途工作会阻挡清理；临时预览进度有独立出口。", "Original Task, conversation and Turn identities remain. Any related Task digest copy to clear is shown separately. Cross Turn, shared or active work blocks cleanup; transient preview progress has its own exit."))
            }
        } else if NativeResultDataWire.catalog(module) {
            Section(t("本人选定成果资料", "My selected result data")) {
                Button(t("选择一个成果，核对全部版本与事件并确认清理", "Select one result, review every revision and event, and confirm cleanup")) { destination = .resultData }
                    .disabled(!registered || actor == nil)
                Text(t("原会话、任务、行程与显式记忆保留。跨成果、共享、混合副本或在途工作会阻挡清理；本出口临时进度可独立选择清理。", "Original conversations, tasks, Trips and explicit Memory remain. Cross-result, shared, mixed-copy or active-work dependencies block cleanup; transient progress has its own explicit cleanup selection."))
            }
        } else if NativeConversationDataWire.catalog(module) {
            Section(t("本人会话敏感资料", "My conversation's sensitive data")) {
                Button(t("选择本人会话或线程，核对完整关系并确认擦除", "Select my conversation or thread, review the complete graph and confirm erasure")) { destination = .conversationData }
                    .disabled(!registered || actor == nil)
                Text(t("已确认 Trip 与原显式 Memory 保留。存在共享、跨范围或在途工作时拒绝本次擦除；本出口预览进度也可独立选择清理。", "Confirmed Trips and original explicit Memory remain. Shared relations, cross-scope references and active work block this erasure. This exit's preview progress can be selected for separate cleanup."))
            }
        } else if module.deleteHandler == "memory" {
            Section { Button(t("在原界面选择记忆并确认完整派生范围", "Select Memory and confirm its whole derived scope in the original screen")) { destination = .memory } }.disabled(!registered || actor == nil)
        } else if module.deleteHandler == "trip" {
            tripSelection
        } else if module.deleteHandler != nil {
            Section(t("模块删除", "Module deletion")) {
                if module.selection == "case" { caseSelection }
                if module.id == "guide", module.exportHandler == nil { guideSelection }
                Toggle(t("我已核对并明确选择上列删除范围", "I reviewed and explicitly selected the deletion scope above"), isOn: $ownerConfirmed)
                Button(t("删除此所选范围…", "Delete this selected scope…"), role: .destructive) { confirmDelete = true }
                    .disabled(!ownerConfirmed || !registered || store.busy || store.pending != nil || actor == nil || !canDelete)
            }
        } else { Section(t("删除缺项", "Deletion unavailable")) { Text(NativeDataCoverageCopy.missing(module.id, chinese: chinese)) } }
        if module.id == "case" || module.id == "brief" {
            Text(t("导出文件包括本账户该模块的全部已声明自有记录；删除则仅影响所选服务请求及其原预览／版本。附件不可用。", "The export covers this account’s declared owned records for the module. Deletion affects only the selected service request and its original preview/version. Attachments are unavailable."))
        }
        }
    }

    @ViewBuilder private var caseSelection: some View {
        Button(t("读取自己的服务请求", "Read your service requests")) { selectedCase = nil; ownerConfirmed = false; run { await loadCases() } }
        TimelineView(.periodic(from: .now, by: 1)) { _ in
            ForEach(cases.visible(actor)) { item in
                Button { selectedCase = item; ownerConfirmed = false; run { await loadBrief(item) } } label: {
                    HStack { Text(item.problem); if selectedCase == item { Image(systemName: "checkmark") } }
                }
            }
        }
        if cases.hasMore { Button(t("明确读取下一页请求", "Read the next request page explicitly")) { selectedCase = nil; run { await loadCases(next: true) } } }
        if let selectedCase { Text(t("本次选择：", "Selected for this operation: ") + selectedCase.id + " · r\(selectedCase.grantRevision)").font(.caption) }
        if cases.unavailable { Text(t("服务请求不可读；没有选择或删除。", "Service requests are unreadable. Nothing was selected or deleted.")) }
        if module.id == "brief", selectedCase != nil, brief.cleanupBinding(actor?.scope) == nil {
            Text(t("该请求没有可用于清理的当前 Brief 绑定；不能猜测接收人或版本，也不能报告已删除。", "This request has no current Brief cleanup binding. Recipient/version cannot be guessed, and deletion cannot be claimed."))
        }
    }
    @ViewBuilder private var tripSelection: some View {
        Section(t("明确选择自己的行程", "Explicitly select your Trip")) {
            Button(t("读取行程状态列表", "Read Trip states")) { run { await lifecycle.load(NativeTripLifecycleClient(session: session)) } }
            TimelineView(.periodic(from: .now, by: 1)) { _ in
                if lifecycle.visible(actor?.scope) != nil {
                    ForEach(lifecycle.trips.filter { module.id != "archive" || $0.state == .archived }) { trip in
                        Button(trip.title + " · v\(trip.headVersion)") {
                            guard let actor, lifecycle.visible(actor.scope) != nil,
                                  lifecycle.trips.contains(trip) else { return }
                            destination = .trip(.init(scope: actor.scope, tripID: trip.id, headVersion: trip.headVersion))
                        }
                    }
                    if lifecycle.nextTripID != nil { Button(t("明确读取下一页行程", "Read the next Trip page explicitly")) { run { await lifecycle.load(NativeTripLifecycleClient(session: session), next: true) } } }
                }
            }
            Text(t("原界面会显示该行程及独占关联聊天的精确预览；必须再次明确确认。归档本身不是删除。", "The original screen shows the exact preview for this Trip and its exclusively linked chats and requires explicit confirmation again. Archiving is not deletion."))
        }.disabled(!registered || actor == nil || store.busy)
    }
    @ViewBuilder private var guideSelection: some View {
        Button(t("明确选择行程中的已有地点引用", "Explicitly choose an existing place reference in your Trip")) { placePicker = true }.disabled(actor == nil)
        if let guideLabel { Text(guideLabel) }
        if let guide {
            Picker(t("讲解选择", "Guide selection"), selection: Binding(get: { guide.interest }, set: { value in
                self.guide = .init(scope: guide.scope, canonicalPoiID: guide.canonicalPoiID, placeReferenceID: guide.placeReferenceID,
                                  tripID: guide.tripID, tripVersion: guide.tripVersion, locale: guide.locale, interest: value); ownerConfirmed = false
            })) { ForEach(NativePlaceGuideInterest.allCases, id: \.self) { Text(chinese ? $0.zh : $0.en).tag($0) } }
        }
    }
    private var validGuide: Bool { guide?.scope == actor?.scope && guide?.valid == true && ProcessInfo.processInfo.systemUptime < guideDeadline }
    private var canDelete: Bool {
        if module.id == "guide" { return validGuide }
        if module.id == "case" { return selectedCase.map { cases.visible(actor).contains($0) } ?? false }
        if module.id == "brief" { return selectedCase.map { cases.visible(actor).contains($0) } == true && brief.cleanupBinding(actor?.scope) != nil }
        return ["ugc", "safety", "publication"].contains(module.id)
    }
    private var scopeDescription: String {
        if module.id == "guide" { return t("仅处理你选择的行程地点、语言与讲解兴趣对应的进度和安全元数据。原任务历史、事实正文和行程本身仍分别管理。", "Handles progress and safe metadata only for the selected Trip/place/language/Guide interest. Original task history, fact content and the Trip remain separately managed.") }
        if ["ugc", "safety", "publication"].contains(module.id) { return t("本次选择整个“", "This operation selects the whole “") + NativeDataCoverageCopy.title(module.id, chinese: chinese) + t("”模块中本账户的已声明自有记录；其他模块、其他用户正文和已确认行程不在此范围。", "” module’s declared owned records for this account. Other modules, other users’ content and confirmed Trips are outside this scope.") }
        return t("只执行原模块已实现的范围。对象由当前账户的真实列表选择，原权限、版本、预览和确认继续生效。", "Executes only the scope implemented by the original module. Objects are selected from current account lists; original authority, version, preview and confirmation checks remain in force.")
    }
    private func loadCases(next: Bool = false) async {
        guard let actor else { return }
        await cases.load(actor: actor, next: next, current: { self.actor }, request: { try await session.serviceCaseRequest(body: $0) })
    }
    private func loadBrief(_ item: NativeDataCoverageCase) async {
        guard module.id == "brief", let actor, selectedCase == item else { return }
        brief.bind(actor.scope)
        await brief.loadOwnerState(actor: actor.scope, caseID: item.id, current: { self.actor?.scope }, request: { try await session.travelerBriefRequest(body: $0, actor: actor.scope) })
    }
    private func perform(_ action: NativeDataCoverageAction) async {
        guard let actor, registered, ownerConfirmed, action == .export || canDelete else { return }
        do {
            let bytes: Data, id: String, tripID: String?
            if module.id == "guide" {
                guard validGuide, let guide else { throw NativeDataError.staleSessionResponse }
                id = UUID().uuidString.lowercased(); tripID = guide.tripID
                bytes = try guide.command(action == .export ? "export" : "forget", extra: action == .delete ? ["operationId": id] : [:])
            } else if action == .export {
                id = UUID().uuidString.lowercased(); tripID = nil
                bytes = try NativeCommunityWire.bytes(["case", "brief", "notifications", "lifecycle"].contains(module.id) ? ["action": "export", "requestId": id, "confirmed": true] : ["action": "export"])
            } else {
                tripID = nil
                switch module.id {
                case "ugc": let c = try NativeCommunityCommand.delete(); bytes = c.body; id = c.operationID
                case "safety": let c = try NativeCommunitySafetyCommand.delete(); bytes = c.body; id = c.operationID
                case "publication": let c = try NativeExperienceCommand.delete(); bytes = c.body; id = c.operationID
                case "case":
                    guard let selectedCase, cases.visible(actor).contains(selectedCase) else { throw NativeDataError.staleSessionResponse }
                    id = UUID().uuidString.lowercased()
                    bytes = try NativeCommunityWire.bytes(["action": "delete", "operationId": id, "caseId": selectedCase.id, "grantRevision": selectedCase.grantRevision, "confirmed": true])
                    try NativeServiceOperationCommand(body: bytes).validate()
                case "brief":
                    guard let selectedCase, cases.visible(actor).contains(selectedCase), let (binding, revision) = brief.cleanupBinding(actor.scope),
                          binding.caseID == selectedCase.id, binding.grantRevision == selectedCase.grantRevision, let recipient = binding.recipientID else { throw NativeDataError.staleSessionResponse }
                    let c = try NativeTravelerBriefCommand(cleanup: "delete", caseID: binding.caseID, recipientID: recipient, grantRevision: binding.grantRevision, revision: revision)
                    bytes = c.body; id = c.operationID
                default: throw NativeDataError.invalidResponse
                }
            }
            let command = try NativeDataCoverageCommand(module: module, actor: actor, operationID: id, action: action, tripID: tripID, commandBytes: bytes)
            ownerConfirmed = false
            let selection = guide.map { $0.tripID + " / " + $0.placeReferenceID + " / " + $0.locale + " / " + $0.interest.rawValue } ?? selectedCase?.id ?? scopeDescription
            await store.perform(command, selection: selection, guide: guide, client: client)
        } catch { self.error = true }
    }
    private func clearSelection() { ownerConfirmed = false; confirmDelete = false; guide = nil; guideLabel = nil; guideDeadline = 0; cases.clear(); selectedCase = nil; brief.bind(nil); lifecycle.suspend() }
    private func run(_ operation: @escaping @MainActor () async -> Void) { actionTask?.cancel(); actionTask = Task { await operation() } }
}
