import Foundation
import CoreFoundation

struct NativeScopedTripReservationBinding: Encodable {
    let itemId: String
    let referenceId: String
    let referenceRevision: Int
    var object: [String: Any] { ["itemId": itemId, "referenceId": referenceId, "referenceRevision": referenceRevision] }
}

struct NativeScopedTripBindingRequired {
    let reservations: [NativeReservationCurrent]
    static func decode(_ data: Data, selection: NativeScopedTripSelection) throws -> Self {
        let raw = try NativeScopedTripWire.exact(data, keys: ["kind", "tripId", "baseVersion", "scope", "reservations"])
        guard raw["kind"] as? String == "scoped_edit_binding_required/1", raw["tripId"] as? String == selection.tripID,
              NativeScopedTripWire.integer(raw["baseVersion"]) == selection.headVersion,
              let records = raw["reservations"] as? [Any], !records.isEmpty, records.count <= 100 else { throw NativeDataError.invalidResponse }
        let scope = try NativeScopedTripWire.decode(NativeScopedTripScope.self, raw["scope"]!)
        let reservations = try records.map(NativeReservationWire.current)
        guard scope == NativeScopedTripScope(selection), Set(reservations.map(\.referenceId)).count == reservations.count,
              reservations.allSatisfy({ $0.tripId == selection.tripID && $0.tripVersion == selection.headVersion && ["reserved", "amended"].contains($0.fields.status) }) else { throw NativeDataError.invalidResponse }
        return .init(reservations: reservations)
    }
}

struct NativeScopedTripScope: Codable, Equatable {
    let dayIds: [String]
    let itemIds: [String]
    init(_ selection: NativeScopedTripSelection) {
        dayIds = selection.itemID == nil ? [selection.dayID] : []
        itemIds = selection.itemID.map { [$0] } ?? []
    }
    var object: [String: Any] { ["dayIds": dayIds, "itemIds": itemIds] }
}

struct NativeScopedTripContext {
    struct Snapshot: Decodable { let version: Int; let title: String; let days: [NativeTripDay] }
    struct Order: Decodable { let dayId: String; let itemIds: [String] }
    struct FixedBinding: Decodable { let itemId: String; let sourceKind: String; let referenceId: String; let referenceRevision: Int }
    struct Sources: Decodable { let profileUpdatedAt: String?; let memoryBasisDigest: String; let reservationBasisDigest: String; let sourceDigest: String; let lockRevision: Int; let fixedBindings: [FixedBinding] }
    let sources: Sources
    let basis: NativeScopedTripBasis
    let scope: NativeScopedTripScope
    let snapshot: Snapshot
    let orderedItemIDs: [String: [String]]
    let lockedItemIDs: Set<String>
    let fixedItemIDs: Set<String>
    let expiresAt: Date
    let selection: NativeScopedTripSelection
    var current: Bool { expiresAt > Date() }
    var selectedItemIDs: Set<String> {
        Set(snapshot.days.filter { scope.dayIds.contains($0.id) }.flatMap(\.items).map(\.id) + scope.itemIds)
    }
    var editableItemIDs: Set<String> { selectedItemIDs.subtracting(lockedItemIDs).subtracting(fixedItemIDs) }

    static func request(_ selection: NativeScopedTripSelection, locale: String, bindings: [NativeScopedTripReservationBinding] = []) throws -> Data {
        guard ["en", "zh"].contains(locale) else { throw NativeDataError.invalidResponse }
        return try JSONSerialization.data(withJSONObject: ["action": "context", "expectedHeadVersion": selection.headVersion,
            "scope": NativeScopedTripScope(selection).object, "locale": locale, "reservationBindings": bindings.map(\.object)], options: [.sortedKeys])
    }
    static func decode(_ data: Data, selection: NativeScopedTripSelection, startedAt: Date) throws -> Self {
        let raw = try NativeScopedTripWire.exact(data, keys: ["kind", "contextId", "contextDigest", "tripId", "baseVersion", "scope", "snapshot", "orderedItemIdsByDay", "lockedItemIds", "fixedItemIds", "sourceBasis", "expiresAt"])
        guard raw["kind"] as? String == "scoped_edit_context/1", raw["tripId"] as? String == selection.tripID,
              NativeScopedTripWire.integer(raw["baseVersion"]) == selection.headVersion,
              let contextID = raw["contextId"] as? String, NativeScopedTripWire.uuid(contextID),
              let digest = raw["contextDigest"] as? String, NativeScopedTripWire.digest(digest),
              let expiry = (raw["expiresAt"] as? String).flatMap(NativeScopedTripCommand.date),
              expiry > Date(), expiry <= Date().addingTimeInterval(600),
              let locks = raw["lockedItemIds"] as? [String], let fixed = raw["fixedItemIds"] as? [String] else { throw NativeDataError.invalidResponse }
        let orders = try NativeScopedTripWire.decode([Order].self, raw["orderedItemIdsByDay"]!)
        guard Set(orders.map(\.dayId)).count == orders.count else { throw NativeDataError.invalidResponse }
        let ordered = Dictionary(uniqueKeysWithValues: orders.map { ($0.dayId, $0.itemIds) })
        let sourceRaw = try NativeScopedTripWire.exact(raw["sourceBasis"]!, keys: ["profileUpdatedAt", "memoryBasisDigest", "reservationBasisDigest", "sourceDigest", "lockRevision", "fixedBindings"])
        let sources = try NativeScopedTripWire.decode(Sources.self, sourceRaw)
        guard sources.profileUpdatedAt == nil || sources.profileUpdatedAt.flatMap(NativeScopedTripCommand.date) != nil,
              [sources.memoryBasisDigest, sources.reservationBasisDigest, sources.sourceDigest].allSatisfy(NativeScopedTripWire.digest),
              NativeScopedTripWire.integer(sourceRaw["lockRevision"]) != nil, sources.fixedBindings.count <= 500,
              sources.fixedBindings.allSatisfy({ $0.sourceKind == "user_confirmed_reservation" && NativeScopedTripWire.uuid($0.referenceId) && $0.referenceRevision > 0 }),
              Set(sources.fixedBindings.map(\.itemId)) == Set(fixed) else { throw NativeDataError.invalidResponse }
        let scope = try NativeScopedTripWire.decode(NativeScopedTripScope.self, raw["scope"]!)
        guard scope == NativeScopedTripScope(selection) else { throw NativeDataError.invalidResponse }
        let snapshotRaw = try NativeScopedTripWire.exact(raw["snapshot"]!, keys: ["version", "title", "days"])
        guard let dayRows = snapshotRaw["days"] as? [[String: Any]], let title = snapshotRaw["title"] as? String,
              !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, title.utf16.count <= 160,
              NativeScopedTripWire.integer(snapshotRaw["version"]) != nil else { throw NativeDataError.invalidResponse }
        for day in dayRows {
            guard Set(day.keys).isSubset(of: ["id", "date", "timeZone", "items"]), day["id"] is String, day["date"] is String,
                  let itemRows = day["items"] as? [[String: Any]] else { throw NativeDataError.invalidResponse }
            for item in itemRows { try NativeScopedTripWire.validateItem(item) }
        }
        let snapshot = try NativeScopedTripWire.decode(Snapshot.self, snapshotRaw)
        guard snapshot.days.count <= 366, snapshot.days.flatMap(\.items).count <= 500, orders.map(\.dayId) == snapshot.days.map(\.id) else { throw NativeDataError.invalidResponse }
        let items = snapshot.days.flatMap(\.items)
        let allIDs = Set(items.map(\.id))
        guard snapshot.version == selection.headVersion, Set(snapshot.days.map(\.id)).count == snapshot.days.count,
              allIDs.count == items.count, Set(ordered.keys) == Set(snapshot.days.map(\.id)),
              Set(locks).count == locks.count, Set(fixed).count == fixed.count,
              Set(locks).isSubset(of: allIDs), Set(fixed).isSubset(of: allIDs),
              snapshot.days.allSatisfy({ day in
                  guard NativeScopedTripSelection.validObjectID(day.id), let order = ordered[day.id],
                        Set(order).count == order.count, order == day.items.map(\.id) else { return false }
                  return day.items.allSatisfy { NativeScopedTripSelection.validObjectID($0.id) && $0.dayId == day.id }
              }) else { throw NativeDataError.invalidResponse }
        return .init(sources: sources, basis: .init(contextID: contextID, contextDigest: digest, baseVersion: selection.headVersion),
            scope: scope, snapshot: snapshot, orderedItemIDs: ordered, lockedItemIDs: Set(locks), fixedItemIDs: Set(fixed),
            expiresAt: min(expiry, startedAt.addingTimeInterval(600)), selection: selection)
    }
}

enum NativeScopedTripWire {
    static func exact(_ data: Data, keys: Set<String>) throws -> [String: Any] {
        guard data.count <= 256000 else { throw NativeDataError.invalidResponse }
        return try exact(JSONSerialization.jsonObject(with: data), keys: keys)
    }
    static func exact(_ raw: Any, keys: Set<String>) throws -> [String: Any] {
        guard let object = raw as? [String: Any], Set(object.keys) == keys else { throw NativeDataError.invalidResponse }; return object
    }
    static func decode<T: Decodable>(_ type: T.Type, _ raw: Any) throws -> T {
        try JSONDecoder().decode(type, from: JSONSerialization.data(withJSONObject: raw))
    }
    static func validateItem(_ raw: Any) throws {
        guard let item = raw as? [String: Any], Set(item.keys).isSubset(of: ["id", "dayId", "title", "startsAt", "endsAt", "manualOrder"]),
              let id = item["id"] as? String, NativeScopedTripSelection.validObjectID(id),
              let day = item["dayId"] as? String, NativeScopedTripSelection.validObjectID(day),
              let title = item["title"] as? String, !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, title.utf16.count <= 160 else { throw NativeDataError.invalidResponse }
        for key in ["startsAt", "endsAt"] where item[key] != nil {
            guard let text = item[key] as? String, NativeScopedTripCommand.date(text) != nil else { throw NativeDataError.invalidResponse }
        }
        if let raw = item["manualOrder"] { guard integer(raw) != nil else { throw NativeDataError.invalidResponse } }
    }
    static func integer(_ raw: Any?) -> Int? {
        guard let number = raw as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(),
              number.doubleValue.isFinite, number.doubleValue.rounded() == number.doubleValue,
              number.doubleValue >= 0, number.doubleValue <= Double(Int32.max) else { return nil }; return number.intValue
    }
    static func uuid(_ raw: String) -> Bool { UUID(uuidString: raw) != nil && raw == raw.lowercased() }
    static func digest(_ raw: String) -> Bool { raw.utf8.count == 64 && raw.utf8.allSatisfy { (48...57).contains($0) || (97...102).contains($0) } }
    static func bool(_ raw: Any?) -> Bool? {
        guard let value = raw as? NSNumber, CFGetTypeID(value) == CFBooleanGetTypeID() else { return nil }; return value.boolValue
    }
}
