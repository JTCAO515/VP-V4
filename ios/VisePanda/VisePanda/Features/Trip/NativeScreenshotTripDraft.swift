import CryptoKit
import Foundation

enum NativeScreenshotTripDraft {
    enum Result {
        case ready(NativeTripDraft, [NativeScreenshotFieldKind: State])
        case duplicate
        case invalid
    }

    enum State { case added, duplicate, conflict }

    static func make(detail: NativeTripDetail, digest: String,
                     corrections: [NativeScreenshotCorrection]) -> Result {
        guard digest.count == 64, digest.allSatisfy({ $0.isHexDigit }),
              corrections.count <= 4,
              Set(corrections.map(\.kind)).count == corrections.count,
              let date = corrections.first(where: { $0.kind == .date })?.correctedValue,
              NativeScreenshotComparison.validDate(date),
              corrections.allSatisfy({ $0.sourceLine > 0 && !$0.sourceText.isEmpty && !$0.correctedValue.isEmpty }) else {
            return .invalid
        }
        var draft = NativeTripDraft(detail)
        let generatedDayID = stableID(detail.trip.id, digest, "day")
        let matchedDay = draft.days.firstIndex(where: { $0.date == date })
        let priorDay = draft.days.firstIndex(where: { $0.id == generatedDayID })
        if let matchedDay, let priorDay, matchedDay != priorDay { return .invalid }
        let target: Int
        var states: [NativeScreenshotFieldKind: State] = [:]
        if let matchedDay {
            target = matchedDay
            states[.date] = .duplicate
        } else if let priorDay {
            target = priorDay
            states[.date] = .conflict
            draft.days[target].date = date
        } else {
            draft.days.append(.init(id: generatedDayID, date: date, items: []))
            target = draft.days.count - 1
            states[.date] = .added
        }

        for correction in corrections where correction.kind != .date {
            guard let title = itemTitle(kind: correction.kind, sourceLine: correction.sourceLine,
                                       value: correction.correctedValue) else { return .invalid }
            let itemID = stableID(detail.trip.id, digest, correction.kind.rawValue)
            let prior = draft.days.enumerated().compactMap { dayIndex, day -> (Int, Int)? in
                guard let itemIndex = day.items.firstIndex(where: { $0.id == itemID }) else { return nil }
                return (dayIndex, itemIndex)
            }
            guard prior.count <= 1 else { return .invalid }
            if let (dayIndex, itemIndex) = prior.first {
                let old = draft.days[dayIndex].items[itemIndex]
                if dayIndex == target && old.title == title {
                    states[correction.kind] = .duplicate
                    continue
                }
                states[correction.kind] = .conflict
                draft.days[dayIndex].items.remove(at: itemIndex)
            } else {
                states[correction.kind] = .added
            }
            draft.days[target].items.append(.init(id: itemID, dayId: draft.days[target].id, title: title))
        }
        return draft.patch.operations.isEmpty ? .duplicate : .ready(draft, states)
    }

    static func itemTitle(kind: NativeScreenshotFieldKind, sourceLine: Int, value: String) -> String? {
        guard kind != .date, sourceLine > 0, !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        let title = "User-checked screenshot L\(sourceLine) · \(kind.rawValue): \(value)"
        return title.count <= 160 ? title : nil
    }

    private static func stableID(_ tripID: String, _ digest: String, _ suffix: String) -> String {
        var bytes = Array(SHA256.hash(data: Data("\(tripID):\(digest):\(suffix)".utf8)).prefix(16))
        bytes[6] = (bytes[6] & 0x0f) | 0x50
        bytes[8] = (bytes[8] & 0x3f) | 0x80
        let hex = bytes.map { String(format: "%02x", $0) }.joined()
        return "\(hex.prefix(8))-\(hex.dropFirst(8).prefix(4))-\(hex.dropFirst(12).prefix(4))-\(hex.dropFirst(16).prefix(4))-\(hex.dropFirst(20))"
    }
}
