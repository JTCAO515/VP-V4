import SwiftUI

struct NativeExperienceView: View {
    let access: NativeExperienceAccess
    var initialSubmissionID: String? = nil
    var savedOnly = false
    var isActive = true
    @Environment(AppSettings.self) private var settings
    @Environment(\.scenePhase) private var phase
    @State private var store = NativeExperienceStore()
    @State private var collection = "list"
    @State private var search = ""
    @State private var action: Task<Void, Never>?
    @State private var confirmation: Confirmation?
    @State private var place: PlaceSelection?
    private var actor: NativeCommunitySafetyActor? { isActive && phase == .active ? access.current() : nil }
    private var chinese: Bool { settings.selectedLocale == .zh }
    private func t(_ zh: String, _ en: String) -> String { chinese ? zh : en }
    private struct PlaceSelection: Identifiable {
        let id = UUID(); let experience: NativeExperience; let actor: NativeCommunitySafetyActor
    }
    private enum Confirmation: Identifiable {
        case request(NativeExperiencePreview), withdraw(NativeExperiencePublication), delete, abandon
        var id: String { switch self { case .request(let p): "request-" + p.object.id; case .withdraw(let p): "withdraw-" + p.id; case .delete: "delete"; case .abandon: "abandon" } }
    }
    var body: some View {
        Form {
            Section {
                Text(t("受控旅行体验；只向当前获准的注册读者展示。公众发布未启用，体验不会变为事实。", "Controlled travel experiences for currently qualified registered readers. Public publication is disabled; experiences do not become facts."))
                    .font(.footnote)
                if actor == nil { Text(t("请登录有效账号。", "Sign in with an active account.")) }
                if store.busy || store.window.busy { ProgressView() }
                if let notice = store.notice ?? store.window.notice { Text(message(notice)).accessibilityIdentifier("experience.notice") }
                Button(t("重新核对并刷新", "Requalify and refresh")) { hide(); run { actor in await reload(actor) } }
                    .disabled(actor == nil || store.busy || store.window.busy).accessibilityIdentifier("experience.refresh")
            }
            if initialSubmissionID == nil && !savedOnly {
                Section {
                    Picker(t("查看范围", "Collection"), selection: $collection) {
                        Text(t("当前体验", "Current experiences")).tag("list")
                        Text(t("自己的发布申请", "Your publication requests")).tag("mine")
                        Text(t("保存的体验引用", "Saved experience references")).tag("saved")
                    }
                    if collection == "list" {
                        TextField(t("查找当前可读体验", "Search currently readable experiences"), text: $search)
                            .onChange(of: search) { _, _ in hide() }
                        Button(t("明确搜索", "Search")) { run { actor in await page(actor) } }
                            .disabled(actor == nil || store.busy || store.window.busy || search.utf16.count > 160)
                    }
                }
            }
            if let pending = store.pending { recovery(pending) }
            TimelineView(.periodic(from: .now, by: 1)) { _ in
                if let outcome = store.visible(current: actor) { content(outcome) }
                else if !store.busy && !store.window.busy { Text(t("当前内容不可用或已过期；请重新读取。", "Current content is unavailable or expired. Reread it.")) }
            }
            Section(t("此模块资料", "This module’s data")) {
                Text(t("保存只保留体验引用，不保存正文、读权限，也不加入行程。失效后显示不可用，不会自动删除你已确认的行程项目。", "Save retains an experience reference, without its body or read permission, and adds nothing to a Trip. An invalidated reference becomes unavailable; your confirmed Trip items are preserved."))
                    .font(.footnote)
                Button(t("导出此模块资料", "Export this module’s data")) { run { actor in await store.export(current: { self.actor }, request: { try await access.request($0, actor) }) } }
                    .disabled(!eligible).accessibilityIdentifier("experience.export")
                TimelineView(.periodic(from: .now, by: 1)) { _ in
                    if let url = store.exportURL(current: actor) { ShareLink(item: url) { Label(t("分享私有导出文件", "Share private export"), systemImage: "square.and.arrow.up") } }
                }
                Text(t("导出／删除只覆盖发布模块的本人声明、申请、本人审核说明、保存引用、资格与操作审计；每类超过100条会失败。投稿与安全模块有各自出口。", "Export and deletion cover your publication declarations, requests, review notes you wrote, saved references, qualifications and operation audit in this module. More than 100 rows per category fails explicitly. Submission and safety modules have separate exits."))
                    .font(.footnote)
                Button(t("删除本模块个人资料", "Delete personal data in this module"), role: .destructive) { confirmation = .delete }
                    .disabled(!eligible || store.pending != nil).accessibilityIdentifier("experience.delete")
                NavigationLink(t("投稿撤回与删除", "Submission withdrawal and deletion")) { NativeCommunitySubmissionView() }
                NavigationLink(t("举报、屏蔽和申诉", "Reports, blocks and appeals")) { NativeCommunitySafetyView() }
            }
        }.navigationTitle(t("旅行体验", "Travel experiences"))
            .task(id: actor) {
                hide(); store.bind(actor)
                guard let actor else { return }
                store.restore(actor) { try access.read(actor) }
                await reload(actor)
            }
            .task(id: actor) {
                while !Task.isCancelled, actor != nil {
                    store.tick(current: actor)
                    do { try await Task.sleep(for: .seconds(1)) } catch { return }
                }
            }
            .onChange(of: collection) { _, _ in hide(); run { actor in await page(actor) } }
            .onChange(of: phase) { _, value in if value != .active { hide() } }
            .onDisappear { hide() }
            .sheet(item: $confirmation) { confirmationView($0) }
            .sheet(item: $place, onDismiss: { hide(); run { actor in await page(actor) } }) { value in
                NavigationStack {
                    ScrollView {
                        if actor == value.actor {
                            NativeExperiencePlaceActionsView(experience: value.experience, actor: value.actor, access: access,
                                                             session: settings.nativeSession, chinese: chinese).padding()
                        } else { Text(t("登录或资格已变化；请重新打开。", "Identity or eligibility changed. Reopen this reference.")) }
                    }.navigationTitle(t("原地点操作", "Original place actions"))
                }
            }
    }
    private var eligible: Bool { actor != nil && store.storageReady && !store.busy && !store.window.busy }
    private func run(_ work: @escaping (NativeCommunitySafetyActor) async -> Void) {
        guard let actor, !store.busy, !store.window.busy else { return }
        action?.cancel(); action = Task { await work(actor) }
    }
    private func hide() { action?.cancel(); action = nil; confirmation = nil; place = nil; store.suspend() }
    private func reload(_ actor: NativeCommunitySafetyActor) async {
        store.restore(actor) { try access.read(actor) }
        if let initialSubmissionID { await load(["action": "preview", "submissionId": initialSubmissionID], actor: actor) }
        else { await page(actor) }
    }
    private func page(_ actor: NativeCommunitySafetyActor, cursor: String? = nil) async {
        var v: [String: Any] = ["action": savedOnly ? "saved" : collection, "cursor": cursor as Any? ?? NSNull()]
        if v["action"] as? String == "list" { v["query"] = search }
        await load(v, actor: actor)
    }
    private func load(_ value: [String: Any], actor: NativeCommunitySafetyActor) async {
        await store.load(value, current: { self.actor }, request: { try await access.request($0, actor) })
    }
    private func perform(_ command: NativeExperienceCommand, actor: NativeCommunitySafetyActor) async {
        await store.perform(command, current: { self.actor }, read: { try access.read(actor) }, retain: { try access.retain($0, actor) },
                            complete: { try access.complete($0, actor) }, request: { try await access.request($0, actor) })
    }
    private func recover(_ actor: NativeCommunitySafetyActor, abandon: Bool = false, retry: Bool = false) async {
        await store.recover(abandon: abandon, retry: retry, current: { self.actor }, complete: { try access.complete($0, actor) }, request: { try await access.request($0, actor) })
    }
    @ViewBuilder private func content(_ outcome: NativeExperienceOutcome) -> some View {
        switch outcome {
        case .preview(let preview): previewContent(preview)
        case .detail(let experience): experienceContent(experience)
        case .reference(let reference): referenceContent(reference)
        case .publication(let publication): publicationContent(publication)
        case .list(let values, let cursor, _):
            Section(t("当前可读体验", "Currently readable experiences")) {
                ForEach(values) { value in Button(value.title) { run { actor in await load(["action": "detail", "publicationId": value.id], actor: actor) } } }
                if values.isEmpty { Text(t("此页暂无可读体验。", "No readable experiences on this page.")) }
                next(cursor)
            }
        case .saved(let values, let cursor, _):
            Section(t("体验引用", "Experience references")) {
                ForEach(values) { value in Button(value.experience?.title ?? t("引用当前不可用", "Reference currently unavailable")) {
                    run { actor in await load(["action": "reference", "referenceId": value.id], actor: actor) }
                } }
                if values.isEmpty { Text(t("此页没有保存的体验引用。", "No saved experience references on this page.")) }
                next(cursor)
            }
        case .publications(let values, let cursor, _):
            Section(t("本人发布申请", "Your publication requests")) {
                ForEach(values) { publicationContent($0) }
                next(cursor)
            }
        default: EmptyView()
        }
    }
    @ViewBuilder private func next(_ cursor: String?) -> some View {
        if let cursor { Button(t("下一页（重新核权限）", "Next page (requalify)")) { run { actor in await page(actor, cursor: cursor) } } }
    }
    private func previewContent(_ preview: NativeExperiencePreview) -> some View {
        Section(t("发布申请预览", "Publication request preview")) {
            Text(preview.object.title).font(.headline); Text(preview.object.content)
            Text(t("这是内部审核来源的当前预览，尚未成为可读体验。", "This is a current preview of an internally reviewed source. It has not become a readable experience."))
            Text(t("作者利益自述：", "Author-reported interests: ") + (preview.object.benefit ?? t("未提供", "Not provided")))
            Text(t("当前来源版权：unknown。你须明确声明这是自己的文字，随后由异人独立审核；该审核不保证第三方版权许可。", "Current source copyright: unknown. You must explicitly declare that the text is yours, followed by independent review. That review does not guarantee third-party copyright clearance."))
                .font(.footnote)
            Button(t("预览明确声明与受控分享范围", "Review declaration and controlled sharing scope")) { confirmation = .request(preview) }
                .disabled(!eligible || store.pending != nil).accessibilityIdentifier("experience.request.preview")
        }
    }
    private func experienceContent(_ experience: NativeExperience) -> some View {
        Section {
            Text(experience.title).font(.headline); Text(experience.content).textSelection(.enabled)
            Text(t("可信作者身份来源：", "Trusted author affiliation: ") + disclosure(experience.authorDisclosure))
            Text(t("可信审核者身份来源：", "Trusted reviewer affiliation: ") + disclosure(experience.reviewerDisclosure ?? "unknown"))
            Text(t("作者自述利益关系：", "Author-reported interests: ") + (experience.benefit ?? t("未提供", "Not provided")))
            Text(t("来源：用户体验／求助；作者声明拥有文字，已记录独立审核，仅供受控体验显示。并非事实或第三方版权保证，供应商费用未知。", "Source: user experience/help. Author-declared own text with a recorded independent review, limited to controlled experience display. It is not a fact or a third-party copyright guarantee; provider costs are unknown."))
                .font(.footnote)
            Button(t("保存体验引用", "Save experience reference")) { run { actor in if let command = try? NativeExperienceCommand.save(experience) { await perform(command, actor: actor) } } }
                .disabled(!eligible || store.pending != nil).accessibilityIdentifier("experience.save")
            if let association = experience.place {
                Text(association.label ?? t("关联地点名称不可用", "Linked place label unavailable"))
                Button(t("重新核体验后打开原地点动作", "Requalify experience and open original place actions")) { openPlace(experience) }
                    .disabled(!eligible).accessibilityIdentifier("experience.place.open")
            } else { Text(t("没有可核实的 canonical 地点关联；不能猜测地点或加入行程。", "No verifiable canonical place association. A place cannot be guessed or added to a Trip.")) }
            NavigationLink(t("举报／屏蔽此体验（重新核资格）", "Report / block this experience (requalify)")) {
                NativeCommunitySafetyView(initialObjectID: experience.submissionID).id(actor?.scope)
            }
        }
    }
    @ViewBuilder private func referenceContent(_ reference: NativeExperienceSaved) -> some View {
        Section(t("保存的引用", "Saved reference")) {
            if reference.experience == nil { Text(t("此引用当前不可用；不会从旧链接恢复正文。你的已确认行程仍保留。", "This reference is currently unavailable. Old links cannot restore its body. Your confirmed Trip is preserved.")) }
            if reference.state == "saved", let command = try? NativeExperienceCommand.unsave(reference) {
                Button(t("取消此准确引用", "Unsave this exact reference")) { run { actor in await perform(command, actor: actor) } }.disabled(!eligible || store.pending != nil)
            }
        }
        if let experience = reference.experience { experienceContent(experience) }
    }
    private func publicationContent(_ publication: NativeExperiencePublication) -> some View {
        Section {
            Text(publication.id).font(.caption); Text(publicationState(publication.state))
            if let note = publication.rightsNote { Text(note) }
            Text(t("审核申请不等于发布；公众始终关闭。发布动作由有资格的运营方执行。", "A review request is not publication. Public access stays disabled. Qualified operators perform publication."))
                .font(.footnote)
            if let command = try? NativeExperienceCommand.withdraw(publication) {
                Button(t("撤回此发布申请／体验", "Withdraw this publication request / experience"), role: .destructive) { confirmation = .withdraw(publication) }
                    .disabled(!eligible || store.pending != nil || !store.canPerform(command, current: actor))
            }
        }
    }
    private func openPlace(_ value: NativeExperience) {
        guard let bound = actor else { return }
        run { actor in
            await load(["action": "detail", "publicationId": value.id], actor: actor)
            guard actor == bound, self.actor == bound, !Task.isCancelled, case .detail(let current) = store.visible(current: bound),
                  current.id == value.id, current.submissionVersion == value.submissionVersion, current.safetyVersion == value.safetyVersion,
                  current.publicationVersion == value.publicationVersion, current.place == value.place, current.place != nil else { return }
            place = .init(experience: current, actor: bound)
        }
    }
    private func recovery(_ pending: NativeExperiencePending) -> some View {
        Section(t("未确认操作", "Unconfirmed operation")) {
            Text(t("网络中断不证明操作没执行。不会自动重试或恢复权限。", "An interrupted connection does not prove no write occurred. Retry and permission recovery are never automatic."))
            Button(t("读取原操作结果", "Read original operation result")) { run { actor in await recover(actor) } }.disabled(!eligible)
            if store.canRetry(current: actor) { Button(t("明确重试相同操作与字节", "Explicitly retry exact original bytes")) { run { actor in await recover(actor, retry: true) } }.disabled(!eligible) }
            Button(t("停止原操作并读取最终状态", "Stop original operation and read final state")) { confirmation = .abandon }.disabled(!eligible)
        }
    }
    private func confirmationView(_ value: Confirmation) -> some View {
        NavigationStack {
            Form {
                switch value {
                case .request(let preview):
                    Text(t("我声明预览文字由本人拥有，并明确同意供当前获准注册读者的受控体验展示。需要独立权利审核，公众不开放，也不授权检索或事实晋升。", "I declare that I own the previewed text and explicitly consent to controlled experience display for currently qualified registered readers. Independent rights review is required. Public access, retrieval and promotion to fact are not authorized."))
                    Button(t("明确声明并提交审核申请", "Declare and request independent review")) {
                        confirmation = nil
                        guard case .preview(let current) = store.visible(current: actor), current == preview,
                              let command = try? NativeExperienceCommand.request(preview) else { return }
                        run { actor in await perform(command, actor: actor) }
                    }.disabled(!eligible || store.pending != nil).accessibilityIdentifier("experience.request.confirm")
                case .withdraw(let publication):
                    Text(t("撤回此申请或已发布体验，旧链接与保存引用不得恢复内容；已确认行程不自动删除。", "Withdraw this request or published experience. Old links and saved references cannot restore content; confirmed Trip items are preserved."))
                    Button(t("确认撤回", "Confirm withdrawal"), role: .destructive) {
                        confirmation = nil; if let command = try? NativeExperienceCommand.withdraw(publication) { run { actor in await perform(command, actor: actor) } }
                    }.disabled(!eligible || store.pending != nil)
                case .delete:
                    Text(t("删除本发布模块的个人声明、本人审核说明、资格与保存引用，保留必要防重放和审计标记。涉及本人权利或资格的体验将失效。其他模块单独处理。", "Delete personal declarations, review notes you wrote, qualifications and saved references in this publication module. Necessary replay and audit markers remain. Dependent experiences are invalidated. Other modules are handled separately."))
                    Button(t("确认删除此模块资料", "Confirm deletion in this module"), role: .destructive) { confirmation = nil; if let command = try? NativeExperienceCommand.delete() { run { actor in await perform(command, actor: actor) } } }.disabled(!eligible || store.pending != nil)
                case .abandon:
                    Text(t("停止尚未提交的原操作；已提交的返回真实当前结果。这不是回滚承诺。", "Stop an uncommitted original operation. Committed work returns its actual current result. This does not promise rollback."))
                    Button(t("确认停止并读取", "Confirm stop and read")) { confirmation = nil; run { actor in await recover(actor, abandon: true) } }.disabled(!eligible)
                }
            }.navigationTitle(t("确认准确范围", "Confirm exact scope"))
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button(t("取消", "Cancel")) { confirmation = nil } } }
        }
    }
    private func disclosure(_ value: String) -> String {
        switch value { case "official": t("官方", "Official"); case "employee": t("员工", "Employee"); case "community_reviewer": t("社区审核者", "Community reviewer"); case "registered_user": t("注册用户", "Registered user"); default: t("unknown／未提供", "unknown / not provided") }
    }
    private func publicationState(_ value: String) -> String {
        switch value { case "pending_rights": t("独立权利审核待处理", "Independent rights review pending"); case "rights_approved": t("独立权利审核通过，尚未发布", "Rights review recorded, not published"); case "rights_rejected": t("权利审核拒绝", "Rights review rejected"); case "published": t("受控读者可读（公众关闭）", "Readable to controlled readers (public disabled)"); default: t("已结束或失效：", "Ended or invalidated: ") + value }
    }
    private func message(_ value: String) -> String {
        switch value { case "COMMITTED_REFRESH_REQUIRED": t("操作已确认；请重新读取当前结果。", "Operation acknowledged. Reread its current result."); case "MODULE_DELETED": t("本模块删除已确认。", "Deletion confirmed for this module."); case "EXPORT_READY": t("私有导出已准备，30秒内可分享。", "Private export ready to share within 30 seconds."); case "ABANDONED": t("原操作已停止。", "Original operation abandoned."); case "RECEIPT_ABSENT": t("读取时没有回执；仅可明确重试原字节。", "No receipt at this read. Only exact original bytes may be explicitly retried."); case "RECOVERY_REQUIRED": t("原操作结果未知，请先恢复读取。", "Original operation outcome unknown. Read its recovery result first."); case "STORAGE_UNAVAILABLE", "STORAGE_CLEANUP_REQUIRED": t("私有存储清理／恢复未完成，操作已暂停。", "Private storage cleanup or recovery incomplete. Actions are fenced."); default: t("当前不可用，请刷新核实。", "Currently unavailable. Refresh to verify.") }
    }
}
