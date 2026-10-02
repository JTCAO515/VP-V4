import SwiftUI

struct NativeJourneysView: View {
    var isActive = true
    var onOpenVP: (() -> Void)?
    var onOpenGoal: ((NativeJourneyGoalEntry) -> Void)?
    @Environment(AppSettings.self) private var settings
    @Environment(\.scenePhase) private var scenePhase
    @State private var store = NativeJourneysStore()
    @State private var refresh = UUID()
    @State private var cursor: String?
    private var session: NativeSession { settings.nativeSession }
    private var chinese: Bool { settings.selectedLocale == .zh }
    private func text(_ en: String, _ zh: String) -> String { chinese ? zh : en }
    private var key: LoadKey { .init(scope: session.dataScope, active: isActive && scenePhase == .active, refresh: refresh, cursor: cursor) }

    var body: some View {
        List {
            Section {
                Text(text("Latest available VP conversation goals, one page at a time. Goals can come before dates or a Trip. Confirmed content stays in Trip.", "最近可读取的 VP 会话目标，按页显示。目标可先于日期或行程存在；已确认内容仍保存在行程中。"))
                    .accessibilityIdentifier("journeys.scope")
                Button(text("Open VP", "打开 VP")) { onOpenVP?() }
                    .disabled(onOpenVP == nil).accessibilityIdentifier("journeys.open-vp")
                NavigationLink(value: AppRoute.entry(.trip)) {
                    Text(text("Open Trips", "打开行程"))
                }.accessibilityIdentifier("journeys.open-trips")
                Button(text("Refresh", "刷新")) { store.clear(); cursor = nil; refresh = UUID() }
                    .accessibilityIdentifier("journeys.refresh")
            }
            TimelineView(.periodic(from: .now, by: 1)) { _ in
                if session.dataScope == nil {
                    Text(text("Sign in from Profile to read your journeys.", "请在「我的」登录后查看旅程。"))
                        .accessibilityIdentifier("journeys.signed-out")
                } else if key.active && store.isCurrent(session.dataScope) {
                    projection
                    if let next = store.nextCursor {
                        Button(text("Next goals", "下一页目标")) {
                            guard store.isCurrent(session.dataScope) else { return }
                            store.clear(); cursor = next
                        }.accessibilityIdentifier("journeys.next-page")
                    }
                } else {
                    Text(store.busy ? text("Checking current journeys…", "正在核对当前旅程…") : text("Journey reads are unavailable or expired. Refresh to check again.", "旅程读取暂不可用或已过期，请刷新核对。"))
                        .accessibilityIdentifier("journeys.unavailable")
                }
            }
        }
        .navigationTitle(text("Journeys", "旅程"))
        .task(id: key) {
            let captured = key
            store.clear()
            guard captured.active, captured.scope != nil else { return }
            while session.busy {
                do { try await Task.sleep(for: .milliseconds(50)) } catch { return }
                guard key == captured, !Task.isCancelled else { return }
            }
            await store.load(scope: captured.scope, assistant: session.askMode == .assistant, cursor: captured.cursor,
                             currentScope: { session.dataScope }) { path in
                if path == "api/trips/native/v2" { return try await session.tripRequest(path: path, method: "GET") }
                return try await session.askRequest(path: path, method: "GET")
            }
        }
        .onChange(of: session.dataScope) { _, _ in store.clear(); cursor = nil }
        .onChange(of: isActive) { _, active in if !active { store.clear() } }
        .onChange(of: scenePhase) { _, phase in if phase != .active { store.clear() } }
        .onDisappear { store.clear() }
    }

    @ViewBuilder private var projection: some View {
        Section(text("Latest conversation goals", "最近会话目标")) {
            if !store.goalsAvailable {
                Text(text("Goals unavailable. Existing Trips remain separate below.", "目标暂不可用，下方仍独立显示已有行程。"))
            } else if store.rows.isEmpty {
                Text(text("No goal in the current conversation.", "当前会话暂无目标。"))
            }
            ForEach(store.rows) { row in
                VStack(alignment: .leading, spacing: 8) {
                    Text(row.goal.text).font(.headline).fixedSize(horizontal: false, vertical: true)
                    Text(text("Goal version ", "目标版本 ") + String(row.goal.scopeVersion)).font(.caption)
                    if let onOpenGoal, let capturedScope = store.scope, let conversationID = store.conversationID {
                        Button(text("Open this goal in VP", "在 VP 打开此目标")) {
                            guard store.isCurrent(session.dataScope), session.dataScope == capturedScope else { return }
                            onOpenGoal(.init(scope: capturedScope, conversationID: conversationID, goalID: row.id, scopeVersion: row.goal.scopeVersion))
                        }.buttonStyle(.borderless)
                            .accessibilityIdentifier("journeys.goal.open.\(row.id)")
                    }
                    if row.goal.scopeVersion == 10001 {
                        Text(text("This goal’s Trip link is closed. Read only here.", "该目标的行程关联已终止，此处只读。"))
                    }
                    switch row.relation {
                    case .unlinked:
                        if row.goal.scopeVersion != 10001 {
                            Text(text("No Trip linked. Goal changes stay in VP.", "尚未关联行程，目标修改仍在 VP 中进行。"))
                        }
                    case .unknown:
                        Text(text("Trip relationship needs checking. Refresh or open VP.", "行程关系待核对，请刷新或打开 VP。"))
                    case .linked(let id):
                        if let trip = store.trips.first(where: { $0.id == id }) {
                            Text(text("Linked Trip: ", "已关联行程：") + trip.title)
                        }
                    }
                }.accessibilityElement(children: .contain)
                    .accessibilityIdentifier("journeys.goal.\(row.id)")
            }
        }
        Section(text("Saved Trips", "已保存行程")) {
            if !store.tripsAvailable { Text(text("Trip list unavailable.", "行程列表暂不可用。")) }
            else if store.trips.isEmpty { Text(text("No saved Trip.", "暂无已保存行程。")) }
            ForEach(store.trips) { trip in
                if let capturedScope = store.scope {
                    NavigationLink(value: AppRoute.journeyTrip(.init(tripID: trip.id, scope: capturedScope))) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(trip.title).font(.headline)
                            Text(text("Trip version ", "行程版本 ") + String(trip.headVersion)).font(.caption)
                        }
                    }.accessibilityIdentifier("journeys.trip.\(trip.id)")
                }
            }
        }
    }

    private struct LoadKey: Equatable {
        let scope: NativeDataScope?
        let active: Bool
        let refresh: UUID
        let cursor: String?
    }
}
