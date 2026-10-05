import Foundation
import CoreFoundation

enum NativeTripLifecycleState: String, Codable {
    case legacy, draft, active, retained, archived
}

struct NativeTripLifecycleCapacity: Codable, Equatable {
    let draftCount: Int
    let draftLimit: Int
    let activeTripId: String?
    let activeLimit: Int
    let legacyCount: Int

    var valid: Bool {
        (0...3).contains(draftCount) && draftLimit == 3 && activeLimit == 1
        && NativeTripLifecycleWire.revision(legacyCount)
        && (activeTripId.map(NativeMemoryWire.uuid) ?? true)
    }
}

struct NativeTripLifecycleTrip: Codable, Identifiable, Equatable {
    let tripId: String
    let title: String
    let headVersion: Int
    let state: NativeTripLifecycleState
    let archivedVersion: Int?
    let archivedAt: String?
    var id: String { tripId }

    var valid: Bool {
        guard NativeMemoryWire.uuid(tripId), !title.isEmpty, title.utf16.count <= 160,
              (0...Int(Int32.max)).contains(headVersion) else { return false }
        if state == .archived {
            return headVersion > 0 && archivedVersion == headVersion
            && archivedAt.flatMap(NativeKnowledgeRead.date) != nil
        }
        return archivedVersion == nil && archivedAt == nil
    }
}

enum NativeTripLifecycleWire {
    static let version = "trip-lifecycle/1"
    static func revision(_ value: Int) -> Bool { (0...9_007_199_254_740_990).contains(value) }
    static func integer(_ raw: Any?) -> Int? {
        guard let value = raw as? NSNumber, CFGetTypeID(value) != CFBooleanGetTypeID(),
              value.doubleValue.isFinite, value.doubleValue.rounded() == value.doubleValue,
              value.doubleValue >= 0, value.doubleValue <= 9_007_199_254_740_990 else { return nil }
        return value.intValue
    }
    static func exact(_ object: [String: Any], _ keys: Set<String>) -> Bool { Set(object.keys) == keys }
    static func object(_ bytes: Data) throws -> [String: Any] {
        guard bytes.count <= 256_000,
              let result = try JSONSerialization.jsonObject(with: bytes) as? [String: Any] else {
            throw NativeDataError.invalidResponse
        }
        return result
    }
    static func capacity(_ raw: Any?) throws -> NativeTripLifecycleCapacity {
        guard let object = raw as? [String: Any],
              exact(object, ["draftCount", "draftLimit", "activeTripId", "activeLimit", "legacyCount"]),
              ["draftCount", "draftLimit", "activeLimit", "legacyCount"].allSatisfy({ integer(object[$0]) != nil }),
              object["activeTripId"] is NSNull || (object["activeTripId"] as? String).map(NativeMemoryWire.uuid) == true else {
            throw NativeDataError.invalidResponse
        }
        let value = try JSONDecoder().decode(NativeTripLifecycleCapacity.self, from: JSONSerialization.data(withJSONObject: object))
        guard value.valid else { throw NativeDataError.invalidResponse }
        return value
    }
    static func trip(_ raw: Any?) throws -> NativeTripLifecycleTrip {
        guard let object = raw as? [String: Any],
              exact(object, ["tripId", "title", "headVersion", "state", "archivedVersion", "archivedAt"]),
              integer(object["headVersion"]) != nil,
              object["archivedVersion"] is NSNull || integer(object["archivedVersion"]) != nil else {
            throw NativeDataError.invalidResponse
        }
        let value = try JSONDecoder().decode(NativeTripLifecycleTrip.self, from: JSONSerialization.data(withJSONObject: object))
        guard value.valid else { throw NativeDataError.invalidResponse }
        return value
    }
}
