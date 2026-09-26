import SwiftUI

struct TodayView: View {
    private let quickActions: [CapabilityKind] = [.translation, .addressCard, .safePhrase, .tripPlanning]
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    private var columns: [GridItem] {
        Array(repeating: GridItem(.flexible()), count: dynamicTypeSize.isAccessibilitySize ? 1 : 2)
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: VPSpacing.section) {
                BrandHeader()
                hero
                PreviewStatusBanner()

                Text("today.quick_actions")
                    .font(.title3.weight(.bold))

                LazyVGrid(columns: columns, spacing: 12) {
                    ForEach(quickActions) { capability in
                        CapabilityCard(capability: capability)
                    }
                }
            }
            .padding(.horizontal, VPSpacing.standard)
            .padding(.vertical, VPSpacing.standard)
        }
        .background(Color.vpBackground)
        .vpNavigationTitle("tab.today")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var hero: some View {
        VisePandaCard {
            VStack(alignment: .leading, spacing: 14) {
                Text("today.eyebrow")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(Color.vpBrand)
                    .textCase(.uppercase)

                Text("today.title")
                    .font(.largeTitle.weight(.bold))
                    .tracking(-0.8)
                    .fixedSize(horizontal: false, vertical: true)

                Text("today.subtitle")
                    .font(.body)
                    .foregroundStyle(.secondary)

                NavigationLink(value: AppRoute.capability(.tripPlanning)) {
                    Label("today.start", systemImage: "arrow.right")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .foregroundStyle(.white)
                        .background(Color.vpBrandFill, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .buttonStyle(SoftPressButtonStyle())
            }
        }
    }
}

#Preview {
    NavigationStack { TodayView() }
}

/// A read-only view of the same owner-scoped, confirmed Trip snapshot used by Trip.
/// No Today-specific persistence or place-provider response is treated as saved Trip data.
struct NativeTodayView: View {
    let store: NativeTripStore
    let tripID: String
    @Environment(AppSettings.self) private var settings
    @Environment(\.scenePhase) private var phase
    @State private var detail: NativeTripDetail?
    @State private var readAt: Date?
    @State private var loading = false
    @State private var unavailable = false

    private var chinese: Bool { settings.selectedLocale == .zh }
    private var session: NativeSession { settings.nativeSession }
    private func text(_ en: String, _ zh: String) -> String { chinese ? zh : en }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: VPSpacing.section) {
                if let detail, session.dataScope != nil, store.scope == session.dataScope,
                   store.selectedID == tripID, store.detail?.trip.headVersion == detail.trip.headVersion {
                    confirmed(detail)
                } else if loading {
                    ProgressView(text("Loading confirmed Trip…", "正在读取已确认行程…"))
                } else if unavailable {
                    Text(text("The confirmed Trip cannot be read right now. Reconnect and refresh.", "目前无法读取已确认行程。请联网后刷新。"))
                        .accessibilityIdentifier("today.unavailable")
                } else {
                    Text(text("There is no confirmed Trip to show.", "目前没有可展示的已确认行程。"))
                        .accessibilityIdentifier("today.noConfirmedTrip")
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(VPSpacing.standard)
        }
        .background(Color.vpBackground)
        .navigationTitle(text("Today", "今日"))
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button(text("Refresh", "刷新")) { Task { await refresh() } }
                    .disabled(loading || session.dataScope == nil)
                    .accessibilityIdentifier("today.refresh")
            }
        }
        .refreshable { await refresh() }
        .task(id: session.dataScope) { await refresh() }
        .onChange(of: phase) { _, value in
            if value == .active { Task { await refresh() } }
        }
        .onChange(of: session.retainedDataScope) { _, _ in
            detail = nil
            readAt = nil
            unavailable = false
        }
    }

    private func confirmed(_ detail: NativeTripDetail) -> some View {
        let selection = NativeTodaySelection.select(detail: detail, now: Date())
        return VStack(alignment: .leading, spacing: VPSpacing.section) {
            VisePandaCard {
                VStack(alignment: .leading, spacing: 10) {
                    Text(detail.trip.title).font(.title2.bold())
                    Text(text("Confirmed Trip · version \(detail.trip.headVersion)", "已确认行程 · 版本 \(detail.trip.headVersion)"))
                        .font(.subheadline)
                        .accessibilityIdentifier("today.version")
                    if let readAt {
                        Text(text("Last online read: ", "最近联网读取：") + readAt.formatted(.dateTime.year().month().day().hour().minute().locale(settings.selectedLocale.locale)))
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .accessibilityIdentifier("today.lastRead")
                    }
                    Text(text("Refresh to check for changes. Today has no offline copy.", "刷新可检查更新；今日页尚未保存离线副本。"))
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            VisePandaCard {
                VStack(alignment: .leading, spacing: 12) {
                    switch selection {
                    case .day(let day, let isToday):
                        Text(isToday ? text("Today's schedule", "今日日程") : text("Next dated schedule", "下一日程"))
                            .font(.headline)
                        Text(day.date).font(.title3.bold()).accessibilityIdentifier("today.date")
                        ForEach(day.items) { item in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(item.title).font(.body).textSelection(.enabled)
                                    .accessibilityIdentifier("today.item.\(item.id)")
                                if let startsAt = item.startsAt { Text(startsAt).font(.caption) }
                                if let endsAt = item.endsAt { Text(endsAt).font(.caption) }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    case .noDates:
                        Text(text("This confirmed Trip has no dates yet.", "这份已确认行程尚无日期。"))
                            .accessibilityIdentifier("today.empty.noDates")
                    case .noItems:
                        Text(text("The confirmed dates have no scheduled items.", "已确认日期中尚无日程项目。"))
                            .accessibilityIdentifier("today.empty.noItems")
                    case .complete:
                        Text(text("There are no remaining dated items in this Trip.", "这份行程没有剩余的有日期项目。"))
                            .accessibilityIdentifier("today.empty.complete")
                    case .incomplete:
                        Text(text("A date or time zone is missing, so Today cannot select a schedule reliably. The saved items remain in Trip.", "日期或时区不完整，今日页无法可靠选择日程；已保存项目仍可在行程页查看。"))
                            .accessibilityIdentifier("today.empty.incomplete")
                    }
                }
            }
            VisePandaCard {
                VStack(alignment: .leading, spacing: 10) {
                    Text(text("Chinese address", "中文地址")).font(.headline)
                    Text(text("No Chinese address is stored in this confirmed Trip version. Any address written in an item title remains visible above; check the exact place before travel.", "此确认版本没有单独保存中文地址。若项目标题写有地址，仍会显示在上方；出行前请核对准确地点。"))
                        .foregroundStyle(.secondary)
                        .accessibilityIdentifier("today.address.unavailable")
                }
            }
            VisePandaCard {
                VStack(alignment: .leading, spacing: 10) {
                    Text(text("Preparation", "出行准备")).font(.headline)
                    Text(text("No preparation result is saved to this Trip. The available check covers carrier SIM documents and uses current evidence.", "此行程未保存准备检查结果。当前可用检查仅针对运营商 SIM 证件，并按现有依据判断。"))
                        .foregroundStyle(.secondary)
                    NavigationLink(text("Check carrier SIM documents", "检查运营商 SIM 证件")) {
                        NativeReadinessView(tripID: detail.trip.id, tripVersion: detail.trip.headVersion)
                    }
                    .accessibilityIdentifier("today.readiness")
                }
            }
        }
    }

    private func refresh() async {
        guard !loading, let owner = session.dataScope else {
            detail = nil
            readAt = nil
            return
        }
        loading = true
        detail = nil
        readAt = nil
        unavailable = false
        let refreshed = await store.refreshForSharing(using: session)
        guard !Task.isCancelled, session.dataScope == owner, store.scope == owner else {
            loading = false
            return
        }
        if refreshed, let current = store.detail, store.selectedID == tripID,
           current.trip.id == tripID, current.confirmationState == "confirmed", store.notice == nil {
            detail = current
            readAt = Date()
        } else {
            unavailable = true
        }
        loading = false
    }
}

enum NativeTodaySelection {
    case day(NativeTripDay, Bool)
    case noDates
    case noItems
    case complete
    case incomplete

    static func select(detail: NativeTripDetail, now: Date) -> Self {
        let days = detail.content.days
        guard !days.isEmpty else { return .noDates }
        var candidates: [(NativeTripDay, String)] = []
        var itemCount = 0
        for day in days {
            guard let zoneID = day.timeZone, let zone = TimeZone(identifier: zoneID),
                  validDate(day.date) else { return .incomplete }
            var calendar = Calendar(identifier: .gregorian)
            calendar.timeZone = zone
            let local = calendar.dateComponents([.year, .month, .day], from: now)
            guard let year = local.year, let month = local.month, let date = local.day else { return .incomplete }
            let today = String(format: "%04d-%02d-%02d", year, month, date)
            itemCount += day.items.count
            if day.date >= today, !day.items.isEmpty { candidates.append((day, today)) }
        }
        guard itemCount > 0 else { return .noItems }
        guard let selected = candidates.sorted(by: { $0.0.date < $1.0.date || ($0.0.date == $1.0.date && $0.0.id < $1.0.id) }).first else { return .complete }
        return .day(selected.0, selected.0.date == selected.1)
    }

    private static func validDate(_ raw: String) -> Bool {
        guard raw.count == 10 else { return false }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.isLenient = false
        return formatter.date(from: raw).map { formatter.string(from: $0) == raw } ?? false
    }
}

// Native list keeps long labels readable at accessibility text sizes.
struct ToolsView: View {
    @Environment(AppSettings.self) private var settings
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        List {
            PreviewStatusBanner()
            NavigationLink(destination: NativeHotelHandoffView()) {
                HStack {
                    if !dynamicTypeSize.isAccessibilitySize {
                        Image(systemName: "bed.double").accessibilityHidden(true)
                    }
                    Text(settings.selectedLocale == .zh ? "酒店搜索" : "Hotel search")
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(minHeight: 44)
            }
            .accessibilityIdentifier("tools.hotels")
            ForEach([CapabilityKind.translation, .addressCard, .safePhrase]) { capability in
                NavigationLink(value: AppRoute.capability(capability)) {
                    HStack {
                        if !dynamicTypeSize.isAccessibilitySize {
                            Image(systemName: capability.systemImage)
                                .accessibilityHidden(true)
                        }
                        VPReadableText(capability.titleKey)
                    }
                    .frame(minHeight: 44)
                }
            }
        }
        .vpNavigationTitle("tab.tools")
    }
}
