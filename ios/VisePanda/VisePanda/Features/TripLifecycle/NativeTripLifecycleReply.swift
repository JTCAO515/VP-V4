import Foundation

struct NativeTripLifecycleSnapshot: Equatable {
    let ownerID: String
    let sessionID: String
    let revision: Int
    let capacity: NativeTripLifecycleCapacity
    let trips: [NativeTripLifecycleTrip]
    let nextTripID: String?

    init(bytes: Data, actor: NativeDataScope) throws {
        let object = try NativeTripLifecycleWire.object(bytes)
        guard Set(object.keys) == ["version", "ownerId", "sessionId", "revision", "capacity", "trips", "nextTripId", "serviceStatus"],
              object["version"] as? String == NativeTripLifecycleWire.version,
              object["ownerId"] as? String == actor.subject,
              let session = object["sessionId"] as? String, NativeMemoryWire.uuid(session),
              let revision = NativeTripLifecycleWire.integer(object["revision"]),
              let rows = object["trips"] as? [[String: Any]], rows.count <= 50,
              object["nextTripId"] is NSNull || (object["nextTripId"] as? String).map(NativeMemoryWire.uuid) == true,
              object["serviceStatus"] as? String == "unavailable" else { throw NativeDataError.invalidResponse }
        let trips = try rows.map(NativeTripLifecycleWire.trip)
        guard Set(trips.map(\.id)).count == trips.count, trips.map(\.id) == trips.map(\.id).sorted(),
              object["nextTripId"] is NSNull || rows.count == 50 && object["nextTripId"] as? String == trips.last?.id else { throw NativeDataError.invalidResponse }
        ownerID = actor.subject; sessionID = session; self.revision = revision
        capacity = try NativeTripLifecycleWire.capacity(object["capacity"])
        self.trips = trips; nextTripID = object["nextTripId"] as? String
        guard trips.filter({ $0.state == .draft }).count <= capacity.draftCount,
              trips.filter({ $0.state == .legacy }).count <= capacity.legacyCount,
              trips.filter({ $0.state == .active }).allSatisfy({ $0.id == capacity.activeTripId }) else { throw NativeDataError.invalidResponse }
    }
}

struct NativeTripLifecycleReceipt: Equatable {
    let operationID: String
    let tripID: String
    let action: NativeTripLifecycleCommand.Action
    let state: NativeTripLifecycleState
    let revision: Int
    let capacity: NativeTripLifecycleCapacity
    let archivedVersion: Int?
    let preferences: [NativeTripPreferenceReview.Reference]

    init(bytes: Data, actor: NativeDataScope, command: NativeTripLifecycleCommand) throws {
        let object = try NativeTripLifecycleWire.object(bytes)
        guard Set(object.keys) == ["status", "version", "ownerId", "sessionId", "operationId", "requestDigest", "action", "revision", "tripId", "state", "capacity", "archivedVersion", "archivedAt", "preference", "memoryRefs"],
              object["status"] as? String == "applied",
              object["version"] as? String == NativeTripLifecycleWire.version,
              object["ownerId"] as? String == actor.subject, object["sessionId"] as? String == command.sessionID,
              object["operationId"] as? String == command.operationID, object["tripId"] as? String == command.tripID,
              object["requestDigest"] as? String == command.digest, object["action"] as? String == command.action.rawValue,
              let revision = NativeTripLifecycleWire.integer(object["revision"]), revision > command.expectedRevision,
              let state = (object["state"] as? String).flatMap(NativeTripLifecycleState.init(rawValue:)), state != .legacy,
              let refs = object["memoryRefs"] as? [[String: Any]], refs.count <= 100 else { throw NativeDataError.invalidResponse }
        for ref in refs {
            guard Set(ref.keys) == ["memoryId", "revision", "sourceReceiptId", "consentId"],
                  ["memoryId", "sourceReceiptId", "consentId"].allSatisfy({ (ref[$0] as? String).map(NativeMemoryWire.uuid) == true }),
                  let rev = NativeTripLifecycleWire.integer(ref["revision"]), rev > 0 else { throw NativeDataError.invalidResponse }
        }
        let preferences = try JSONDecoder().decode([NativeTripPreferenceReview.Reference].self, from: JSONSerialization.data(withJSONObject: refs))
        guard Set(preferences.map(\.memoryID)).count == preferences.count else { throw NativeDataError.invalidResponse }
        let capacity = try NativeTripLifecycleWire.capacity(object["capacity"])
        let original = try NativeTripLifecycleWire.object(command.bytes)
        if command.action == .archive {
            guard state == .archived, let archived = NativeTripLifecycleWire.integer(object["archivedVersion"]),
                  archived == command.expectedHeadVersion,
                  (object["archivedAt"] as? String).flatMap(NativeKnowledgeRead.date) != nil,
                  let preference = original["preference"] as? [String: Any], capacity.activeTripId != command.tripID else { throw NativeDataError.invalidResponse }
            if preference["action"] as? String == "keep" {
                guard object["preference"] as? String == "kept", let expected = preference["memoryRefs"],
                      try JSONSerialization.data(withJSONObject: expected, options: .sortedKeys) == JSONSerialization.data(withJSONObject: refs, options: .sortedKeys) else { throw NativeDataError.invalidResponse }
            } else {
                guard object["preference"] as? String == "skipped", refs.isEmpty else { throw NativeDataError.invalidResponse }
            }
        } else {
            guard object["archivedAt"] is NSNull, object["archivedVersion"] is NSNull, refs.isEmpty,
                  object["preference"] as? String == "not_requested" else { throw NativeDataError.invalidResponse }
            switch command.action {
            case .create: guard state == .draft, capacity.draftCount > 0 else { throw NativeDataError.invalidResponse }
            case .activate: guard state == .active, capacity.activeTripId == command.tripID else { throw NativeDataError.invalidResponse }
            case .reconcile: guard state.rawValue == original["state"] as? String else { throw NativeDataError.invalidResponse }
            case .archive: break
            }
        }
        operationID = command.operationID; tripID = command.tripID; action = command.action
        self.revision = revision; self.state = state; self.capacity = capacity; self.preferences = preferences
        archivedVersion = NativeTripLifecycleWire.integer(object["archivedVersion"])
    }

}

enum NativeTripLifecycleTerminal: Equatable {
    case applied(NativeTripLifecycleReceipt)
    case declined(String)

    init(bytes: Data, actor: NativeDataScope, command: NativeTripLifecycleCommand) throws {
        let object = try NativeTripLifecycleWire.object(bytes)
        if object["status"] as? String == "applied" {
            self = .applied(try .init(bytes: bytes, actor: actor, command: command)); return
        }
        guard Set(object.keys) == ["version", "ownerId", "sessionId", "operationId", "requestDigest", "action", "tripId", "status", "reason", "revision"],
              object["status"] as? String == "declined", object["version"] as? String == NativeTripLifecycleWire.version,
              object["ownerId"] as? String == actor.subject, object["sessionId"] as? String == command.sessionID,
              object["operationId"] as? String == command.operationID, object["requestDigest"] as? String == command.digest,
              object["action"] as? String == command.action.rawValue, object["tripId"] as? String == command.tripID,
              NativeTripLifecycleWire.integer(object["revision"]) != nil,
              let reason = object["reason"] as? String,
              ["LIFECYCLE_CONFLICT", "TRIP_CAPACITY", "LEGACY_RECONCILIATION_REQUIRED", "STALE_TRIP_VERSION",
               "PROPOSAL_NOT_CONFIRMABLE", "MEMORY_CONFLICT", "IDEMPOTENCY_KEY_REUSE", "USER_ABANDONED"].contains(reason) else { throw NativeDataError.invalidResponse }
        self = .declined(reason)
    }

    static func recovery(bytes: Data, actor: NativeDataScope, command: NativeTripLifecycleCommand) throws -> Self? {
        let object = try NativeTripLifecycleWire.object(bytes)
        guard Set(object.keys) == ["version", "ownerId", "sessionId", "operationId", "receipt"],
              object["version"] as? String == NativeTripLifecycleWire.version,
              object["ownerId"] as? String == actor.subject, object["sessionId"] as? String == command.sessionID,
              object["operationId"] as? String == command.operationID else { throw NativeDataError.invalidResponse }
        if object["receipt"] is NSNull { return nil }
        guard let receipt = object["receipt"] as? [String: Any] else { throw NativeDataError.invalidResponse }
        return try .init(bytes: JSONSerialization.data(withJSONObject: receipt), actor: actor, command: command)
    }
}
