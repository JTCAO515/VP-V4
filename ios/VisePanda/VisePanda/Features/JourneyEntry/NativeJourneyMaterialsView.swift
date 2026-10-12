import SwiftUI

/// Routes to the original same-Trip import, correction and confirmation flow.
/// Closing, skipping or an import failure leaves the conversation underneath.
struct NativeJourneyMaterialsView: View {
    let session: NativeSession
    let chinese: Bool
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var phase
    @State private var store = NativeTripStore()
    @State private var refresh = UUID()
    @State private var destination: Destination?
    private struct Destination: Identifiable {
        let id: String
        let scope: NativeDataScope
    }
    private struct Load: Equatable { let scope: NativeDataScope?; let active: Bool; let refresh: UUID }
    private func t(_ zh: String, _ en: String) -> String { chinese ? zh : en }
    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text(t("选择原安排所属的行程，再使用其中的 PDF 或截图校正入口。无需重新口述材料；差异仍需明确确认。", "Choose the Trip for your arrangements, then use its PDF or screenshot correction entry. You do not need to describe the material again; changes still require explicit confirmation."))
                    if session.dataScope == nil { Text(t("当前账号不可读取行程。恢复登录后可继续；此入口不会创建目标或行程。", "Trips cannot be read in this account state. Continue after sign-in; this entry creates no goal or Trip.")) }
                    else if store.busy { ProgressView() }
                    else if store.trips.isEmpty { Text(t("没有当前可读行程。可以跳过并继续想法，或从行程页明确创建后回来导入。", "No Trip is currently readable. Skip and continue your idea, or explicitly create a Trip from Journeys and return to import.")) }
                    ForEach(phase == .active && session.dataScope != nil && store.scope == session.dataScope ? store.trips : []) { trip in
                        Button {
                            guard phase == .active, let scope = session.dataScope, store.scope == scope else { return }
                            destination = .init(id: trip.id, scope: scope)
                        } label: {
                            VStack(alignment: .leading) { Text(trip.title); Text("v\(trip.headVersion)").font(.caption) }
                        }.accessibilityIdentifier("journeyEntry.materials.trip.\(trip.id)")
                    }
                    if store.notice != nil { Text(t("读取未确认。请重试，已有行程不会被改写。", "The read is unconfirmed. Retry; existing Trips are preserved.")) }
                    Button(t("重新读取", "Reload")) { refresh = UUID() }.disabled(store.busy)
                }
                Section {
                    NavigationLink(t("读取本机获准保存的文字", "Read text permitted for this device")) { NativeOfflineSavedTripsView() }
                        .accessibilityIdentifier("journeyEntry.offline")
                    Text(t("仅复用原离线消费者的所有者、撤回、可信时间和租约校验；过期或未获准内容不可读取。", "The original offline consumer checks ownership, withdrawal, trusted time and lease. Expired or unpermitted content cannot be read."))
                        .font(.footnote)
                    Button(t("跳过导入，继续原目标", "Skip import and continue the original goal")) { dismiss() }
                        .accessibilityIdentifier("journeyEntry.materials.skip")
                }
            }
            .navigationTitle(t("从已有安排开始", "Begin with existing arrangements"))
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button(t("返回", "Back")) { dismiss() } } }
            .sheet(item: $destination) { target in
                NavigationStack {
                    NativeTripView(initialTripID: target.id, initialTripScope: target.scope)
                        .toolbar { ToolbarItem(placement: .cancellationAction) { Button(t("返回材料入口", "Back to material entry")) { destination = nil } } }
                }
            }
            .task(id: Load(scope: session.dataScope, active: phase == .active, refresh: refresh)) {
                guard phase == .active else { store.reset(for: nil); destination = nil; return }
                store.reset(for: session.dataScope)
                if session.dataScope != nil { await store.list(using: session) }
            }
            .onChange(of: session.dataScope) { _, _ in destination = nil; store.reset(for: nil) }
        }
    }
}
