import Foundation

/// The selected confirmed object, captured before Ask opens. Titles and screen
/// positions are presentation only; they never identify an editable object.
struct NativeScopedTripSelection: Equatable, Identifiable {
    let actor: NativeDataScope
    let tripID: String
    let headVersion: Int
    let dayID: String
    let itemID: String?

    var id: String { "\(tripID):\(headVersion):\(dayID):\(itemID ?? "day")" }
    var anchor: String { itemID.map { "scoped-item:\($0)" } ?? "scoped-day:\(dayID)" }

    init?(actor: NativeDataScope, detail: NativeTripDetail, dayID: String, itemID: String? = nil) {
        guard detail.confirmationState == "confirmed", detail.trip.headVersion >= 0,
              UUID(uuidString: detail.trip.id) != nil,
              let day = detail.content.days.first(where: { $0.id == dayID }),
              Self.validObjectID(dayID) else { return nil }
        if let itemID {
            guard Self.validObjectID(itemID),
                  day.items.contains(where: { $0.id == itemID && $0.dayId == dayID }) else { return nil }
        }
        self.actor = actor; tripID = detail.trip.id; headVersion = detail.trip.headVersion
        self.dayID = dayID; self.itemID = itemID
    }

    static func validObjectID(_ value: String) -> Bool {
        !value.isEmpty && value.utf8.count <= 64 && value.utf8.allSatisfy {
            (65...90).contains($0) || (97...122).contains($0) || (48...57).contains($0) || $0 == 45 || $0 == 95
        }
    }

    func isCurrent(actor: NativeDataScope?, detail: NativeTripDetail?) -> Bool {
        guard actor == self.actor, let detail,
              let current = Self(actor: self.actor, detail: detail, dayID: dayID, itemID: itemID) else { return false }
        return current == self
    }
}
