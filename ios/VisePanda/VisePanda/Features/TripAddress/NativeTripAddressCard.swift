import SwiftUI

/// Online child of the existing Today snapshot. Each item retains its own sources.
struct NativeTripAddressCard: View {
    let detail: NativeTripDetail
    let day: NativeTripDay
    let store: NativeTripStore
    @Environment(AppSettings.self) private var settings
    private var chinese: Bool { settings.selectedLocale == .zh }
    var body: some View {
        VisePandaCard {
            VStack(alignment: .leading, spacing: 12) {
                Text(chinese ? "地址" : "Addresses").font(.headline)
                ForEach(day.items) { item in
                    NativeTripItemAddressView(detail: detail, dayID: day.id, item: item, store: store)
                }
            }
        }
    }
}

private struct NativeTripItemAddressView: View {
    let detail: NativeTripDetail
    let dayID: String
    let item: NativeTripItem
    let store: NativeTripStore
    @Environment(AppSettings.self) private var settings
    @Environment(\.scenePhase) private var phase
    @State private var support = NativeTripSupportStore()
    @State private var readGeneration = UUID()
    private var session: NativeSession { settings.nativeSession }
    private var chinese: Bool { settings.selectedLocale == .zh }
    private func text(_ en: String, _ zh: String) -> String { chinese ? zh : en }
    private var target: NativeTripSupportTarget? {
        guard phase == .active, let actor = session.dataScope, store.scope == actor,
              store.selectedID == detail.trip.id, store.detail?.trip.id == detail.trip.id,
              store.detail?.trip.headVersion == detail.trip.headVersion,
              detail.confirmationState == "confirmed" else { return nil }
        return .init(actor: actor, tripID: detail.trip.id, tripVersion: detail.trip.headVersion, dayID: dayID, itemID: item.id)
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(item.title).font(.subheadline.bold())
            if let target, support.target == target,
               let references = NativeTripAddressRead.references(support.read, target: target, current: session.dataScope) {
                if references.isEmpty {
                    Text(text("No qualified current address reference", "没有符合条件的当前地址参考")).foregroundStyle(.secondary)
                }
                ForEach(references) { entry in
                    if let lines = entry.claim?.value.lines {
                        Text(lines.joined(separator: "\n")).textSelection(.enabled)
                        Text(referenceLabel(lines)).font(.caption).foregroundStyle(.secondary)
                        ForEach(Array(entry.sourceRefs.enumerated()), id: \.offset) { _, reference in
                            Text(reference.revisionLabel + " · " + reference.sourceRevisionId).font(.caption2).textSelection(.enabled)
                        }
                        Text(text("Reference evidence; physical accuracy and translation are not verified here.", "来源参考；此处不验证实际准确性或翻译。")).font(.caption)
                    }
                }
            } else {
                Text(support.busy ? text("Loading address sources…", "正在读取地址来源…") : text("Address sources unavailable", "地址来源暂不可用"))
                    .foregroundStyle(.secondary)
            }
            if target != nil {
                if let address = item.userAddress {
                    Text(address.text).textSelection(.enabled)
                    Text(text("Provided by you · Unverified", "用户提供 · 未核验")).font(.caption).foregroundStyle(.secondary)
                } else {
                    Text(text("User address: Not provided", "用户地址：未提供")).foregroundStyle(.secondary)
                }
                NavigationLink(text("Add or edit an address", "补充或编辑地址")) {
                    NativeTripAddressEditor(detail: detail, dayID: dayID, item: item, store: store)
                }
                .accessibilityIdentifier("today.address.edit.\(item.id)")
                Button(text("Refresh sources", "刷新来源")) { Task { await refresh() } }.disabled(support.busy)
            }
        }
        .accessibilityIdentifier("today.address.item.\(item.id)")
        .task(id: target) { await refresh() }
        .onChange(of: target) { _, value in support.bind(value) }
        .onDisappear { readGeneration = UUID(); support.bind(nil) }
    }
    private func referenceLabel(_ lines: [String]) -> String {
        switch NativeAddressText.classify(lines) {
        case .containsChineseText: text("Current source reference · Contains Chinese text", "当前来源参考 · 含中文文字")
        case .notChinese: text("Current source reference · No Chinese text", "当前来源参考 · 不含中文文字")
        case .unknown: text("Current source reference · Chinese text unknown", "当前来源参考 · 中文文字未知")
        }
    }
    private func refresh() async {
        guard !support.busy else { return }
        let generation = UUID()
        readGeneration = generation
        support.bind(target)
        await support.refresh(current: { session.dataScope }, get: { try await session.tripSupportRead($0) })
        guard !Task.isCancelled, generation == readGeneration, let target,
              support.target == target, let read = support.read else { return }
        // One expiry invalidation; no polling or background source refresh.
        let expires = read.entries.compactMap { $0.claim }.flatMap(\.evidence)
            .compactMap { NativeKnowledgeRead.date($0.expiresAt) }.min()
        let lifetime = min(30, expires?.timeIntervalSinceNow ?? 30)
        do { try await Task.sleep(for: .seconds(max(0, lifetime))) } catch { return }
        guard generation == readGeneration, support.target == target else { return }
        support.bind(nil)
    }
}
