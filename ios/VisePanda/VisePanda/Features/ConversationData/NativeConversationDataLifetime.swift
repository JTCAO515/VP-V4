import Foundation

/// Local display authority only; the producer owns scope and consent qualification.
struct NativeConversationDataLifetime {
    private(set) var actor: NativeCommunitySafetyActor?
    private(set) var generation = UUID()
    private(set) var active = false

    @discardableResult mutating func bind(_ actor: NativeCommunitySafetyActor?) -> Bool {
        guard self.actor != actor || active != (actor != nil) else { return false }
        self.actor = actor
        active = actor != nil
        invalidate()
        return true
    }

    mutating func invalidate() { generation = UUID() }
    mutating func suspend() { invalidate(); active = false }

    func accepts(actor: NativeCommunitySafetyActor?, generation: UUID) -> Bool {
        active && actor != nil && self.actor == actor && self.generation == generation
    }
}

/// A response cannot renew its producer TTL by rendering or by changing the wall clock.
struct NativeConversationDataLease {
    private let start: TimeInterval
    private let deadline: TimeInterval
    private let expiresAt: Date

    init(start: TimeInterval, received: TimeInterval, now: Date, expiresAt: Date, maximumAge: TimeInterval) throws {
        guard start.isFinite, received.isFinite, maximumAge.isFinite, maximumAge > 0,
              received >= start, received - start < maximumAge,
              now.timeIntervalSince1970.isFinite, expiresAt.timeIntervalSince1970.isFinite,
              expiresAt > now else { throw NativeDataError.staleSessionResponse }
        self.start = start
        self.expiresAt = expiresAt
        deadline = min(start + maximumAge, received + expiresAt.timeIntervalSince(now))
    }

    func valid(now: Date, uptime: TimeInterval) -> Bool {
        now.timeIntervalSince1970.isFinite && uptime.isFinite && uptime >= start &&
            uptime < deadline && now < expiresAt
    }
}

/// A receipt-bound, transient invalidation of selected projections only.
/// It contains source IDs; domain values and provider operations stay with their owners.
struct NativeConversationDataErasure: Identifiable {
    let id = UUID()
    let actor: NativeCommunitySafetyActor
    var scope: NativeDataScope { actor.scope }
    let conversationIDs: Set<String>
    let threadIDs: Set<String>
    let turnIDs: Set<String>
    let taskIDs: Set<String>
    let artifactIDs: Set<String>

    init(receipt: NativeConversationDataReceipt, actor: NativeCommunitySafetyActor) {
        self.actor = actor
        conversationIDs = Set(receipt.graph.ids["conversationIds"] ?? [])
        threadIDs = Set(receipt.graph.ids["threadIds"] ?? [])
        turnIDs = Set(receipt.graph.ids["turnIds"] ?? [])
        taskIDs = Set(receipt.graph.ids["taskIds"] ?? [])
        artifactIDs = Set(receipt.graph.ids["artifactIds"] ?? [])
    }
}
