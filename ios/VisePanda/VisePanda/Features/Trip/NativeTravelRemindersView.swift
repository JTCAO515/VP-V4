import SwiftUI

/// Every projection and write uses the current authenticated Trip. No offline
/// local notification is scheduled because it cannot revalidate server authority.
struct NativeTravelRemindersView: View {
    let detail: NativeTripDetail
    let session: NativeSession
    let chinese: Bool
    @Environment(\.scenePhase) private var scenePhase
    @State private var store = NativeNoticeStore()
    @State private var reason = ""
    @State private var due = Date().addingTimeInterval(3600)
    @State private var timeZone = TimeZone.current.identifier
    @State private var sourceID = ""
    @State private var consent = false
    @State private var quietEnabled = true
    @State private var quietStart = 22
    @State private var quietEnd = 7
    @State private var validMinutes = 60
    @State private var formNotice: String?
    @State private var deviceMetadata: String?
    private func text(_ en: String, _ zh: String) -> String { chinese ? zh : en }
    private var quietHours: NativeQuietHours {
        .init(startMinute: quietEnabled ? quietStart * 60 : 0, endMinute: quietEnabled ? quietEnd * 60 : 0)
    }
    private var sources: [NativeNextStep] {
        store.view?.currentSources(expectedVersion: detail.trip.headVersion) ?? []
    }
    private var selectedSource: NativeNextStep? { sources.first { $0.id == sourceID } }
    private var frozen: Bool { store.busy || store.pending != nil }
    private var nextExpiry: String? {
        store.view?.nextSteps.compactMap { NativeNotificationWire.date($0.expiresAt) }.filter { $0 > Date() }.min()?.ISO8601Format()
    }
    private var loadKey: String {
        "\(String(describing: session.dataScope))|\(detail.trip.id)|\(detail.trip.headVersion)|\(scenePhase == .active)"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(text("Travel reminders", "旅行提醒")).font(.headline)
            permissionSection
            nextStepsSection
            scheduleSection
            if let notice = formNotice { Text(notice).font(.footnote).foregroundStyle(Color.vpSecondaryText) }
            if let notice = store.notice { Text(message(notice)).font(.footnote).foregroundStyle(Color.vpSecondaryText) }
            if let pending = store.pending {
                Text(text("An earlier operation is unconfirmed. Retry its original request before making another change.", "先前操作尚未确认。请先重试原请求，再进行其他修改。"))
                    .font(.footnote)
                Button(text("Recover original operation", "恢复原操作")) { Task { await perform(nil) } }.disabled(store.busy)
                Button(text("Safely abandon unconfirmed operation", "安全放弃未确认操作"), role: .destructive) { Task { await perform(nil, abandon: true) } }.disabled(store.busy)
                if let metadata = try? pending.exportMetadata(), let safeText = String(data: metadata, encoding: .utf8) {
                    ShareLink(item: safeText) { Text(text("Export recovery metadata", "导出恢复元数据")) }
                }
            }
            if let view = store.view {
                ForEach(view.reminders) { reminder in reminderRow(reminder) }
                ForEach(view.watches) { watch in watchRow(watch) }
            }
            Button(text("Refresh reminders", "刷新提醒")) { Task { await refresh() } }.disabled(store.busy)
                .accessibilityIdentifier("reminders.refresh")
        }
        .task(id: loadKey) {
            if store.scope != session.dataScope {
                reason = ""; consent = false; sourceID = ""; formNotice = nil; deviceMetadata = nil
            }
            store.bind(scope: session.dataScope, tripId: detail.trip.id)
            guard session.dataScope != nil, scenePhase == .active else { return }
            await refresh()
        }
        .task(id: nextExpiry) {
            guard let nextExpiry, let expiry = NativeNotificationWire.date(nextExpiry), scenePhase == .active else { return }
            let delay = expiry.timeIntervalSinceNow
            if delay > 0 { try? await Task.sleep(for: .seconds(delay)) }
            guard !Task.isCancelled, session.dataScope == store.scope, scenePhase == .active else { return }
            await refresh()
        }
    }

    private var permissionSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(permissionText).font(.footnote)
            Text(text("Travel consent and iOS permission are separate. Marketing and affiliate messages are excluded.", "旅行用途同意与 iOS 权限分别管理，不包含营销或联盟推广。"))
                .font(.caption).foregroundStyle(Color.vpSecondaryText)
            if store.view?.transport != "configured" || NativeNotificationConfiguration.installed() == nil {
                Text(text("Push is unavailable in this configuration. Saved reminders can be reviewed in this trip.", "当前配置推送不可用；保存的提醒可在本行程查看。"))
                    .font(.footnote).foregroundStyle(Color.vpSecondaryText)
            } else {
                Button(text("Allow notifications for my saved travel reminders", "为已保存的旅行提醒允许系统通知")) {
                    Task { await session.notifications.requestPermission(session: session, view: store.view) }
                }
                .disabled(frozen || store.view?.tripVersion != detail.trip.headVersion || store.view?.hasRetainedConsentedPurpose() != true)
                .accessibilityIdentifier("reminders.permission")
                if let device = store.view?.device, device.active {
                    Button(text("Revoke this device's travel notifications", "撤回本设备旅行通知"), role: .destructive) {
                        Task {
                            guard let scope = session.dataScope else { return }
                            let permission = await NativeNotificationPermission.current()
                            guard session.dataScope == scope else { return }
                            guard let command = try? NativeNoticeCommand.revokeDevice(tripId: detail.trip.id, deviceId: device.deviceId, permission: permission) else {
                                formNotice = text("The current iOS permission could not be declared. Turn off each reminder or watch to withdraw its travel purpose.", "当前 iOS 权限状态无法准确声明，请逐条关闭提醒或观察以撤回旅行用途。")
                                return
                            }
                            await perform(command)
                            session.notifications.stopRegistration()
                        }
                    }.disabled(frozen)
                }
            }
            if let notice = session.notifications.notice { Text(message(notice)).font(.footnote) }
            Button(text("Export local device registration metadata", "导出本机设备注册元数据")) {
                do {
                    guard let binding = try session.notificationDeviceBinding() else {
                        formNotice = text("No local device registration metadata is retained.", "当前未保留本机设备注册元数据。")
                        return
                    }
                    deviceMetadata = String(data: try binding.exportMetadata(), encoding: .utf8)
                } catch { formNotice = message("REMINDER_ACK_UNKNOWN") }
            }.disabled(session.dataScope == nil)
            if let deviceMetadata { ShareLink(item: deviceMetadata) { Text(text("Share registration metadata", "分享注册元数据")) } }
        }
    }
    private var permissionText: String {
        switch session.notifications.permission {
        case .authorized: return text("iOS notifications: allowed", "iOS 通知：已允许")
        case .provisional: return text("iOS notifications: quiet permission; travel push requires explicit permission", "iOS 通知：临时静默许可；旅行推送需要明确允许")
        case .ephemeral: return text("iOS notifications: temporary permission", "iOS 通知：临时许可")
        case .denied: return text("iOS notifications: denied. You can change this in Settings.", "iOS 通知：已拒绝，可在系统设置修改。")
        case .notDetermined: return text("iOS notifications: permission has not been requested", "iOS 通知：尚未请求权限")
        case .unknown: return text("iOS notification permission: unknown", "iOS 通知权限：未知")
        }
    }
    @ViewBuilder private var nextStepsSection: some View {
        if let view = store.view, view.tripVersion == detail.trip.headVersion {
            if !view.complete {
                Text(text("Some sources are unavailable or unverified. You can use each verified source shown below.", "部分来源不可用或尚未核实，可使用下方逐条已验证的来源。"))
                    .font(.footnote).foregroundStyle(Color.vpSecondaryText)
            }
            ForEach(sources) { step in
                VStack(alignment: .leading, spacing: 6) {
                    Text(step.reason ?? reasonText(step.reasonCode))
                    Text(text("Source revision: ", "来源修订：") + String(step.source.revision)).font(.caption)
                    Button(text("Dismiss this next step", "关闭此下一步")) {
                        Task {
                            guard let command = try? NativeNoticeCommand(tripId: detail.trip.id, action: "dismiss", input:
                                ["operationId": NativeNoticeCommand.operation(), "nextStepId": step.id, "source": NativeNoticeCommand.sourceObject(step.source)]) else { return }
                            await perform(command)
                        }
                    }.disabled(frozen)
                }
            }
            if sources.allSatisfy({ $0.source.kind != "qualified_watch" }) {
                Text(text("Watch unavailable: no qualified change source is available. No continuous background check or location tracking is enabled.", "观察提醒不可用：当前没有合格的变化来源，未启用持续后台检查或定位。"))
                    .font(.caption).foregroundStyle(Color.vpSecondaryText)
            }
        } else {
            Text(text("Current next-step sources could not be verified. Reload this trip.", "当前下一步来源尚未核实，请重载行程。"))
                .font(.footnote).foregroundStyle(Color.vpSecondaryText)
        }
    }
    private var scheduleSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Picker(text("Reminder purpose and source", "提醒用途与来源"), selection: $sourceID) {
                Text(text("Choose a current source", "选择当前来源")).tag("")
                ForEach(sources) { step in Text(reasonText(step.reasonCode)).tag(step.id) }
            }.disabled(frozen)
            if selectedSource?.source.purpose == .userSetTravel {
                TextField(text("Why remind me?", "提醒原因"), text: $reason)
                    .accessibilityIdentifier("reminders.reason").disabled(frozen)
            }
            DatePicker(text("Remind at", "提醒时间"), selection: $due, in: Date()..., displayedComponents: [.date, .hourAndMinute])
                .environment(\.timeZone, TimeZone(identifier: timeZone) ?? .current).disabled(frozen)
            TextField(text("IANA time zone", "IANA 时区"), text: $timeZone).autocorrectionDisabled().disabled(frozen)
            Picker(text("Valid after reminder time", "提醒时间后有效期"), selection: $validMinutes) {
                Text(text("15 minutes", "15 分钟")).tag(15)
                Text(text("1 hour", "1 小时")).tag(60)
                Text(text("4 hours", "4 小时")).tag(240)
            }.disabled(frozen)
            Toggle(text("Quiet hours", "静默时段"), isOn: $quietEnabled).disabled(frozen)
            if quietEnabled {
                HStack {
                    Picker(text("From", "开始"), selection: $quietStart) { ForEach(0..<24) { Text(String(format: "%02d:00", $0)).tag($0) } }
                    Picker(text("Until", "结束"), selection: $quietEnd) { ForEach(0..<24) { Text(String(format: "%02d:00", $0)).tag($0) } }
                }.disabled(frozen)
            }
            Toggle(text("Allow only this selected travel purpose", "仅同意所选旅行用途"), isOn: $consent).disabled(frozen)
                .onChange(of: sourceID) { _, _ in consent = false }
            Button(text("Save reminder", "保存提醒")) { Task { await schedule(watch: false) } }
                .disabled(frozen || !consent || selectedSource == nil).accessibilityIdentifier("reminders.save")
            if selectedSource?.source.kind == "qualified_watch" {
                Button(text("Watch this qualified source until expiry", "观察此合格来源至到期")) { Task { await schedule(watch: true) } }
                    .disabled(frozen || !consent).accessibilityIdentifier("reminders.watch")
            }
        }
    }

    private func reminderRow(_ reminder: NativeNoticeRecord) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(reminder.reason ?? reasonText(reminder.source.kind == "task_result" ? "result_ready" : "watch_changed"))
            Text("\(reminder.dueAt) · \(reminder.timeZone)").font(.caption)
            Text(deliveryText(reminder)).font(.footnote)
            if reminder.status == "saved" {
                HStack {
                    Button(text("Turn off", "关闭"), role: .destructive) { Task { await change("cancel", id: reminder.id) } }
                    Button(text("Done", "已完成")) { Task { await change("complete", id: reminder.id) } }
                }.disabled(frozen)
            }
        }
    }
    private func watchRow(_ watch: NativeWatchRecord) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(text("Qualified watch · source revision ", "合格观察 · 来源修订 ") + String(watch.source.revision))
            Text(watch.expiresAt + " · " + watch.timeZone).font(.caption)
            if watch.status == "active" {
                Button(text("Stop watching", "停止观察"), role: .destructive) { Task { await change("unwatch", id: watch.id) } }.disabled(frozen)
            } else { Text(text("Watch stopped", "已停止观察")).font(.footnote) }
        }
    }
    private func deliveryText(_ reminder: NativeNoticeRecord) -> String {
        let prefix = reminder.status == "cancelled" ? text("Turned off. ", "已关闭。") : reminder.status == "completed" ? text("Completed. ", "已完成。") : ""
        if reminder.outcome?.kind == "accepted" {
            return prefix + text("APNs accepted the handoff; device delivery is unconfirmed. An accepted notification may still arrive after closing.", "APNs 已接收交接，设备送达尚未确认；关闭后已交接的通知仍可能到达。")
        }
        if reminder.outcome?.kind == "unknown" || [.attempting, .unknown].contains(reminder.deliveryState) {
            return prefix + text("Delivery outcome is unknown. Closing cannot recall an in-flight notification.", "投递结果未知；关闭不能撤回在途通知。")
        }
        if reminder.status != "saved" { return prefix }
        if NativeNotificationWire.date(reminder.expiresAt).map({ $0 <= Date() }) == true { return text("Expired · check the latest receipt for delivery history", "已过期 · 投递历史以最新回执为准") }
        switch reminder.deliveryState {
        case .error: return text("Transport error · refresh for the latest receipt", "投递接口异常 · 请刷新查看最新回执")
        case .suppressed: return text("Reminder is not currently eligible for dispatch", "提醒当前不符合派发条件")
        default: return store.view?.transport == "configured" ? text("Saved · dispatch will recheck current eligibility", "已保存 · 派发前会重验当前资格") : text("Saved · push unavailable", "已保存 · 推送不可用")
        }
    }
    private func reasonText(_ code: String) -> String {
        switch code {
        case "review_trip": return text("Review your current trip", "查看当前行程")
        case "user_requested": return text("Reminder you requested", "你设置的提醒")
        case "result_ready": return text("An accepted task result is ready to review", "已接受的任务有新成果可查看")
        case "watch_available": return text("Follow changes to this qualified source", "可关注此资料的变化")
        default: return text("Information changed; review the current source", "资料有变化，请复查")
        }
    }
    private func message(_ code: String) -> String {
        switch code {
        case "REMINDER_OPERATION_CONFIRMED": return text("Operation confirmed. The delivery receipt is separate.", "操作已确认，投递结果请看独立回执。")
        case "REMINDER_OPERATION_CANCELLED": return text("The original operation was fenced before it applied.", "原操作已在执行前取消并封住迟到请求。")
        case "SOURCE_UNAVAILABLE": return text("Some sources are unavailable or unverified; use only the verified sources shown.", "部分来源不可用或尚未核实，请仅使用已显示的验证来源。")
        case "STALE_TRIP_VERSION": return text("The trip changed. Reload this trip.", "行程已变化，请重载行程。")
        case "PERMISSION_DENIED": return text("iOS notifications are denied; saved reminders remain available in the app.", "iOS 通知已拒绝，仍可在 App 内查看已保存提醒。")
        case "PUSH_UNAVAILABLE": return text("Push is unavailable in this configuration.", "当前配置推送不可用。")
        default: return text("The result could not be confirmed. Refresh or recover the original operation.", "结果尚未确认，请刷新或恢复原操作。")
        }
    }
    @MainActor private func refresh() async {
        guard let scope = session.dataScope else { return }
        await session.notifications.refreshPermission(session: session)
        await store.load(scope: scope, current: { session.dataScope }, read: { try session.notificationRecovery() },
                         request: { try await session.tripRequest(path: $0, method: $1, body: $2) })
    }
    @MainActor private func perform(_ command: NativeNoticeCommand?, abandon: Bool = false) async {
        guard let scope = session.dataScope else { return }
        if command == nil, !abandon, store.pending?.command.action == "register_device" {
            let permission = await NativeNotificationPermission.current()
            guard session.dataScope == scope else { return }
            guard permission == .authorized, NativeNotificationConfiguration.installed() != nil else {
                formNotice = text("Permission or configuration changed. Safely abandon the original registration first.", "权限或配置已变化，请先安全放弃原注册请求。")
                return
            }
        }
        await store.perform(command: command, scope: scope, abandon: abandon, current: { session.dataScope }, read: { try session.notificationRecovery() },
            retain: { try session.retainNotification($0, scope: scope) }, complete: { try session.completeNotification($0, receipt: $1, scope: scope) },
            request: { try await session.tripRequest(path: $0, method: $1, body: $2) })
        if store.pending == nil { consent = false; reason = ""; deviceMetadata = nil }
    }
    @MainActor private func change(_ action: String, id: String) async {
        guard let command = try? NativeNoticeCommand(tripId: detail.trip.id, action: action,
            input: ["operationId": NativeNoticeCommand.operation(), "id": id]) else { return }
        await perform(command)
    }
    @MainActor private func schedule(watch: Bool) async {
        guard consent, !frozen, let step = selectedSource, let view = store.view,
              view.tripVersion == detail.trip.headVersion, let sourceExpiry = NativeNotificationWire.date(step.expiresAt),
              due > Date(), TimeZone(identifier: timeZone) != nil else { return }
        let expiry = min(sourceExpiry, due.addingTimeInterval(Double(validMinutes * 60)))
        guard expiry > due else { formNotice = text("The source expires before this time. Choose an earlier time.", "来源在此时间前已过期，请选择更早的时间。"); return }
        do {
            let command: NativeNoticeCommand
            if watch {
                command = try .init(tripId: detail.trip.id, action: "watch", input: ["operationId": NativeNoticeCommand.operation(),
                    "id": NativeNoticeCommand.operation(), "baseVersion": view.tripVersion, "source": NativeNoticeCommand.sourceObject(step.source),
                    "expiresAt": expiry.ISO8601Format(), "timeZone": timeZone, "quietHours": ["startMinute": quietHours.startMinute, "endMinute": quietHours.endMinute], "consent": true])
            } else {
                command = try .schedule(tripId: detail.trip.id, version: view.tripVersion, source: step.source,
                    reason: step.source.purpose == .userSetTravel ? reason.trimmingCharacters(in: .whitespacesAndNewlines) : nil,
                    due: due, expiry: expiry, timeZone: timeZone, quietHours: quietHours)
            }
            formNotice = nil; await perform(command)
        } catch { formNotice = text("Check the reason, time, time zone and quiet hours.", "请检查原因、时间、时区和静默时段。") }
    }
}
