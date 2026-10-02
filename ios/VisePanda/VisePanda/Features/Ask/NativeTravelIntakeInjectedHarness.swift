import SwiftUI
import Observation

/// Only the explicit Debug UI harness can enable these closures; no session grant is created.
struct NativeTravelIntakeInjectedTransport {
    let writeBasis: () async throws -> Data
    let read: () async throws -> Data
    let post: (Data) async throws -> Data
    var allowed: Bool {
        #if DEBUG
        ProcessInfo.processInfo.arguments.contains("-VisePandaTravelIntakeInjected")
        #else
        false
        #endif
    }
}

#if DEBUG
@MainActor @Observable final class NativeTravelIntakeInjectedFixture {
    let scope = NativeDataScope(endpoint: "local-injected-only", subject: "00000000-0000-0000-0000-000000000001", mobileEpoch: 1, generation: 1)
    let conversation = "00000000-0000-0000-0000-000000000002", goal = "00000000-0000-0000-0000-000000000003", policy = "00000000-0000-0000-0000-000000000004"
    var message = "00000000-0000-0000-0000-000000000005"
    var goalVersion = 2
    var revision = 1
    var reads = 0
    var writes = 0
    var publishedGoalVersion = 2
    var publishedMessage = "00000000-0000-0000-0000-000000000005"
    @ObservationIgnored private var audit: [[String: Any]] = []
    private func record(_ kind: String, projection input: NativeTravelIntake? = nil) throws {
        let input = input ?? projection
        audit.append(["kind": kind, "city": input.city as Any? ?? NSNull(),
            "lodgingBudget": (try JSONSerialization.jsonObject(with: JSONEncoder().encode(input)) as? [String: Any])?["lodgingBudget"] ?? NSNull(),
            "durationDays": input.durationDays as Any? ?? NSNull(), "partySize": input.partySize as Any? ?? NSNull(),
            "intakeRevision": revision, "goalVersion": goalVersion,
            "interestsPreserved": input.interests == projection.interests, "mobilityPreserved": input.mobilityConstraints == projection.mobilityConstraints,
            "datesPreserved": input.dates == projection.dates])
        let arguments = ProcessInfo.processInfo.arguments
        let index = arguments.firstIndex(of: "-VisePandaLocale")
        let locale = index.flatMap { $0 + 1 < arguments.count ? arguments[$0 + 1] : nil } == "zh" ? "zh" : "en"
        let path = FileManager.default.temporaryDirectory.appendingPathComponent("intake-injected-audit-" + locale + ".json")
        try JSONSerialization.data(withJSONObject: audit, options: [.sortedKeys]).write(to: path, options: .atomic)
    }
    var conflict = false
    var projection = NativeTravelIntake(city: "shanghai", comparisonTarget: "area_transport", durationDays: 10, partySize: 2,
        interests: ["photography", "food"], pace: "relaxed", lodgingBudget: nil,
        dates: .init(startDate: "2026-10-03", endDate: "2026-10-10"),
        mobilityConstraints: ["Avoid stairs\nKeep resting stops", "明确填写的较长行动限制，仅代表用户需求，不代表路线已经验证满足，保留未改字段及数组顺序。"])
    var selection: NativeTravelIntakeSelection {
        .init(scope: scope, conversationID: conversation, goalID: goal, goalVersion: publishedGoalVersion, parentMessageID: publishedMessage, policyID: policy)
    }
    func publishCurrent() { publishedGoalVersion = goalVersion; publishedMessage = message }
    func read() throws -> Data {
        reads += 1
        try record("injected_read")
        let intake = try JSONSerialization.jsonObject(with: JSONEncoder().encode(projection)) as! [String: Any]
        let readiness: [String: Any]
        if projection.city == nil || projection.comparisonTarget == nil {
            readiness = ["kind": "waiting_user", "questions": (projection.city == nil ? ["city"] : []) + (projection.comparisonTarget == nil ? ["comparison_target"] : [])]
        } else if projection.city != "shanghai" { readiness = ["kind": "unavailable", "reason": "city_not_covered"] }
        else if projection.comparisonTarget == "lodging_budget_filter" {
            readiness = projection.lodgingBudget == nil ? ["kind": "waiting_user", "questions": ["lodging_budget"]] : ["kind": "unavailable", "reason": "budget_filter_not_integrated"]
        } else { readiness = ["kind": "ready", "scope": "transport_screening", "unknown": intake.filter { $0.value is NSNull }.map(\.key).sorted()] }
        return try JSONSerialization.data(withJSONObject: ["version": 5, "kind": "travel_intake", "schemaVersion": "assistant-travel-current-basis/1",
            "conversationId": conversation, "goalId": goal, "goalVersion": goalVersion, "messageId": message, "messageSequence": revision + 3,
            "intakeRevision": revision, "sourceKind": "explicit_current_input", "intake": intake, "memoryBasis": [],
            "contextDigest": String(repeating: "a", count: 64), "readiness": readiness, "readyForProvider": false])
    }
    func writeMetadata() throws -> Data {
        try record("injected_write_basis")
        return try JSONSerialization.data(withJSONObject: ["version": 5, "kind": "travel_intake_write_basis", "conversationId": conversation,
            "goalId": goal, "goalVersion": goalVersion, "parentMessageId": message, "messageSequence": revision + 3,
            "intakeRevision": revision, "policyId": policy, "readyForProvider": false])
    }
    func post(_ bytes: Data) throws -> Data {
        writes += 1
        guard let request = try JSONSerialization.jsonObject(with: bytes) as? [String: Any],
              request["expectedGoalVersion"] as? Int == goalVersion, request["expectedIntakeRevision"] as? Int == revision,
              let input = request["intake"], let nextMessage = request["messageId"] as? String else { throw NativeDataError.invalidResponse }
        let next = try JSONDecoder().decode(NativeTravelIntake.self, from: JSONSerialization.data(withJSONObject: input))
        try record(conflict ? "injected_post_409" : "injected_post", projection: next)
        if conflict { conflict = false; throw NativeDataError.server(code: "VERSION_CONFLICT") }
        guard next.valid, next.interests == projection.interests, next.mobilityConstraints == projection.mobilityConstraints,
              next.dates == projection.dates else { throw NativeDataError.invalidResponse }
        projection = next; message = nextMessage; revision += 1; goalVersion += 1
        return try JSONSerialization.data(withJSONObject: ["version": 5, "kind": "accepted", "conversationId": conversation, "goalId": goal,
            "messageId": message, "messageSequence": revision + 3, "goalVersion": goalVersion, "intakeRevision": revision,
            "reused": false, "current": true, "readyForProvider": false, "contextDigest": String(repeating: "a", count: 64)])
    }
}
struct NativeTravelIntakeInjectedHarness: View {
    let session: NativeSession
    let chinese: Bool
    @State private var fixture = NativeTravelIntakeInjectedFixture()
    @State private var open = false
    var body: some View {
        VStack {
            Text("LOCAL INJECTED RESPONSES — NO AUTH / HTTP / SQL / PROVIDER").font(.caption).accessibilityIdentifier("intake.injected.banner")
            Text("reads=\(fixture.reads) writes=\(fixture.writes) revision=\(fixture.revision)").accessibilityIdentifier("intake.injected.counts")
            Button(chinese ? "编辑固定响应需求" : "Edit fixed-response requirements") { open = true }.accessibilityIdentifier("intake.injected.open")
            Button("Next submission: injected 409") { fixture.conflict = true }.accessibilityIdentifier("intake.injected.arm409")
        }
        .sheet(isPresented: $open) {
            NavigationStack {
                NativeTravelIntakeView(injected: .init(writeBasis: { try fixture.writeMetadata() }, read: { try fixture.read() }, post: { try fixture.post($0) }),
                    selection: fixture.selection, session: session, chinese: chinese, accepted: { fixture.publishCurrent() }, reviewGoal: { fixture.publishCurrent(); return fixture.selection })
                    .navigationTitle(chinese ? "当前旅行需求（注入验证）" : "Requirements (injected verification)")
                    .toolbar { ToolbarItem(placement: .topBarTrailing) { Button(chinese ? "取消" : "Cancel") { open = false }.accessibilityIdentifier("intake.injected.cancel") } }
            }
        }
    }
}
#endif
