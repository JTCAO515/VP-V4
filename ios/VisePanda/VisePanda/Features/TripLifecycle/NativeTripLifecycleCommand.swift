import Foundation
import CoreFoundation
import CryptoKit

struct NativeTripLifecycleCommand: Equatable {
    enum Action: String { case create, activate, reconcile, archive }
    var digest: String { SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined() }
    let bytes: Data
    let operationID: String
    let tripID: String
    let sessionID: String
    let expectedRevision: Int
    let expectedActiveTripID: String?
    let action: Action
    let expectedHeadVersion: Int?

    init(action: Action, tripID: String, sessionID: String, revision: Int, activeTripID: String?,
         headVersion: Int? = nil, title: String? = nil, state: NativeTripLifecycleState? = nil,
         preferences: [NativeTripPreferenceReview.Reference] = []) throws {
        var object: [String: Any] = ["action": action.rawValue, "operationId": UUID().uuidString.lowercased(),
            "tripId": tripID, "expectedSessionId": sessionID, "expectedRevision": revision,
            "expectedActiveTripId": activeTripID.map { $0 as Any } ?? NSNull(), "confirmed": true]
        switch action {
        case .create: object["title"] = title
        case .activate: object["expectedHeadVersion"] = headVersion
        case .reconcile:
            object["expectedHeadVersion"] = headVersion; object["state"] = state?.rawValue
        case .archive:
            object["expectedHeadVersion"] = headVersion
            object["preference"] = preferences.isEmpty ? ["action": "skip"] : ["action": "keep", "memoryRefs": preferences.map {
                ["memoryId": $0.memoryID, "revision": $0.revision, "sourceReceiptId": $0.sourceReceiptID, "consentId": $0.consentID] as [String: Any]
            }]
        }
        try self.init(bytes: JSONSerialization.data(withJSONObject: object, options: .sortedKeys))
    }

    init(bytes: Data) throws {
        guard bytes.count <= 32_000 else { throw NativeDataError.invalidResponse }
        let object = try NativeTripLifecycleWire.object(bytes)
        guard let action = (object["action"] as? String).flatMap(Action.init(rawValue:)),
              let op = object["operationId"] as? String, NativeMemoryWire.uuid(op),
              let trip = object["tripId"] as? String, NativeMemoryWire.uuid(trip),
              let session = object["expectedSessionId"] as? String, NativeMemoryWire.uuid(session),
              let revision = NativeTripLifecycleWire.integer(object["expectedRevision"]),
              object["expectedActiveTripId"] is NSNull || (object["expectedActiveTripId"] as? String).map(NativeMemoryWire.uuid) == true,
              let confirmed = object["confirmed"] as? NSNumber,
              CFGetTypeID(confirmed) == CFBooleanGetTypeID(), confirmed.boolValue else { throw NativeDataError.invalidResponse }
        var keys: Set<String> = ["action", "operationId", "tripId", "expectedSessionId", "expectedRevision", "expectedActiveTripId", "confirmed"]
        if action == .create {
            keys.insert("title")
            guard let title = object["title"] as? String, title == title.trimmingCharacters(in: .whitespacesAndNewlines),
                  !title.isEmpty, title.utf16.count <= 160 else { throw NativeDataError.invalidResponse }
        } else {
            keys.insert("expectedHeadVersion")
            guard let head = NativeTripLifecycleWire.integer(object["expectedHeadVersion"]), head <= Int(Int32.max),
                  action != .archive || head > 0 else { throw NativeDataError.invalidResponse }
            if action == .reconcile {
                keys.insert("state")
                guard ["draft", "retained"].contains(object["state"] as? String ?? "") else { throw NativeDataError.invalidResponse }
            } else if action == .archive {
                keys.insert("preference")
                try Self.preference(object["preference"])
            }
        }
        guard NativeTripLifecycleWire.exact(object, keys) else { throw NativeDataError.invalidResponse }
        self.bytes = bytes; self.action = action; operationID = op; tripID = trip; sessionID = session
        expectedRevision = revision; expectedActiveTripID = object["expectedActiveTripId"] as? String
        expectedHeadVersion = NativeTripLifecycleWire.integer(object["expectedHeadVersion"])
    }

    private static func preference(_ raw: Any?) throws {
        guard let value = raw as? [String: Any] else { throw NativeDataError.invalidResponse }
        if value["action"] as? String == "skip", Set(value.keys) == ["action"] { return }
        guard value["action"] as? String == "keep", Set(value.keys) == ["action", "memoryRefs"],
              let rows = value["memoryRefs"] as? [[String: Any]], !rows.isEmpty, rows.count <= 100,
              Set(rows.compactMap { $0["memoryId"] as? String }).count == rows.count else { throw NativeDataError.invalidResponse }
        for row in rows {
            guard Set(row.keys) == ["memoryId", "revision", "sourceReceiptId", "consentId"],
                  ["memoryId", "sourceReceiptId", "consentId"].allSatisfy({ (row[$0] as? String).map(NativeMemoryWire.uuid) == true }),
                  let revision = NativeTripLifecycleWire.integer(row["revision"]), revision > 0 else { throw NativeDataError.invalidResponse }
        }
    }
}
