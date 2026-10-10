import Foundation

/// Closed projection of the sole TS candidate 0f1572f2, concept accepted by Main.
/// Shared parser/API registration requires its separate exact lease.
struct NativeTravelDirectionsIntake: Codable, Equatable {
    let schemaVersion: String
    let destinations: [String]
    let durationDays: Int?
    let interests: [String]
    let currentPace: String?
    let budget: Budget?
    let dates: Dates?
    let intent: String
    struct Budget: Codable, Equatable { let currency: String; let totalMinorUnits: Int }
    struct Dates: Codable, Equatable { let startDate: String; let endDate: String }

    static func decode(_ raw: [String: Any]) throws -> Self {
        let keys: Set<String> = ["schemaVersion", "destinations", "durationDays", "interests", "currentPace", "budget", "dates", "intent"]
        guard Set(raw.keys) == keys, raw["schemaVersion"] as? String == "travel-directions-intake/1",
              let destinations = raw["destinations"] as? [String], destinations.count <= 30,
              Set(destinations).count == destinations.count, destinations.allSatisfy({ validText($0, max: 80) }),
              raw["durationDays"] is NSNull || NativeFiveResultContent.integer(raw["durationDays"], maximum: 30) != nil,
              let interests = raw["interests"] as? [String], interests.count <= 8,
              Set(interests).count == interests.count, interests.allSatisfy({ validText($0, max: 40) }),
              raw["currentPace"] is NSNull || ["relaxed", "balanced", "packed"].contains(raw["currentPace"] as? String ?? ""),
              ["explore", "specific"].contains(raw["intent"] as? String ?? "") else { throw NativeDataError.invalidResponse }
        if !(raw["budget"] is NSNull) {
            guard let budget = raw["budget"] as? [String: Any], Set(budget.keys) == Set(["currency", "totalMinorUnits"]),
                  ["CNY", "USD", "EUR", "GBP"].contains(budget["currency"] as? String ?? ""),
                  NativeFiveResultContent.integer(budget["totalMinorUnits"], maximum: 10_000_000) != nil else { throw NativeDataError.invalidResponse }
        }
        if !(raw["dates"] is NSNull) {
            guard let dates = raw["dates"] as? [String: Any], Set(dates.keys) == Set(["startDate", "endDate"]),
                  let start = dates["startDate"] as? String, let end = dates["endDate"] as? String,
                  let duration = NativeFiveResultContent.integer(raw["durationDays"], maximum: 30),
                  NativeTravelIntake.validDates(.init(startDate: start, endDate: end)),
                  dateDistance(start, end) == duration - 1 else { throw NativeDataError.invalidResponse }
        }
        return try JSONDecoder().decode(Self.self, from: JSONSerialization.data(withJSONObject: raw))
    }

    static func validText(_ text: String, max: Int) -> Bool {
        !text.isEmpty && text == text.trimmingCharacters(in: .whitespacesAndNewlines)
            && text.utf16.count <= max && !text.unicodeScalars.contains(where: { $0.value < 32 })
    }
    static func dateDistance(_ start: String, _ end: String) -> Int? {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.calendar = Calendar(identifier: .gregorian)
        f.timeZone = TimeZone(secondsFromGMT: 0)
        f.dateFormat = "yyyy-MM-dd"
        f.isLenient = false
        guard let s = f.date(from: start), let e = f.date(from: end),
              f.string(from: s) == start, f.string(from: e) == end else { return nil }
        return Int(e.timeIntervalSince(s) / 86400)
    }
}

struct NativeTravelDirectionsContent: Decodable {
    let schemaVersion: String
    let title: String
    let summary: String
    let intake: NativeTravelDirectionsIntake
    let directions: [Direction]
    let selectedDirectionId: String?
    let draft: Draft?
    struct Direction: Decodable { let id: String; let title: String; let tradeoff: String }
    struct Draft: Decodable {
        let directionId: String
        let requestedDays: Int?
        let days: [Day]
        let coverage: String
        let limitations: [String]
        let pace: String?
        let paceSource: String
    }
    struct Day: Decodable { let ordinal: Int; let destination: String; let activities: [String] }

    static func decode(_ raw: [String: Any]) throws -> Self {
        guard Set(raw.keys) == Set(["schemaVersion", "title", "summary", "intake", "directions", "selectedDirectionId", "draft", "actions"]),
              raw["schemaVersion"] as? String == "travel-directions/1",
              (raw["title"] as? String).map({ NativeTravelDirectionsIntake.validText($0, max: 120) }) == true,
              (raw["summary"] as? String).map({ NativeTravelDirectionsIntake.validText($0, max: 1000) }) == true,
              let intake = raw["intake"] as? [String: Any],
              let directions = raw["directions"] as? [[String: Any]], (1...2).contains(directions.count),
              let actions = raw["actions"] as? [Any], actions.isEmpty else { throw NativeDataError.invalidResponse }
        let input = try NativeTravelDirectionsIntake.decode(intake)
        let ids = try directions.map { option -> String in
            guard Set(option.keys) == Set(["id", "title", "tradeoff"]), let id = option["id"] as? String,
                  ["depth", "breadth"].contains(id), (option["title"] as? String).map({ NativeTravelDirectionsIntake.validText($0, max: 120) }) == true,
                  (option["tradeoff"] as? String).map({ NativeTravelDirectionsIntake.validText($0, max: 500) }) == true else { throw NativeDataError.invalidResponse }
            return id
        }
        guard Set(ids).count == ids.count, input.intent == "specific" ? ids.count == 1 : ids.count == 2,
              raw["selectedDirectionId"] is NSNull || ids.contains(raw["selectedDirectionId"] as? String ?? "") else { throw NativeDataError.invalidResponse }
        if !(raw["draft"] is NSNull) {
            guard let selected = raw["selectedDirectionId"] as? String, let draft = raw["draft"] as? [String: Any],
                  Set(draft.keys) == Set(["directionId", "requestedDays", "days", "coverage", "limitations", "pace", "paceSource"]),
                  draft["directionId"] as? String == selected,
                  draft["requestedDays"] is NSNull || NativeFiveResultContent.integer(draft["requestedDays"], maximum: 30) != nil,
                  let days = draft["days"] as? [[String: Any]], days.count <= 30,
                  let limitations = draft["limitations"] as? [String], !limitations.isEmpty,
                  limitations.count <= 10, Set(limitations).count == limitations.count,
                  limitations.allSatisfy({ NativeTravelDirectionsIntake.validText($0, max: 3000) }),
                  ["complete_relative", "partial_relative"].contains(draft["coverage"] as? String ?? ""),
                  draft["pace"] is NSNull || ["relaxed", "balanced", "packed"].contains(draft["pace"] as? String ?? ""),
                  ["current_input", "profile", "none"].contains(draft["paceSource"] as? String ?? "") else { throw NativeDataError.invalidResponse }
            let requested = NativeFiveResultContent.integer(draft["requestedDays"], maximum: 30)
            let expectedDays = input.durationDays != nil && !input.destinations.isEmpty ? input.durationDays! : 0
            let expectedCoverage = expectedDays > 0 && input.destinations.count <= expectedDays ? "complete_relative" : "partial_relative"
            guard requested == input.durationDays, days.count == expectedDays,
                  draft["coverage"] as? String == expectedCoverage else { throw NativeDataError.invalidResponse }
            for (index, day) in days.enumerated() {
                guard Set(day.keys) == Set(["ordinal", "destination", "activities"]),
                      NativeFiveResultContent.integer(day["ordinal"], maximum: 30) == index + 1,
                      let destination = day["destination"] as? String, NativeTravelDirectionsIntake.validText(destination, max: 80),
                      let activities = day["activities"] as? [String], (1...8).contains(activities.count),
                      Set(activities).count == activities.count,
                      activities.allSatisfy({ NativeTravelDirectionsIntake.validText($0, max: 160) }) else { throw NativeDataError.invalidResponse }
            }
            let source = draft["paceSource"] as? String
            if source == "current_input" { guard draft["pace"] as? String == input.currentPace, input.currentPace != nil else { throw NativeDataError.invalidResponse } }
            if source == "none" { guard draft["pace"] is NSNull else { throw NativeDataError.invalidResponse } }
            if source == "profile" { guard !(draft["pace"] is NSNull), input.currentPace == nil else { throw NativeDataError.invalidResponse } }
            if input.currentPace != nil { guard source == "current_input" else { throw NativeDataError.invalidResponse } }
        }
        let bytes = try JSONSerialization.data(withJSONObject: raw)
        guard bytes.count <= 65_536 else { throw NativeDataError.invalidResponse }
        return try JSONDecoder().decode(Self.self, from: bytes)
    }
}
