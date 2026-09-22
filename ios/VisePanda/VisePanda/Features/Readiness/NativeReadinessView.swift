import SwiftUI

/// Request-local declarations; this view has no Trip writer, profile or memory persistence.
struct NativeReadinessView: View {
    let tripID: String
    let tripVersion: Int
    @Environment(AppSettings.self) private var settings
    @Environment(\.scenePhase) private var phase
    @State private var city = "shanghai"
    @State private var applies = "unknown"
    @State private var documentReady = "unknown"
    @State private var conditionsChecked = "unknown"
    @State private var timing = "now"
    @State private var selectedTime = Date()
    @State private var requestID: UUID?
    @State private var result: ReadyReply.Result?
    @State private var resultOwner: NativeDataScope?
    @State private var deadline: TimeInterval = 0
    @State private var loading = false
    @State private var notice: String?
    private var session: NativeSession { settings.nativeSession }
    private var chinese: Bool { settings.selectedLocale == .zh }
    private func text(_ en: String, _ zh: String) -> String { chinese ? zh : en }
    private var answersKey: String { [city, applies, documentReady, conditionsChecked, timing, selectedTime.description, chinese.description].joined(separator: "|") }

    var body: some View {
        Form {
            Section {
                Text(text("Carrier SIM document check", "运营商 SIM 证件检查")).font(.headline)
                Text(text("For an application at a mainland China carrier outlet. Your answers are used only for this check and are not saved. No document number or photo is needed.", "适用于在中国大陆运营商营业厅申请 SIM 卡。回答仅用于本次检查，不会保存。无需提供证件号码或照片。"))
                Text(text("Trip version \(tripVersion)", "行程版本 \(tripVersion)"))
            }
            Section(text("Your situation", "你的情况")) {
                Picker(text("City", "城市"), selection: $city) {
                    ForEach(Array(NativeKnowledgeSelection.cities.enumerated()), id: \.element) { index, value in
                        Text(chinese ? ["上海", "北京", "广州", "重庆"][index] : ["Shanghai", "Beijing", "Guangzhou", "Chongqing"][index]).tag(value)
                    }
                }
                answerPicker(text("Planning to apply at an outlet?", "打算到营业厅办理？"), selection: $applies)
                answerPicker(text("Document in the current guidance ready?", "当前指引所列证件已备妥？"), selection: $documentReady)
                answerPicker(text("Current carrier, branch, handset and plan conditions checked?", "已核对运营商、营业厅、手机及套餐条件？"), selection: $conditionsChecked)
                Picker(text("When to check", "何时检查"), selection: $timing) {
                    Text(text("Now", "现在")).tag("now")
                    Text(text("Not decided", "尚未确定")).tag("unknown")
                    Text(text("Choose a time", "选择时间")).tag("later")
                }
                if timing == "later" {
                    DatePicker(text("Your check time", "你的检查时间"), selection: $selectedTime)
                    Text(text("Uses your device time zone. This is not the carrier's opening time and does not schedule a reminder.", "使用设备时区。这不是运营商营业时间，也不会安排提醒。"))
                }
                Button(text("Check with current evidence", "用当前依据检查")) { requestID = UUID() }
                    .disabled(loading || session.dataScope == nil)
                    .accessibilityIdentifier("readiness.check")
                if loading { ProgressView() }
                if let notice { Text(notice).accessibilityIdentifier("readiness.notice") }
            }
            TimelineView(.periodic(from: .now, by: 1)) { _ in
                if phase == .active, session.dataScope != nil, resultOwner == session.dataScope, let result, deadline > ProcessInfo.processInfo.systemUptime {
                    Section(text("Next step", "下一步")) {
                        Text(state(result.knowledgeAvailability)).accessibilityIdentifier("readiness.knowledge")
                        Text(state(result.userReadiness)).accessibilityIdentifier("readiness.user")
                        Text(state(result.actionTiming)).accessibilityIdentifier("readiness.timing")
                        Text(result.nextStep.text).accessibilityIdentifier("readiness.nextStep")
                        if let at = result.nextStep.at, let date = NativeKnowledgeRead.date(at) { Text(date.formatted()) }
                    }
                    ForEach(result.evidence, id: \.factId) { fact in
                        Section(text("Reviewed basis and scope", "已审核依据与范围")) {
                            Text(fact.text)
                            ForEach(fact.conditions + fact.exclusions, id: \.self) { Text($0).font(.footnote) }
                            ForEach(fact.sources, id: \.sourceRevisionId) { source in
                                if let url = source.url { Link(source.publisher + " · " + source.locator, destination: url) }
                            }
                        }
                    }
                } else if result != nil {
                    Text(text("This check expired. Refresh before using its conclusion.", "本次检查已过期，请刷新后再使用结论。"))
                        .accessibilityIdentifier("readiness.expired")
                }
            }
        }
        .navigationTitle(text("Preparation check", "准备检查"))
        .onChange(of: tripID) { _, _ in clear() }
        .onChange(of: tripVersion) { _, _ in clear(); applies = "unknown"; documentReady = "unknown"; conditionsChecked = "unknown" }
        .onChange(of: answersKey) { _, _ in clear() }
        .onChange(of: session.dataScope) { _, _ in clear(); applies = "unknown"; documentReady = "unknown"; conditionsChecked = "unknown" }
        .onChange(of: phase) { _, value in if value != .active { clear() } }
        .onDisappear { clear() }
        .task(id: requestID) {
            guard let task = requestID, let owner = session.dataScope else { return }
            let key = answersKey
            result = nil; deadline = 0; loading = true; notice = nil
            let started = ProcessInfo.processInfo.systemUptime
            do {
                let checkAt = timing == "later" ? ISO8601DateFormatter().string(from: selectedTime) : timing
                let body = try JSONEncoder().encode(ReadyRequest(taskId: task.uuidString, tripVersion: tripVersion, city: city, locale: chinese ? "zh" : "en", applies: applies, documentReady: documentReady, conditionsChecked: conditionsChecked, checkAt: checkAt))
                let bytes = try await session.tripRequest(path: "api/trips/native/v2/\(tripID)/readiness", method: "POST", body: body)
                guard !Task.isCancelled, requestID == task, session.dataScope == owner, key == answersKey, phase == .active else { return }
                guard bytes.count <= 64_000 else { throw NativeDataError.invalidResponse }
                let value = try JSONDecoder().decode(ReadyReply.self, from: bytes).data
                let elapsed = ProcessInfo.processInfo.systemUptime - started
                guard value.schemaVersion == "readiness/1", value.taskId.lowercased() == task.uuidString.lowercased(), value.tripId.lowercased() == tripID.lowercased(), value.tripVersion == tripVersion,
                      let evaluated = NativeKnowledgeRead.date(value.evaluatedAt), let expiry = NativeKnowledgeRead.date(value.expiresAt),
                      value.valid, expiry > evaluated, expiry.timeIntervalSince(evaluated) <= 30,
                      expiry.timeIntervalSince(evaluated) > elapsed else { throw NativeDataError.invalidResponse }
                resultOwner = owner
                result = value
                deadline = ProcessInfo.processInfo.systemUptime + expiry.timeIntervalSince(evaluated) - elapsed
                loading = false
            } catch {
                guard !Task.isCancelled, requestID == task else { return }
                result = nil; deadline = 0; loading = false
                notice = text("Could not verify this check. Reload the saved Trip if it changed, then try again.", "无法核实本次检查。如行程已变化，请先重载已保存行程再试。")
            }
        }
    }
    private func clear() { requestID = nil; resultOwner = nil; result = nil; deadline = 0; loading = false; notice = nil }
    private func answerPicker(_ label: String, selection: Binding<String>) -> some View {
        Picker(label, selection: selection) {
            Text(text("Unknown", "未知")).tag("unknown")
            Text(text("Yes", "是")).tag("yes")
            Text(text("No", "否")).tag("no")
        }
    }
    private func state(_ value: String) -> String {
        switch value {
        case "available": text("Reviewed evidence available", "有已审核依据")
        case "satisfied": text("This check satisfied — your report", "此项检查已满足 · 用户声明")
        case "not_satisfied": text("This check not yet satisfied", "此项检查尚未满足")
        case "not_applicable": text("Not applicable", "不适用")
        case "now": text("Check now", "现在检查")
        case "not_yet": text("Selected check time has not arrived", "尚未到你选定的检查时间")
        default: text("Unknown", "未知")
        }
    }
}

private struct ReadyRequest: Encodable {
    let taskId: String; let tripVersion: Int; let city: String; let locale: String
    let applies: String; let documentReady: String; let conditionsChecked: String; let checkAt: String
}
private struct ReadyReply: Decodable {
    let data: Result
    struct Result: Decodable {
        let schemaVersion: String; let taskId: String; let tripId: String; let tripVersion: Int
        let evaluatedAt: String; let expiresAt: String
        let knowledgeAvailability: String; let userReadiness: String; let actionTiming: String
        let nextStep: Step; let evidence: [Evidence]
        var valid: Bool {
            ["available", "unknown"].contains(knowledgeAvailability) && ["unknown", "satisfied", "not_satisfied", "not_applicable"].contains(userReadiness)
                && ["now", "not_yet", "unknown", "not_applicable"].contains(actionTiming) && evidence.count <= 1
                && (knowledgeAvailability == "available" ? evidence.count == 1 : evidence.isEmpty)
                && !nextStep.text.isEmpty && nextStep.text.count <= 1000
        }
    }
    struct Step: Decodable { let text: String; let at: String? }
    struct Evidence: Decodable { let factId: String; let text: String; let conditions: [String]; let exclusions: [String]; let sources: [Source] }
    struct Source: Decodable {
        let sourceRevisionId: String; let publisher: String; let locator: String; let uri: String
        var url: URL? {
            guard let url = URL(string: uri), ["https", "http"].contains(url.scheme), url.host != nil, url.user == nil, url.password == nil else { return nil }
            return url
        }
    }
}
