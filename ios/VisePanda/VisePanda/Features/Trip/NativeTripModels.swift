import Foundation

struct NativeTripSummary: Codable, Identifiable, Equatable {
    let id: String
    let title: String
    let headVersion: Int
    let updatedAt: String
}

struct NativeTripItem: Codable, Identifiable, Equatable {
    let id: String
    let dayId: String
    var title: String
    var startsAt: String?
    var endsAt: String?
}

struct NativeTripDay: Codable, Identifiable, Equatable {
    let id: String
    var date: String
    var timeZone: String?
    var items: [NativeTripItem]
}

struct NativeTripContent: Codable, Equatable { var days: [NativeTripDay] }
struct NativeTripDetail: Decodable {
    let version: Int
    let trip: NativeTripSummary
    let content: NativeTripContent
    let hardLocks: String
    let externalOrderStatus: String
    var confirmationState: String?
}
struct NativeTripList: Decodable {
    let version: Int
    let trips: [NativeTripSummary]
    let currentTripId: String?
}
struct NativeTripCreated: Decodable {
    let version: Int
    let trip: NativeTripSummary
    let reused: Bool
}
struct NativeProposalCreated: Decodable {
    let version: Int
    let proposalId: String
    let revision: Int
    let baseTripVersion: Int
}
struct NativeTripConfirmed: Decodable {
    let version: Int
    let outcome: String
    let resultingVersion: Int
}

struct NativeTripPatch: Codable, Equatable {
    var expectedVersion: Int
    let operations: [NativeTripOperation]
}

/// Optional keys are omitted when encoded, preserving the server's closed op schema.
struct NativeTripOperation: Codable, Equatable {
    enum Kind: String, Codable { case setTitle = "set_title", upsertDay = "upsert_day", deleteDay = "delete_day", upsertItem = "upsert_item", deleteItem = "delete_item" }
    let kind: Kind
    var title: String?
    var dayId: String?
    var date: String?
    var timeZone: String?
    var itemId: String?
    var startsAt: String?
    var endsAt: String?
}

struct NativeTripPending: Decodable {
    struct Proposal: Decodable, Identifiable {
        struct TitleDiff: Decodable { let before: String; let after: String }
        struct ItemDiff: Decodable { let kind: String; let itemId: String; let title: String }
        struct DayDiff: Decodable { let kind: String; let dayId: String; let date: String; let items: [ItemDiff] }
        let id: String
        let revision: Int
        let baseTripVersion: Int
        let status: String
        let createdAt: String
        let expiresAt: String
        let titleDiff: TitleDiff
        let dayDiffs: [DayDiff]
        let patch: NativeTripPatch
        let digest: String
        let stale: Bool
        let evidence: String
        let assumptions: String
    }
    let version: Int
    let trip: NativeTripSummary
    let proposal: Proposal
}

struct NativeTripDraft: Equatable, Identifiable {
    let id = UUID()
    let tripId: String
    let baseVersion: Int
    let baseTitle: String
    let baseContent: NativeTripContent
    var title: String
    var days: [NativeTripDay]

    init(_ detail: NativeTripDetail) {
        tripId = detail.trip.id
        baseVersion = detail.trip.headVersion
        baseTitle = detail.trip.title
        baseContent = detail.content
        title = detail.trip.title
        days = detail.content.days
    }

    var patch: NativeTripPatch {
        var operations: [NativeTripOperation] = []
        if title != baseTitle { operations.append(.init(kind: .setTitle, title: title)) }
        let oldDays = Dictionary(uniqueKeysWithValues: baseContent.days.map { ($0.id, $0) })
        let newDayIDs = Set(days.map(\.id))
        for day in baseContent.days where !newDayIDs.contains(day.id) {
            operations.append(.init(kind: .deleteDay, dayId: day.id))
        }
        for day in days {
            let old = oldDays[day.id]
            if old == nil || old?.date != day.date || old?.timeZone != day.timeZone {
                operations.append(.init(kind: .upsertDay, dayId: day.id, date: day.date, timeZone: day.timeZone))
            }
            let previousItems = Dictionary(uniqueKeysWithValues: (old?.items ?? []).map { ($0.id, $0) })
            let newItemIDs = Set(day.items.map(\.id))
            for item in old?.items ?? [] where !newItemIDs.contains(item.id) {
                operations.append(.init(kind: .deleteItem, dayId: day.id, itemId: item.id))
            }
            for item in day.items where previousItems[item.id] != item {
                operations.append(.init(kind: .upsertItem, title: item.title, dayId: day.id, itemId: item.id, startsAt: item.startsAt, endsAt: item.endsAt))
            }
        }
        return .init(expectedVersion: baseVersion, operations: operations)
    }

    mutating func addDay() {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        var date = Date()
        if let last = days.map(\.date).sorted().last, let parsed = formatter.date(from: last) {
            date = parsed.addingTimeInterval(86_400)
        }
        days.append(.init(id: UUID().uuidString, date: formatter.string(from: date), items: []))
    }

    mutating func addItem(to dayID: String) {
        guard let index = days.firstIndex(where: { $0.id == dayID }) else { return }
        days[index].items.append(.init(id: UUID().uuidString, dayId: dayID, title: ""))
    }
}
