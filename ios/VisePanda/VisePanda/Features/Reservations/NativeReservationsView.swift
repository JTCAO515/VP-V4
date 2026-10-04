import SwiftUI

struct NativeReservationsView: View {
    let session: NativeSession
    let chinese: Bool
    let active: Bool
    @Environment(\.scenePhase) private var phase
    @Environment(\.dismiss) private var dismiss
    @State private var store = NativeReservationStore()
    @State private var fields = NativeReservationFields()
    @State private var source = NativeReservationSource()
    @State private var target: NativeReservationTarget?
    @State private var confirmed = false
    @State private var showMaterials = false
    private var actor: NativeDataScope? { active && phase == .active ? session.dataScope : nil }
    private func t(_ zh: String, _ en: String) -> String { chinese ? zh : en }
    private func request(_ path: String, _ method: String, _ body: Data?) async throws -> Data {
        try await session.tripRequest(path: path, method: method, body: body)
    }
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(t("保存自己报告的订单引用。供应商状态、付款、可退款性和入住／乘坐资格均未核验；这不会修改行程。", "Save an order reference you report. Supplier status, payment, refunds and eligibility remain unverified. This does not change your Trip."))
                    Text(t("可信材料确认与供应商核验暂不支持。本机 OCR 只供选字段校正，不会提高证据等级。", "Trusted artifact confirmation and provider verification are unsupported. Device OCR only helps you select and correct fields; it does not upgrade evidence."))
                        .font(.footnote)
                    Button(t("跳过，稍后再填", "Skip and report later")) { dismiss() }
                }
                if actor == nil { Text(t("请登录后读取自己的行程。", "Sign in to read your Trips.")) }
                else {
                    tripSection
                    if store.pending != nil { recoverySection }
                    else if store.selected != nil {
                        editorSection
                        previewSection
                    }
                    referencesSection
                    if let notice = store.notice { Text(message(notice)).accessibilityIdentifier("reservations.notice") }
                    if store.busy { ProgressView().accessibilityLabel(t("正在核对订单", "Checking reservation")) }
                }
            }
            .navigationTitle(t("订单引用", "Reservation references"))
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(t("关闭", "Close")) { dismiss() } } }
        }
        .task(id: actor) {
            clearEditor(); store.reset(actor)
            guard actor != nil else { return }
            await store.loadTrips(current: { actor }, request: request)
            if store.pending != nil { await store.recover(retryOriginal: false, current: { actor }, request: request) }
        }
        .onChange(of: actor) { _, value in store.reset(value); clearEditor(); showMaterials = false }
        .onDisappear { store.hide(); clearEditor() }
        .onChange(of: fields) { _, _ in store.invalidatePreview(); confirmed = false }
        .onChange(of: source) { _, _ in store.invalidatePreview(); confirmed = false }
        .onChange(of: store.pending) { old, new in if old != nil, new == nil { clearEditor() } }
        .sheet(isPresented: $showMaterials) {
            NativeReservationMaterialView(session: session, chinese: chinese, active: active) { values, digest, locator in
                guard actor != nil, store.pending == nil else { return }
                for (field, value) in values { apply(field, value) }
                source = .init(localContentHash: digest, locator: locator)
                store.invalidatePreview(); confirmed = false
            }
        }
    }
    private var tripSection: some View {
        Section(t("选择自己可读的行程", "Select a readable Trip")) {
            Button(t("重新读取行程列表", "Reload Trip list")) {
                Task { clearEditor(); await store.loadTrips(current: { actor }, request: request) }
            }.disabled(store.busy).accessibilityIdentifier("reservations.trips.reload")
            ForEach(store.trips) { trip in
                Button {
                    Task { clearEditor(); await store.select(trip, current: { actor }, request: request) }
                } label: { Label(trip.title, systemImage: store.selected?.id == trip.id ? "checkmark.circle.fill" : "circle") }
                .disabled(store.busy || (store.pending != nil && store.pending?.tripId != trip.id))
                .accessibilityIdentifier("reservations.trip." + trip.id)
            }
            if let trip = store.selected { Text(t("当前行程：", "Current Trip: ") + trip.title).font(.headline) }
            if store.trips.isEmpty, !store.busy { Text(t("当前未读到可选行程；读取失败不能证明行程为空。", "No selectable Trip was read. Read failure does not prove an empty collection.")) }
        }
    }
    private var recoverySection: some View {
        Section(t("原操作结果待核对", "Original operation needs reconciliation")) {
            Text(t("原请求已保存在本机。请先读取回执；结果未知期间不能编辑字段或创建新操作。", "The original request is saved on this device. Read its receipt first. Fields and new operations remain frozen while its outcome is unknown."))
            if let pending = store.pending {
                Text(t("原行程：", "Original Trip: ") + pending.tripId).font(.caption).textSelection(.enabled)
            }
            Button(t("读取原操作回执", "Read original operation receipt")) { Task { await store.recover(retryOriginal: false, current: { actor }, request: request) } }
                .disabled(store.busy).accessibilityIdentifier("reservations.recovery.read")
            Button(t("先读取，再明确重试原请求", "Read first, then explicitly retry original request")) { Task { await store.recover(retryOriginal: true, current: { actor }, request: request) } }
                .disabled(store.busy).accessibilityIdentifier("reservations.recovery.retry")
            Text(t("退出账号会删除此设备恢复记录。服务器已有引用按账号／行程生命周期处理；退出不会撤销供应商订单。", "Signing out removes this device recovery record. Server references follow account/Trip lifecycle. Signing out does not cancel a supplier order.")).font(.footnote)
        }
    }
    private var editorSection: some View {
        Section(t("校正所选字段", "Correct selected fields")) {
            if let target { Text(t("修订已选引用：", "Amend selected reference: ") + target.referenceId).font(.caption) }
            Button(t("开始新的手动报告", "Start a new manual report")) { clearEditor() }.disabled(store.busy)
            Button(t("从本机已保留截图选字段", "Select fields from retained device screenshots")) { showMaterials = true }
                .disabled(store.busy).accessibilityIdentifier("reservations.materials")
            Picker(t("订单类型", "Type"), selection: $fields.kind) {
                Text(t("住宿", "Lodging")).tag("lodging"); Text(t("交通", "Transport")).tag("transport")
                Text(t("活动", "Activity")).tag("activity"); Text(t("其他", "Other")).tag("other")
            }
            Picker(t("报告来源", "Reported supplier"), selection: $fields.supplier) {
                Text("Booking").tag("booking"); Text("Trip.com").tag("trip")
                Text(t("官网", "Official site")).tag("official"); Text(t("其他", "Other")).tag("other")
            }
            TextField(t("标题（必填）", "Title (required)"), text: $fields.title).accessibilityIdentifier("reservations.title")
            optionalField(t("订单号（可跳过）", "External reference (optional)"), $fields.externalReference)
            optionalField(t("开始日期时间，例如 2026-10-04T15:00:00+08:00", "Start, e.g. 2026-10-04T15:00:00+08:00"), $fields.startsAt)
            optionalField(t("结束日期时间（可跳过）", "End date/time (optional)"), $fields.endsAt)
            optionalField(t("时区，例如 Asia/Shanghai（可跳过）", "Time zone, e.g. Asia/Shanghai (optional)"), $fields.timeZone)
            optionalField(t("地址（可跳过）", "Address (optional)"), $fields.address)
            optionalField(t("条款／取消条件原文（可跳过）", "Terms/cancellation conditions (optional)"), $fields.terms)
            Picker(t("用户报告的外部状态", "External status you report"), selection: $fields.status) {
                Text(t("未知", "Unknown")).tag("unknown"); Text(t("已预订", "Reserved")).tag("reserved")
                Text(t("已在外部改签", "Amended externally")).tag("amended"); Text(t("已在外部取消", "Cancelled externally")).tag("cancelled")
            }
            Text(t("报告改签／取消只记录你已在外部发生的事件。实际供应商操作请在其官方渠道完成。", "Reporting amendment/cancellation records an event you say happened externally. Complete supplier actions through their official channel.")).font(.footnote)
            optionalField(t("本地原文定位（可跳过）", "Local original-text locator (optional)"), Binding(get: { source.locator }, set: { source = .init(localMaterialId: source.localMaterialId, localContentHash: source.localContentHash, locator: $0) }))
            if source.localContentHash != nil { Text(t("仅选定字段和定位将送往服务器；照片和完整 OCR 原文保留在本机。", "Only selected fields and locator are sent. Photos and full OCR text stay on-device.")).font(.footnote) }
            Button(t("读取服务器预览", "Read server preview")) {
                Task { confirmed = false; await store.makePreview(fields: fields, source: source, reference: target, current: { actor }, request: request) }
            }.disabled(store.busy || !fields.valid || !source.valid || !store.recoveryChecked)
                .accessibilityIdentifier("reservations.preview")
        }.disabled(store.busy)
    }
    @ViewBuilder private var previewSection: some View {
        if let preview = store.preview {
            Section(t("服务器预览", "Server preview")) {
                Text(relation(preview.relation)).font(.headline)
                ForEach(preview.fields) { field in
                    VStack(alignment: .leading) {
                        Text(label(field.field)).font(.headline)
                        Text(t("原值：", "Before: ") + (field.before ?? t("未填", "Unspecified")))
                        Text(t("报告值：", "Reported: ") + (field.after ?? t("未填", "Unspecified")))
                    }
                }
                if let match = preview.matches.first, preview.matches.count == 1, match.referenceId != store.previewCommand?.referenceId {
                    Button(t("明确选择该已有引用后重新预览", "Select this existing reference and preview again")) {
                        target = .init(referenceId: match.referenceId, revision: match.revision)
                        store.invalidatePreview(); confirmed = false
                    }
                    Text(t("已有相同引用，不能作为新引用重复确认。", "An existing matching reference cannot be confirmed as another new reference.")).font(.footnote)
                }
                Toggle(t("我已核对以上字段，明确保存此用户报告", "I reviewed these fields and explicitly confirm this user report"), isOn: $confirmed)
                Button(t("明确确认订单引用", "Explicitly confirm reservation reference")) {
                    Task { await store.confirm(current: { actor }, request: request); confirmed = false }
                }.disabled(!confirmed || !store.canConfirm).accessibilityIdentifier("reservations.confirm")
                Text(t("预览有时效。过期、冲突或权限变化后需重新读取；保存不会修改行程。", "Preview expires. Refresh after expiry, conflict or authority changes. Saving does not change the Trip.")).font(.footnote)
            }
        }
    }
    @ViewBuilder private var referencesSection: some View {
        if let trip = store.selected {
            Section(t("同一行程的当前引用", "Current references for this Trip")) {
                Button(t("重载当前行程及引用首页", "Reload current Trip and first reference page")) { Task { clearEditor(); await store.select(trip, current: { actor }, request: request) } }
                    .disabled(store.busy).accessibilityIdentifier("reservations.reload")
                TimelineView(.periodic(from: .now, by: 1)) { _ in
                    if store.pageCurrent {
                        if store.items.isEmpty { Text(t("本页没有订单引用。", "No reservation reference on this page.")) }
                        ForEach(store.items) { row in
                            VStack(alignment: .leading, spacing: 6) {
                                Text(row.fields.title).font(.headline)
                                Text(t("用户报告 · 供应商未核验 · ", "User reported · supplier unverified · ") + status(row.fields.status))
                                Text(t("日期：", "Dates: ") + (row.fields.startsAt ?? t("未知", "Unknown")) + " → " + (row.fields.endsAt ?? t("未知", "Unknown")))
                                Text(t("地址：", "Address: ") + (row.fields.address ?? t("未知", "Unknown")))
                                Text(t("条款：", "Terms: ") + (row.fields.terms ?? t("未知", "Unknown")))
                                Text(["reserved", "amended"].contains(row.fields.status)
                                    ? t("仅作为已确认的用户报告约束；不会自动调整安排。", "A confirmed user-report constraint only; arrangements are not adjusted automatically.")
                                    : t("未知／取消状态不作为有效预订约束。", "Unknown/cancelled status does not apply as an active reservation constraint.")).font(.footnote)
                                Button(t("校正或报告外部改签／取消", "Correct or report external amendment/cancellation")) {
                                    fields = row.fields; source = row.source; target = .init(referenceId: row.referenceId, revision: row.revision)
                                    confirmed = false; store.invalidatePreview()
                                }.disabled(store.pending != nil || store.busy)
                            }.accessibilityIdentifier("reservations.reference." + row.referenceId)
                        }
                        if store.nextCursor != nil {
                            Button(t("读取下一页", "Read next page")) { Task { await store.next(current: { actor }, request: request) } }.disabled(store.busy)
                        }
                    } else { Text(t("当前引用尚未重载或快照已过期，请刷新。", "Current references need reloading or have expired. Refresh.")) }
                }
                Text(t("要改变安排，请在同一行程编辑草稿，再审阅 Proposal 差异并明确确认。", "To change arrangements, edit a draft in this Trip, then review the Proposal diff and explicitly confirm."))
                if let scope = actor {
                    NavigationLink(t("打开同一行程／原 Proposal 流程", "Open this Trip / existing Proposal flow")) { NativeTripView(initialTripID: trip.id, initialTripScope: scope) }
                }
            }
        }
    }
    private func optionalField(_ label: String, _ value: Binding<String?>) -> some View {
        TextField(label, text: Binding(get: { value.wrappedValue ?? "" }, set: { value.wrappedValue = $0.isEmpty ? nil : $0 }), axis: .vertical)
            .textInputAutocapitalization(.never).autocorrectionDisabled()
    }
    private func clearEditor() { fields = .init(); source = .init(); target = nil; confirmed = false; store.invalidatePreview() }
    private func apply(_ field: String, _ value: String) {
        switch field {
        case "title": fields.title = value
        case "externalReference": fields.externalReference = value
        case "startsAt": fields.startsAt = value
        case "endsAt": fields.endsAt = value
        case "timeZone": fields.timeZone = value
        case "address": fields.address = value
        case "terms": fields.terms = value
        default: break
        }
    }
    private func label(_ field: String) -> String { NativeReservationLabels.field(field, chinese: chinese) }
    private func relation(_ value: String) -> String {
        switch value { case "new": return t("新增引用", "New reference"); case "duplicate": return t("重复引用", "Duplicate reference"); case "change": return t("已有引用有变更", "Existing reference changes"); default: return t("冲突：先重载并选择当前引用", "Conflict: reload and select the current reference") }
    }
    private func status(_ value: String) -> String {
        switch value { case "reserved": return t("已预订", "Reserved"); case "amended": return t("用户报告已改签", "User reports amendment"); case "cancelled": return t("用户报告已取消", "User reports cancellation"); default: return t("未知", "Unknown") }
    }
    private func message(_ value: String) -> String {
        switch value {
        case "CONFIRMED_RELOAD_REQUIRED": return t("服务器已确认保存；重载查看当前引用。", "Server confirmed the saved reference. Reload to view current references.")
        case "SUPERSEDED_RELOAD_CURRENT": return t("原操作已被后续修订替代；重载当前版本，不使用原字段。", "A later revision superseded the original operation. Reload the current version; original fields are not current.")
        case "RESERVATION_RECEIPT_UNKNOWN", "RESOLVE_ORIGINAL_OPERATION": return t("结果未知，原请求仍冻结。先核对原操作回执。", "Outcome unknown; the original request remains frozen. Read its operation receipt first.")
        case "RESERVATION_CONFLICT", "STALE_TRIP_VERSION": return t("引用或行程已变化。重载当前内容再重新预览；未知请求仍保留。", "Reference or Trip changed. Reload and preview again; an unknown request remains retained.")
        default: return t("读取、权限或本机保存未确认，请重试。没有替换为其他订单。", "Read, authority or device persistence unconfirmed. Retry. No other reservation was substituted.")
        }
    }
}

enum NativeReservationLabels {
    static func field(_ field: String, chinese: Bool) -> String {
        let labels = ["kind": ("类型", "Type"), "supplier": ("来源", "Supplier"), "externalReference": ("订单号", "External reference"),
                      "title": ("标题", "Title"), "startsAt": ("开始日期时间", "Start date/time"), "endsAt": ("结束日期时间", "End date/time"),
                      "timeZone": ("时区", "Time zone"), "address": ("地址", "Address"), "terms": ("条款", "Terms"), "status": ("外部状态", "External status")]
        guard let label = labels[field] else { return field }; return chinese ? label.0 : label.1
    }
}
