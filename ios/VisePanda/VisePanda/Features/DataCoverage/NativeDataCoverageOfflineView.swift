import SwiftUI

struct NativeDataCoverageOfflineView: View {
    let coverage: NativeDataCoverageStore
    let session: NativeSession
    let chinese: Bool
    @Environment(\.scenePhase) private var phase
    @State private var ids: [String] = []
    @State private var selected: String?
    @State private var captured: NativeCommunitySafetyActor?
    @State private var deadline: TimeInterval = 0
    @State private var unavailable = false
    @State private var confirmation = false
    private var actor: NativeCommunitySafetyActor? { phase == .active ? try? session.communitySafetyActor() : nil }
    private func t(_ zh: String, _ en: String) -> String { chinese ? zh : en }
    var body: some View {
        Section(t("所选行程的本机离线资料", "Device offline data for a selected Trip")) {
            Text(t("使用原离线存储的真实索引。清理只影响所选行程的本机草稿、确认文本缓存和住宿副本，不删除服务器行程或外部文件。", "Uses the original offline store’s actual index. Cleanup affects only this Trip’s device drafts, confirmed-text cache and lodging copies. Server Trips and external files are excluded."))
            Button(t("读取自己的离线行程索引", "Read your offline Trip index")) { load() }.disabled(actor == nil)
            TimelineView(.periodic(from: .now, by: 1)) { _ in
                if actor == captured, actor != nil, ProcessInfo.processInfo.systemUptime < deadline {
                    ForEach(ids, id: \.self) { id in
                        Button { selected = id } label: { HStack { Text(id).font(.caption); if selected == id { Image(systemName: "checkmark") } } }
                    }
                    if ids.isEmpty { Text(t("已读取的当前账号索引为空；这不是全部本机或服务器资料已删除的回执。", "The current account index was read and is empty. This is not a receipt for erasure of all device/server data.")) }
                }
            }
            Button(t("明确清理所选行程的本机副本…", "Explicitly clean this selected Trip’s device copies…"), role: .destructive) { confirmation = true }
                .disabled(selected == nil || actor != captured || ProcessInfo.processInfo.systemUptime >= deadline)
            Text(t("没有现成的完整离线导出 handler。原清理器也没有可独立核验确认文本文件的回执，此处如实保留部分完成。", "No complete offline export handler exists. The original cleaner also lacks an independent receipt for verifying confirmed-text file absence, so this entry retains a partial outcome."))
            if unavailable { Text(t("离线索引或受保护存储不可读；不当作空集合或已清除。", "Offline index or protected storage is unreadable; it is not treated as empty or erased.")) }
        }.onChange(of: actor) { _, _ in clear() }.onDisappear { clear() }
            .confirmationDialog(t("只清理所选行程的本机离线资料？", "Clean only the selected Trip’s device offline data?"), isPresented: $confirmation, titleVisibility: .visible) {
                Button(t("确认此行程并清理本机副本", "Confirm this Trip and clean device copies"), role: .destructive) { removeSelected() }
            }
    }
    private func load() {
        clear(); guard let actor else { return }
        do { ids = try session.offlineTrips.savedTripIDs(scope: actor.scope); captured = actor; deadline = ProcessInfo.processInfo.systemUptime + 30 }
        catch { unavailable = true }
    }
    private func removeSelected() {
        guard let actor, actor == captured, let selected, ids.contains(selected), ProcessInfo.processInfo.systemUptime < deadline else { return }
        do {
            guard try session.offlineTrips.savedTripIDs(scope: actor.scope).contains(selected) else { throw NativeDataError.staleSessionResponse }
            let namespace = try NativeOfflineTripNamespace(scope: actor.scope, tripID: selected)
            try session.offlineTrips.removeTrip(namespace, scope: actor.scope)
            guard self.actor == actor, try !session.offlineTrips.savedTripIDs(scope: actor.scope).contains(selected),
                  try session.offlineTrips.readUserDraft(namespace, scope: actor.scope) == nil,
                  try session.offlineTrips.readLodging(namespace, scope: actor.scope) == nil else { throw NativeDataError.invalidResponse }
            coverage.recordDevice(moduleID: "offline", action: .delete, operationID: UUID().uuidString.lowercased(),
                                  selection: selected + t(" · 索引、草稿及住宿副本已核验；确认文本回执缺失", " · index, draft and lodging absence verified; confirmed-text receipt missing"), state: .partial, current: actor)
            load()
        } catch { unavailable = true }
    }
    private func clear() { ids = []; selected = nil; captured = nil; deadline = 0; unavailable = false; confirmation = false }
}
