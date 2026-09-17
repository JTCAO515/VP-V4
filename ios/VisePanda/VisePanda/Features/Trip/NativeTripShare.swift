import Foundation

/// Explicit opt-in: free text can contain hotel, room, order or companion details.
/// Nothing attempts to classify or silently redact an arbitrary user title.
struct NativeTripShareSelection: Equatable {
    struct Item: Hashable { let dayID: String; let itemID: String }
    var dayID: String? = nil
    var includeTitle = false
    var includeDates = false
    var items: Set<Item> = []
}

/// Only this allowlisted, immutable value reaches the image renderer.
/// No Trip/owner IDs, credentials, preferences, orders or hidden text are exported.
struct NativeTripShareCard: Equatable {
    struct Row: Equatable {
        let day: String
        let title: String?
    }
    let title: String
    let version: Int
    let exportedAt: String
    let disclosure: String
    let rows: [Row]
    let chinese: Bool

    static func make(from detail: NativeTripDetail, selection: NativeTripShareSelection,
                     chinese: Bool, now: Date) -> Self? {
        guard detail.confirmationState == "confirmed",
              selection.dayID == nil || detail.content.days.contains(where: { $0.id == selection.dayID }) else { return nil }
        var rows: [Row] = []
        for (index, day) in detail.content.days.enumerated() where selection.dayID == nil || selection.dayID == day.id {
            let heading = selection.includeDates ? day.date : (chinese ? "第 \(index + 1) 天" : "Day \(index + 1)")
            let items = day.items.filter { selection.items.contains(.init(dayID: day.id, itemID: $0.id)) }
            if items.isEmpty { rows.append(.init(day: heading, title: nil)) }
            else { rows += items.map { .init(day: heading, title: $0.title) } }
        }
        return Self(title: selection.includeTitle ? detail.trip.title : (chinese ? "我的旅行计划" : "My trip plan"),
                    version: detail.trip.headVersion,
                    exportedAt: ISO8601DateFormatter().string(from: now),
                    disclosure: chinese ? "用户选取的已确认计划 · 可能含 AI 生成内容\n不是订单凭证或旅行体验证明" : "User-selected confirmed plan · May include AI-generated content\nNot a booking receipt or a travel testimonial",
                    rows: rows, chinese: chinese)
    }

    /// One template, paginated without truncation for an entire itinerary.
    var pages: [[Row]] {
        if rows.isEmpty { return [[]] }
        return stride(from: 0, to: rows.count, by: 4).map { Array(rows[$0..<min($0 + 4, rows.count)]) }
    }
}

/// Snapshot identity remains local and is never included in the shared image.
struct NativeTripShareSource: Identifiable {
    let id = UUID()
    let scope: NativeDataScope
    let detail: NativeTripDetail

    func matches(scope currentScope: NativeDataScope?, detail current: NativeTripDetail?) -> Bool {
        guard currentScope == scope, let current else { return false }
        return current.confirmationState == "confirmed" && current.trip == detail.trip && current.content == detail.content
    }
}
