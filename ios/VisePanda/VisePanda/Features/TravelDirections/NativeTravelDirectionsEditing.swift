import Foundation

/// Presentation values only. The server's unique directions wire owns persistence
/// and qualification; these values never constitute a current-source grant.
struct NativeTravelDirectionDay: Identifiable, Equatable {
    let id: String
    let relativeDay: Int
    var city: String
    var activities: [String]
    let fixed: Bool
}

struct NativeTravelDirectionOption: Identifiable, Equatable {
    let id: String
    let title: String
    let tradeoff: String
    let days: [NativeTravelDirectionDay]
}

struct NativeTravelDirectionsEditing: Equatable {
    private(set) var base: [NativeTravelDirectionDay]
    private(set) var days: [NativeTravelDirectionDay]

    init(days: [NativeTravelDirectionDay]) {
        base = days
        self.days = days
    }

    var valid: Bool {
        (0...30).contains(days.count) && Set(days.map(\.id)).count == days.count
            && days.enumerated().allSatisfy { index, day in
                day.relativeDay == index + 1 && !day.id.isEmpty
                    && NativeTravelDirectionsIntake.validText(day.city, max: 80)
                    && (1...8).contains(day.activities.count)
                    && Set(day.activities).count == day.activities.count
                    && day.activities.allSatisfy(Self.validTitle)
            }
    }

    var changedIDs: [String] {
        zip(base, days).compactMap { original, edited in original == edited ? nil : edited.id }
    }

    var hasChanges: Bool { !changedIDs.isEmpty }

    mutating func edit(id: String, activity: Int, title: String) {
        guard let index = days.firstIndex(where: { $0.id == id }), !days[index].fixed, days[index].activities.indices.contains(activity) else { return }
        days[index].activities[activity] = title
    }

    mutating func editDestination(id: String, city: String) {
        guard let index = days.firstIndex(where: { $0.id == id }), !days[index].fixed else { return }
        days[index].city = city
    }

    mutating func discard() { days = base }

    static func validTitle(_ title: String) -> Bool {
        NativeTravelDirectionsIntake.validText(title, max: 160)
    }
}

/// Converts explicitly dated relative days into a new local Trip draft. No network
/// action, proposal confirmation, fake clock time or replacement of existing days.
enum NativeTravelDirectionsDateBinding {
    enum Failure: Error, Equatable { case invalidDays, invalidDate, overlap, capacity }

    static func draft(days: [NativeTravelDirectionDay], starting rawDate: String,
                      detail: NativeTripDetail) throws -> NativeTripDraft {
        guard !days.isEmpty, NativeTravelDirectionsEditing(days: days).valid else { throw Failure.invalidDays }
        guard let utc = TimeZone(secondsFromGMT: 0) else { throw Failure.invalidDate }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = utc
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.isLenient = false
        guard rawDate.utf16.count == 10, let start = formatter.date(from: rawDate),
              formatter.string(from: start) == rawDate else { throw Failure.invalidDate }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = utc
        let dates = (0..<days.count).compactMap { offset in
            calendar.date(byAdding: .day, value: offset, to: start).map(formatter.string(from:))
        }
        guard dates.count == days.count, dates.allSatisfy({ $0.utf16.count == 10 }),
              Set(dates).count == dates.count else { throw Failure.invalidDate }
        guard Set(dates).isDisjoint(with: detail.content.days.map(\.date)) else { throw Failure.overlap }
        // The result/Trip handoff keeps its existing 30-day envelope. Never silently
        // choose the first seven days, or overwrite a saved day to fit the envelope.
        guard detail.content.days.count + days.count <= 30 else { throw Failure.capacity }
        var draft = NativeTripDraft(detail)
        for (day, date) in zip(days, dates) {
            let dayID = UUID().uuidString.lowercased()
            draft.days.append(.init(id: dayID, date: date, timeZone: "Asia/Shanghai", items: day.activities.map { activity in
                .init(id: UUID().uuidString.lowercased(), dayId: dayID,
                      title: activity.trimmingCharacters(in: .whitespacesAndNewlines))
            }))
        }
        return draft
    }
}

/// In-memory preview only. Saved result, user edits and confirmed Trip remain
/// the original values. No conversion to current_input or calendar-date binding.
enum NativeTravelDirectionsLocalPacePreview {
    static func days(_ original: [NativeTravelDirectionsContent.Day], pace: NativeTravelPace,
                     chinese: Bool) -> [NativeTravelDirectionDay] {
        original.map { day in
            let themes: [String]
            switch pace {
            case .relaxed:
                themes = day.ordinal.isMultiple(of: 2)
                    ? [chinese ? "保留自由时间，具体活动待定" : "Leave free time; activities undecided"]
                    : Array(day.activities.prefix(1))
            case .balanced:
                themes = Array(day.activities.prefix(1))
            case .packed:
                themes = day.activities.count >= 2 ? Array(day.activities.prefix(2))
                    : day.activities + [chinese ? "第二个兴趣主题待确认" : "A second interest theme to decide"]
            }
            return .init(id: "local_preview_\(day.ordinal)", relativeDay: day.ordinal, city: day.destination,
                         activities: themes, fixed: true)
        }
    }
}
