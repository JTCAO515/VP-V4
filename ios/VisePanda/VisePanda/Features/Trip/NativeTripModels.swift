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
enum NativeTripHardLockState: String, Decodable { case notEnabled = "not_enabled" }
enum NativeTripExternalOrderState: String, Decodable { case notConnected = "not_connected" }
struct NativeTripDetail: Decodable {
    let version: Int
    let trip: NativeTripSummary
    let content: NativeTripContent
    let hardLocks: NativeTripHardLockState
    let externalOrderStatus: NativeTripExternalOrderState
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

    /// Bind an uncommitted relative outline to calendar dates only after the user supplies one.
    /// Existing days are never replaced by this operation.
    mutating func appendOutline(_ titles: [String], starting rawDate: String) -> Bool {
        guard (2...7).contains(titles.count), titles.allSatisfy({ !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && $0.count <= 160 }) else { return false }
        guard let utc = TimeZone(secondsFromGMT: 0) else { return false }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = utc
        formatter.isLenient = false
        formatter.dateFormat = "yyyy-MM-dd"
        guard rawDate.count == 10, let start = formatter.date(from: rawDate), formatter.string(from: start) == rawDate else { return false }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = utc
        let dates = (0..<titles.count).compactMap { offset in calendar.date(byAdding: .day, value: offset, to: start).map(formatter.string(from:)) }
        guard dates.count == titles.count, Set(dates).count == dates.count,
              Set(dates).isDisjoint(with: days.map(\.date)) else { return false }
        for (date, title) in zip(dates, titles) {
            let dayID = UUID().uuidString
            days.append(.init(id: dayID, date: date, timeZone: "Asia/Shanghai", items: [
                .init(id: UUID().uuidString, dayId: dayID, title: title.trimmingCharacters(in: .whitespacesAndNewlines))
            ]))
        }
        return true
    }
}

/// Deliberately bounded outline, with no inferred venue, opening hour, route or feasibility.
struct NativeRelativeOutline: Equatable {
    let city: String
    let count: Int
    let foodFirst: [String]
    let walkFirst: [String]
    let includesFood: Bool
    let includesWalking: Bool

    var hasAlternatives: Bool { includesFood && includesWalking }
    var initialTitles: [String] { includesFood ? foodFirst : walkFirst }

    static func make(from request: String, chinese: Bool) -> Self? {
        guard request.utf16.count <= 4000 else { return nil }
        let cities = [("上海", "Shanghai"), ("北京", "Beijing"), ("广州", "Guangzhou"), ("重庆", "Chongqing")]
        let matches = cities.filter { request.contains($0.0) || request.localizedCaseInsensitiveContains($0.1) }
        guard matches.count == 1, let city = matches.first else { return nil }
        guard let interests = explicitInterests(in: request), interests.food || interests.walking,
              let count = explicitDayCount(in: request) else { return nil }
        let foodInterest = interests.food
        let walkInterest = interests.walking
        let name = chinese ? city.0 : city.1
        let food = chinese ? "选择一个美食片区，地点与营业时间待核" : "Choose one food area; venues and hours to verify"
        let walk = chinese ? "选择一条街区散步路线，距离与开放条件待核" : "Choose a neighborhood walk; route and access to verify"
        let arrival = chinese ? "轻松熟悉城市，抵达时间待定" : "Settle in gently; arrival time unknown"
        let departure = chinese ? "保留弹性收尾，离开时间待定" : "Keep a flexible final day; departure time unknown"
        return .init(city: name, count: count,
                     foodFirst: (0..<count).map { $0 == 0 && count > 2 ? arrival : ($0 == count - 1 ? departure : food) },
                     walkFirst: (0..<count).map { $0 == 0 && count > 2 ? arrival : ($0 == count - 1 ? departure : walk) },
                     includesFood: foodInterest, includesWalking: walkInterest)
    }

    /// Read complete quantity spans. Never choose one side of a range or an
    /// alternative, nor recover a supported suffix from an unsupported number.
    private static func explicitDayCount(in request: String) -> Int? {
        let word = #"\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)\b"#
        let quantity = #"(?:[+-]?[0-9]+(?:\.[0-9]+)?|[零〇一二两三四五六七八九十百千万]+|"# + word + #"(?:[\s-]+"# + word + #")*)"#
        let unit = #"(?:days?\b|天)"#
        let alternatives = quantity + #"\s*(?:days?\b|天)?\s*(?:or\b|and\b|to\b|[-–—~/]|或者|或|到|至)\s*"# + quantity + #"\s*"# + unit
        guard regexMatches(alternatives, in: request).isEmpty else { return nil }
        let mentions = regexMatches("(" + quantity + #")\s*"# + unit, in: request)
        guard !mentions.isEmpty else { return nil }
        let supported = ["2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7,
                         "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7,
                         "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7]
        let source = request as NSString
        var counts = Set<Int>()
        for mention in mentions {
            let token = source.substring(with: mention.range(at: 1)).lowercased()
            guard let count = supported[token] else { return nil }
            counts.insert(count)
        }
        return counts.count == 1 ? counts.first : nil
    }

    /// A small explicit vocabulary, not general intent classification. Conflicting
    /// mentions and shared negation need clarification rather than a guessed plan.
    private static func explicitInterests(in request: String) -> (food: Bool, walking: Bool)? {
        let food = #"(?:美食|吃|\bfood\b)"#
        let walking = #"(?:散步|步行|\bwalk(?:s|ing)?\b)"#
        let negation = #"(?:\b(?:(?:do\s+not|don['’]t)(?:\s+(?:want|like))?|not\s+interested\s+in|no|not|without|avoid|skip)(?:\s+any)?\s+|(?:不想要?|不要|不喜欢|不安排|避免|不)\s*)"#
        let either = "(?:" + food + "|" + walking + ")"
        let sharedNegation = negation + either + #"\s*(?:and\b|or\b|和|或|、)\s*"# + either
        let doubleNegation = "(?:" + negation + #"|(?:不是|并非)\s*)"# + negation + either
        guard regexMatches(sharedNegation, in: request).isEmpty,
              regexMatches(doubleNegation, in: request).isEmpty else { return nil }
        let remaining = request.replacingOccurrences(of: negation + either, with: " ", options: [.regularExpression, .caseInsensitive])
        // Do not turn unhandled qualifiers such as "no long walks" or
        // "not only walks" or "不要长时间步行" into a positive preference.
        guard regexMatches(negation + #"(?:(?:[a-z]+\s+){0,3}|[\p{Han}]+\s*)"# + either, in: remaining).isEmpty else { return nil }

        func interest(_ keyword: String) -> Bool? {
            let mentions = regexMatches(keyword, in: request)
            let excluded = regexMatches(negation + keyword, in: request)
            // Each recognized exclusion covers exactly one keyword occurrence.
            let positiveCount = mentions.count - excluded.count
            guard excluded.isEmpty || positiveCount == 0 else { return nil }
            return excluded.isEmpty && positiveCount > 0
        }
        guard let includesFood = interest(food), let includesWalking = interest(walking) else { return nil }
        return (includesFood, includesWalking)
    }

    private static func regexMatches(_ pattern: String, in request: String) -> [NSTextCheckingResult] {
        guard let expression = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive) else { return [] }
        return expression.matches(in: request, range: NSRange(request.startIndex..., in: request))
    }
}

/// Lifecycle is read separately so an unavailable archive API cannot erase a saved Trip.
struct NativeTripArchive: Decodable, Equatable {
    let tripId: String
    let archivedVersion: Int
    let archivedAt: String
}
struct NativeTripArchiveReply: Decodable {
    let version: Int
    let archive: NativeTripArchive?
}
