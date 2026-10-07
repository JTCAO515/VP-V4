import SwiftUI

struct NativeVPTravelPaceView: View {
    let session: NativeSession
    let chinese: Bool
    let active: Bool
    let selection: NativeTravelIntakeSelection?
    let currentSelection: () -> NativeTravelIntakeSelection?
    let accepted: () async -> Void
    let linkedTripID: String?
    let onPendingChange: (NativeDataScope?, Bool) -> Void
    let artifactID: String?
    let artifactRevision: Int?
    @State private var store = NativeVPTravelPaceStore()
    @State private var result = NativeResultStore()
    @State private var refresh = UUID()
    @AccessibilityFocusState private var undoFocused: Bool
    @FocusState private var undoKeyboardFocused: Bool
    private func t(_ zh: String, _ en: String) -> String { chinese ? zh : en }
    private var scope: NativeDataScope? { active ? session.dataScope : nil }
    private var key: Key { .init(scope: scope, selection: selection, artifact: artifactID, revision: artifactRevision, refresh: refresh) }
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let toast = store.saved.toast, store.saved.scope == scope {
                HStack {
                    Text(t("已加入记忆", "Saved to memory"))
                    Spacer()
                    Button(t("撤销", "Undo")) { Task { await store.changeSaved("undo", using: session) } }
                        .disabled(store.saved.busy).focused($undoKeyboardFocused).accessibilityFocused($undoFocused)
                        .accessibilityIdentifier("assistant.pace.undo")
                }.accessibilityIdentifier("assistant.pace.saved")
                    .task(id: "\(toast.operationId)-\(undoFocused)-\(undoKeyboardFocused)-\(store.saved.busy)") {
                        guard !undoFocused, !undoKeyboardFocused, !store.saved.busy else { return }
                        do { try await Task.sleep(for: .seconds(4)) } catch { return }; store.saved.dismissToast(toast.operationId)
                    }
            }
            Text(t("旅行节奏 · 你可以纠正我", "Travel pace · You can correct me")).font(.headline)
            if scope == nil { Text(t("登录后读取自己的偏好；这里不会假装已认识你。", "Sign in to read your preference. No familiarity is assumed.")) }
            else {
                if let basis = store.current.basis, store.current.selection == currentSelection() {
                    Text(store.currentExplicitPace.map { t("当前需求明确采用：", "Explicit current requirements: ") + $0.label(chinese: chinese) }
                         ?? t("当前需求尚未明确节奏。已保存偏好不会自动成为本次输入。", "Current requirements have no explicit pace. Saved preference is not automatically current input."))
                        .accessibilityIdentifier("assistant.pace.current")
                    Text(t("来源：本次明确输入 · 需求修订 \(basis.intakeRevision)", "Source: explicit current input · Revision \(basis.intakeRevision)"))
                        .font(.caption)
                } else { Text(t("当前需求资格尚未确认；先打开或核对完整旅行需求。", "Current input is unqualified. Open or recheck complete travel requirements first.")) }
                if let snapshot = store.saved.snapshot, store.saved.scope == scope {
                    Text(savedStatus(snapshot)).accessibilityIdentifier("assistant.pace.longterm")
                    Text(t("账号长期选择只用于本机跨行程规划；不授权发给 AI，也不改已确认 Trip。", "The account preference is for local planning across Trips; it does not authorize AI transmission or change a confirmed Trip."))
                        .font(.footnote)
                    Picker(t("我希望…", "I prefer…"), selection: $store.choice) {
                        ForEach(NativeTravelPace.allCases, id: \.self) { Text($0.label(chinese: chinese)).tag($0) }
                    }.accessibilityIdentifier("assistant.pace.choice")
                    Button(t("这次按此节奏", "Use this pace for current requirements")) {
                        store.applyThisTime(using: session, chinese: chinese, selected: currentSelection, accepted: accepted)
                    }.disabled(!store.current.canSubmit || store.current.state == .submitting)
                        .accessibilityIdentifier("assistant.pace.this-time")
                    Toggle(t("明确记住，用于以后本机跨行程规划", "Remember explicitly for future local planning across Trips"), isOn: $store.consent)
                        .accessibilityIdentifier("assistant.pace.consent")
                    Button(t("以后记住这个节奏", "Remember this pace for future Trips")) { Task { await store.saveLongTerm(using: session) } }
                        .disabled(!store.consent || store.saved.busy || store.saved.pending != nil)
                        .accessibilityIdentifier("assistant.pace.remember")
                    if snapshot.state == "explicit" {
                        Button(t("暂停长期使用", "Pause saved pace use")) { Task { await store.changeSaved("pause", using: session) } }
                            .disabled(store.saved.busy || store.saved.pending != nil).accessibilityIdentifier("assistant.pace.pause")
                    }
                    if ["explicit", "paused"].contains(snapshot.state) {
                        Button(t("撤回长期偏好", "Withdraw saved pace"), role: .destructive) { Task { await store.changeSaved("revoke", using: session) } }
                            .disabled(store.saved.busy || store.saved.pending != nil).accessibilityIdentifier("assistant.pace.revoke")
                    }
                    if let linkedTripID {
                        Button(t("核对本机预览是否使用已保存节奏", "Check saved pace use in local Trip preview")) {
                            Task { await store.previewSavedForTrip(linkedTripID, using: session) }
                        }.disabled(snapshot.state != "explicit" || store.saved.busy)
                            .accessibilityIdentifier("assistant.pace.project")
                    }
                    if let projection = store.localProjection, snapshot.state == "explicit",
                       projection.sourceRevision == snapshot.revision, projection.sourceOperationId == snapshot.operationId {
                        Text(t("真实本机预览使用：", "Actual local preview uses: ") + (projection.travelPace?.label(chinese: chinese) ?? "") + " · v\(snapshot.revision)")
                            .accessibilityIdentifier("assistant.pace.projected")
                        Text(t("这不是后台比较成果；保存偏好仅可影响预览，不可直接写入 Trip 草稿。", "This is not a background result. Saved preference shapes preview only and cannot be promoted directly into a Trip draft."))
                            .font(.footnote)
                    }
                    Text(t("长期操作不改本次已确认需求，也不会把旧成果改写成新成果。", "Long-term actions do not change confirmed current input or turn an old result into a new result."))
                        .font(.footnote)
                } else { Text(t("长期偏好暂未载入；没有已确认的使用依据。", "Saved preference has not loaded; no qualified usage basis is claimed.")) }
                if store.saved.pending != nil {
                    Button(t("重试同一次偏好修改", "Retry the same preference change")) { Task { await store.saved.retry(using: session) } }
                        .accessibilityIdentifier("assistant.pace.retry")
                }
                if let notice = store.savedNotice {
                    Text(notice == "undone" ? t("已撤销本次记忆变更", "This memory change was undone")
                         : notice == "pause" ? t("已暂停长期偏好使用", "Saved preference use is paused")
                         : notice == "revoke" ? t("已撤回长期偏好", "Saved preference is withdrawn")
                         : notice == "conflict" ? t("偏好已变化，请刷新核对；不会覆盖后续版本。", "The preference changed. Refresh; later versions will not be overwritten.")
                         : t("请核对当前状态；操作未确认时不会声称保存成功。", "Check current state. Unconfirmed operations are not reported as saved."))
                        .accessibilityIdentifier("assistant.pace.notice")
                }
                if store.saveReadbackChanged { Text(t("保存后读回已变化；请刷新核对当前版本。", "Readback changed after saving. Recheck the current version.")) }
                if store.current.state == .needsReview { Text(t("本次需求更正未确认，须回到完整需求重新核对；不会自动重试。", "Current-input correction was not confirmed. Recheck the full input; no automatic retry.")) }
                if artifactID != nil {
                    Text(t("已选成果的实际记录依据", "Recorded basis for the selected result")).font(.subheadline)
                    TimelineView(.periodic(from: .now, by: 1)) { _ in
                        if let record = result.visibleResult(scope) { NativeResultBasisDisclosure(result: record, chinese: chinese) }
                        else { Text(t("成果依据未通过当前资格读取，不能说明使用了本次或已保存节奏。", "The selected result's basis is unqualified; current or saved pace use cannot be claimed.")) }
                    }
                }
                Text(t("当前仅支持旅行节奏。其他长期记忆类型尚未接入原生保存/更新，不能从对话关键词自动保存。", "Only travel pace is supported here. Other long-term memory types are not connected to native save/update and are not saved from keywords."))
                    .font(.footnote)
                Button(t("刷新偏好与资格", "Refresh preference and qualification")) { refresh = UUID() }
                    .accessibilityIdentifier("assistant.pace.refresh")
            }
        }.padding(14).background(Color.vpSurface, in: RoundedRectangle(cornerRadius: 16))
        .task(id: key) {
            guard active else { store.leave(); result.clear(); return }
            await store.load(using: session, selected: currentSelection)
            if let artifactID, let artifactRevision, let current = scope {
                await result.loadExact(scope: current, artifactID: artifactID, revision: artifactRevision) {
                    guard scope == current else { throw NativeDataError.staleSessionResponse }
                    return try await session.resultRequest(artifactID: artifactID, revision: artifactRevision)
                }
            } else { result.clear() }
        }
        .onChange(of: session.resultDataErasure?.id) { _, _ in
            guard let erased = session.resultDataErasure, (try? session.communitySafetyActor()) == erased.actor else { return }
            result.applyResultErasure(erased)
        }
        .onChange(of: session.currentProfileDataErasure?.id) { _, _ in store.applyProfileErasure(session.currentProfileDataErasure) }
        .onChange(of: session.dataScope) { _, value in store.bind(scope: value, selection: value == nil ? nil : currentSelection()); result.clear() }
        .onChange(of: pending, initial: true) { _, value in onPendingChange(store.saved.scope ?? session.dataScope, value) }
        .onChange(of: active) { _, value in if !value { store.leave(); result.clear() } }
        .onDisappear { store.leave(); result.clear() }
    }
    private var pending: Bool { store.saved.busy || store.saved.pending != nil || store.current.state == .submitting }
    private func savedStatus(_ value: NativeTravelPaceSnapshot) -> String {
        switch value.state {
        case "explicit": t("已明确长期保存：", "Explicitly saved: ") + (value.travelPace?.label(chinese: chinese) ?? "") + " · v\(value.revision)"
        case "paused": t("长期偏好已暂停，不作为已保存默认使用。", "Saved pace is paused and not used as a saved default.")
        case "revoked": t("长期偏好已撤回，不使用旧记录。", "Saved pace is withdrawn; the old record is not used.")
        default: t("还没有明确保存节奏；选择器不是已保存偏好。", "No explicitly saved pace. The picker is not a saved preference.")
        }
    }
    private struct Key: Equatable { let scope: NativeDataScope?; let selection: NativeTravelIntakeSelection?; let artifact: String?; let revision: Int?; let refresh: UUID }
}
