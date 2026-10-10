import Foundation

/// Endpoint, owner, current session and mobile epoch are inseparable display authority.
struct NativeTurnDataLifetime {
    private(set) var actor: NativeCommunitySafetyActor?
    private(set) var generation = UUID()
    private(set) var active = false

    @discardableResult mutating func bind(_ next: NativeCommunitySafetyActor?) -> Bool {
        guard actor != next || active != (next != nil) else { return false }
        actor = next; active = next != nil; invalidate()
        return true
    }
    mutating func invalidate() { generation = UUID() }
    mutating func suspend() { active = false; invalidate() }
    func accepts(_ captured: NativeCommunitySafetyActor, generation: UUID) -> Bool {
        active && actor == captured && self.generation == generation
    }
}

/// Fixed thirty seconds from request start; wall-clock rollback cannot renew authority.
struct NativeTurnDataLease {
    private let start: TimeInterval
    private let deadline: TimeInterval
    private let expiresAt: Date

    init(start: TimeInterval, received: TimeInterval, now: Date, expiresAt: Date) throws {
        guard start.isFinite, received.isFinite, received >= start, received - start < 30,
              now.timeIntervalSince1970.isFinite, expiresAt.timeIntervalSince1970.isFinite,
              expiresAt > now else { throw NativeDataError.staleSessionResponse }
        self.start = start; self.expiresAt = expiresAt
        deadline = min(start + 30, received + expiresAt.timeIntervalSince(now))
    }
    func valid(now: Date, uptime: TimeInterval) -> Bool {
        now.timeIntervalSince1970.isFinite && uptime.isFinite && uptime >= start &&
            uptime < deadline && now < expiresAt
    }
}
