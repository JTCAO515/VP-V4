import SwiftUI

/// Server-retained intentions. No local notification is scheduled: iOS cannot
/// revalidate the server Trip/consent/session immediately before offline delivery.
struct NativeTravelRemindersView: View {
    let detail: NativeTripDetail
    let session: NativeSession
    let chinese: Bool
    @State private var reminders: [Reminder] = []
    @State private var reason = ""
    @State private var due = Date().addingTimeInterval(3600)
    @State private var consent = false
    @State private var requestID = UUID().uuidString.lowercased()
    @State private var pendingInput: CreateInput?
    @State private var busy = false
    @State private var notice: String?
    private func text(_ en: String, _ zh: String) -> String { chinese ? zh : en }
    private var path: String { "api/trips/native/v2/\(detail.trip.id)/reminders" }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(text("Travel reminders", "旅行提醒")).font(.headline)
            Text(text("Save a time and reason. Push delivery is not available; no notification will be sent. Open this trip to review your reminders.", "保存提醒时间和原因。推送尚不可用，不会发送通知；请打开本行程查看。"))
                .font(.footnote).foregroundStyle(Color.vpSecondaryText)
            TextField(text("Why remind me?", "提醒原因"), text: $reason)
                .accessibilityIdentifier("reminders.reason")
                .disabled(pendingInput != nil)
            DatePicker(text("Remind at", "提醒时间"), selection: $due, in: Date()..., displayedComponents: [.date, .hourAndMinute])
                .disabled(pendingInput != nil)
            Text(text("Time zone: ", "时区：") + TimeZone.current.identifier).font(.caption)
            Toggle(text("Allow this travel reminder only", "仅同意此旅行提醒用途"), isOn: $consent)
                .disabled(pendingInput != nil)
            Button(text(pendingInput == nil ? "Save reminder" : "Retry same reminder", pendingInput == nil ? "保存提醒" : "重试同一提醒")) {
                Task { await save() }
            }
            .accessibilityIdentifier("reminders.save")
            .disabled(busy || !consent || reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || reason.count > 240)
            if let notice { Text(notice).foregroundStyle(Color.vpSecondaryText) }
            ForEach(reminders) { reminder in
                VStack(alignment: .leading, spacing: 6) {
                    Text(reminder.reason)
                    Text("\(reminder.dueAt) · \(reminder.timeZone)").font(.caption)
                    Text(status(reminder)).font(.footnote)
                    if reminder.status == "saved" {
                        HStack {
                            Button(text("Turn off", "关闭"), role: .destructive) { Task { await change("cancel", id: reminder.id) } }
                            Button(text("Done", "已完成")) { Task { await change("complete", id: reminder.id) } }
                        }
                        .disabled(busy)
                    }
                }
            }
            Button(text("Refresh reminders", "刷新提醒")) { Task { await request(body: nil) } }.disabled(busy)
        }
        .task(id: session.dataScope) {
            reminders = []; pendingInput = nil; reason = ""; consent = false
            requestID = UUID().uuidString.lowercased()
            if session.dataScope != nil { await request(body: nil) }
        }
    }

    private func status(_ reminder: Reminder) -> String {
        if reminder.status == "cancelled" { return text("Turned off", "已关闭") }
        if reminder.status == "completed" { return text("Completed", "已完成") }
        switch reminder.eligibility {
        case "expired": return text("Expired · no notification sent", "已过期 · 未发送通知")
        case "trip_changed": return text("Trip changed · set a new reminder", "行程已变化 · 请重新设置")
        case "account_changed": return text("Session changed · set a new reminder", "登录会话已变化 · 请重新设置")
        case "archived", "trip_ended": return text("Trip ended or archived · no notification", "行程已结束或归档 · 不发送通知")
        default: return text("Saved · push unavailable", "已保存 · 推送不可用")
        }
    }

    @MainActor private func save() async {
        if pendingInput == nil {
            pendingInput = CreateInput(id: requestID, baseVersion: detail.trip.headVersion,
                reason: reason.trimmingCharacters(in: .whitespacesAndNewlines), dueAt: due.ISO8601Format(),
                expiresAt: due.addingTimeInterval(3600).ISO8601Format(), timeZone: TimeZone.current.identifier)
        }
        guard let pendingInput else { return }
        guard let body = try? JSONEncoder().encode(CreateBody(input: pendingInput)) else { return }
        if await request(body: body) {
            self.pendingInput = nil; requestID = UUID().uuidString.lowercased(); reason = ""; consent = false
        }
    }
    @MainActor private func change(_ action: String, id: String) async {
        guard let body = try? JSONEncoder().encode(ChangeBody(action: action, input: ["id": id])) else { return }
        await request(body: body)
    }
    @MainActor @discardableResult private func request(body: Data?) async -> Bool {
        guard !busy, let scope = session.dataScope else { return false }
        busy = true; notice = nil
        defer { busy = false }
        do {
            let data = try await session.tripRequest(path: path, method: body == nil ? "GET" : "POST", body: body)
            guard session.dataScope == scope else { return false }
            let response = try JSONDecoder().decode(Reply.self, from: data)
            guard response.version == 1, response.tripId == detail.trip.id, response.delivery == "unavailable" else { throw NativeDataError.invalidResponse }
            reminders = response.reminders
            return true
        } catch {
            guard session.dataScope == scope else { return false }
            if case NativeDataError.server(let code) = error,
               ["INVALID_INPUT", "STALE_TRIP_VERSION", "TRIP_NOT_FOUND"].contains(code) {
                pendingInput = nil; requestID = UUID().uuidString.lowercased()
                notice = text("Reminder was not saved. Reload the trip, check the time and try again. Up to 50 open reminders are supported.", "提醒未保存。请重载行程、检查时间后重试；最多保留 50 条未关闭提醒。")
                return false
            }
            notice = text("Could not confirm the result. Refresh or retry; no notification is scheduled.", "尚未确认结果。请刷新或重试；未安排通知。")
            return false
        }
    }
    private struct Reminder: Decodable, Identifiable {
        let id: String; let reason: String; let dueAt: String; let timeZone: String; let status: String; let eligibility: String
    }
    private struct Reply: Decodable { let version: Int; let tripId: String; let delivery: String; let reminders: [Reminder] }
    private struct CreateInput: Encodable {
        let id: String; let baseVersion: Int; let reason: String; let dueAt: String; let expiresAt: String; let timeZone: String
        let purpose = "user_set_travel"; let consent = true
    }
    private struct CreateBody: Encodable { let action = "create"; let input: CreateInput }
    private struct ChangeBody: Encodable { let action: String; let input: [String: String] }
}
