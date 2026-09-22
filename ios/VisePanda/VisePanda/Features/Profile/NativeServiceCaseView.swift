import SwiftUI

private struct ServiceCase: Decodable, Identifiable {
    let caseId: String
    let category: String
    let problem: String
    let grantRevision: Int
    let grantState: String
    let recipientId: String?
    let expiresAt: String?
    var id: String { caseId }
}
private struct PendingServiceCreate { let id: String; let category: String; let problem: String }
private struct ServiceStaff: Decodable, Identifiable { let id: String; let label: String }
private struct ServiceWorkspace: Decodable { let cases: [ServiceCase]; let staff: [ServiceStaff] }
private struct ServiceReply<T: Decodable>: Decodable { let data: T }

struct NativeServiceCaseView: View {
    @Environment(AppSettings.self) private var settings
    @State private var cases: [ServiceCase] = []
    @State private var staff: [ServiceStaff] = []
    @State private var problem = ""
    @State private var category = "general"
    @State private var recipient = ""
    @State private var duration = 60
    @State private var pending: ServiceCase?
    @State private var busy = false
    @State private var hasMore = false
    @State private var error = false
    @State private var pendingCreate: PendingServiceCreate?
    private var zh: Bool { settings.selectedLocale == .zh }

    var body: some View {
        Form {
            Section {
                Text(zh ? "仅记录旅途执行问题或通用支持申请，不代表真人已接单，也不保证处理时段。" : "Record a travel execution issue or general support request. A request is not acceptance and does not promise a response time.")
                Picker(zh ? "问题类型" : "Issue type", selection: $category) {
                    Text(zh ? "通用支持" : "General support").tag("general")
                    Text(zh ? "交通执行问题" : "Transport issue").tag("transport")
                    Text(zh ? "住宿执行问题" : "Accommodation issue").tag("accommodation")
                    Text(zh ? "旅途中问题" : "On-trip issue").tag("on_trip")
                }
                .disabled(pendingCreate != nil)
                TextField(zh ? "问题说明（最多1000字符）" : "Issue description (up to 1000 characters)", text: $problem, axis: .vertical)
                    .disabled(pendingCreate != nil)
                Text(zh ? "先保存为私人请求；未授权也可以申请通用支持。不自动分享行程、聊天或个人资料。" : "Save a private request first. General support does not require sharing. Trips, chats and profile data are not shared automatically.")
                    .font(.footnote)
                Button(pendingCreate != nil ? (zh ? "重试原请求" : "Retry original request") : (zh ? "记录请求，不分享" : "Record request without sharing")) {
                    Task { await create() }
                }.disabled(problem.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || problem.unicodeScalars.count > 1000)
            }
            if error { Text(zh ? "未完成，请刷新确认当前状态后重试。" : "Not completed. Refresh to check the current state before retrying.").foregroundStyle(.red) }
            Section(zh ? "指定接收员工" : "Choose a recipient") {
                Picker(zh ? "员工" : "Employee", selection: $recipient) {
                    Text(zh ? "请选择" : "Select").tag("")
                    ForEach(staff) { Text($0.label).tag($0.id) }
                }
                Picker(zh ? "访问时限" : "Access duration", selection: $duration) {
                    Text(zh ? "15分钟" : "15 minutes").tag(15)
                    Text(zh ? "1小时" : "1 hour").tag(60)
                    Text(zh ? "24小时" : "24 hours").tag(1440)
                }
                if staff.isEmpty { Text(zh ? "目前没有可指定的员工；请求仍可记录。" : "No employee is available to select. You can still record a request.") }
            }
            ForEach(cases) { item in
                Section {
                    Text(item.problem)
                    Text(zh ? "申请已记录，尚未接单" : "Request recorded; not accepted")
                    Text(grantLabel(item.grantState)).font(.caption)
                    if let id = item.recipientId { Text(staff.first(where: { $0.id == id })?.label ?? id).font(.caption) }
                    if let expiry = item.expiresAt { Text(expiry).font(.caption) }
                    Button(zh ? "预览分享 / 更换员工" : "Preview sharing / change employee") { pending = item }
                        .disabled(recipient.isEmpty)
                    if item.grantState == "active" {
                        Button(zh ? "撤回访问" : "Revoke access", role: .destructive) {
                            Task { await mutate(["action": "revoke", "caseId": item.id, "expectedRevision": item.grantRevision]) }
                        }
                    }
                }
            }
            if hasMore {
                Button(zh ? "更多请求" : "More requests") { Task { await loadMore() } }
            }
            Button(zh ? "刷新" : "Refresh") { Task { await load() } }
        }
        .disabled(busy || settings.nativeSession.dataScope == nil)
        .navigationTitle(zh ? "旅途支持" : "Travel support")
        .task { await load() }
        .sheet(item: $pending) { item in
            NavigationStack {
                Form {
                    Text(zh ? "仅分享以下问题说明" : "Only this issue description will be shared")
                    Text(item.problem)
                    Text(staff.first(where: { $0.id == recipient })?.label ?? recipient)
                    Text(zh ? "授权后有效 \(duration) 分钟；替换后原员工立即失去访问。" : "Valid for \(duration) minutes after granting. Replacing the recipient removes the previous employee's access.")
                    Button(zh ? "确认授权" : "Confirm access") {
                        pending = nil
                        Task { await mutate(["action": "grant", "caseId": item.id, "expectedRevision": item.grantRevision, "recipientId": recipient, "durationMinutes": duration, "sharedFields": ["problem"]]) }
                    }
                    Button(zh ? "取消" : "Cancel") { pending = nil }
                }.navigationTitle(zh ? "分享预览" : "Sharing preview")
            }
        }
    }

    private func grantLabel(_ state: String) -> String {
        switch state {
        case "active": zh ? "已授权（以服务器读取检查为准）" : "Access granted (checked on every server read)"
        case "expired": zh ? "访问已到期" : "Access expired"
        default: zh ? "未授权 / 已撤回" : "Not shared / revoked"
        }
    }
    @MainActor private func send(_ input: [String: Any]) async throws -> Data {
        try await settings.nativeSession.serviceCaseRequest(body: JSONSerialization.data(withJSONObject: input))
    }
    @MainActor private func refresh() async throws {
        let data = try await send(["action": "list"])
        let result = try JSONDecoder().decode(ServiceReply<ServiceWorkspace>.self, from: data).data
        cases = result.cases; staff = result.staff; hasMore = result.cases.count == 50
        if let pendingCreate, cases.contains(where: { $0.id.lowercased() == pendingCreate.id.lowercased() }) {
            self.pendingCreate = nil; problem = ""
        }
    }
    @MainActor private func loadMore() async {
        busy = true; defer { busy = false }
        do {
            let data = try await send(["action": "list", "offset": cases.count])
            let result = try JSONDecoder().decode(ServiceReply<ServiceWorkspace>.self, from: data).data
            let known = Set(cases.map(\.id))
            cases += result.cases.filter { !known.contains($0.id) }
            hasMore = result.cases.count == 50; error = false
        } catch { self.error = true }
    }
    @MainActor private func load() async {
        busy = true; defer { busy = false }
        do { try await refresh(); error = false } catch { self.error = true }
    }
    @MainActor private func create() async {
        busy = true; defer { busy = false }
        let submission = pendingCreate ?? PendingServiceCreate(id: UUID().uuidString, category: category, problem: problem)
        pendingCreate = submission
        do {
            _ = try await send(["action": "create", "caseId": submission.id, "category": submission.category, "problem": submission.problem])
            pendingCreate = nil; problem = ""
            try await refresh(); error = false
        } catch NativeDataError.server(let code) where code == "INVALID_INPUT" {
            pendingCreate = nil; error = true
        } catch { self.error = true }
    }
    @MainActor private func mutate(_ input: [String: Any]) async {
        busy = true; defer { busy = false }
        do { _ = try await send(input); try await refresh(); error = false } catch { self.error = true }
    }
}
