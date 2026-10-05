import Foundation

/// Every visible value belongs to the original owner, session and foreground
/// generation. Resuming or rendering cannot refresh an earlier read lease.
struct NativeNotificationDataLifetime {
    private(set) var generation = UUID()
    private(set) var actor: NativeCommunitySafetyActor?
    private(set) var active = false

    mutating func bind(_ actor: NativeCommunitySafetyActor?, active: Bool) {
        guard self.actor != actor || self.active != active else { return }
        generation = UUID()
        self.actor = actor
        self.active = active
    }

    mutating func suspend() { generation = UUID(); active = false }
    mutating func advance() { generation = UUID() }

    func accepts(_ generation: UUID, actor: NativeCommunitySafetyActor,
                 current: NativeCommunitySafetyActor?) -> Bool {
        active && self.generation == generation && self.actor == actor && current == actor
    }
}

struct NativeNotificationDataLease {
    private let started: TimeInterval
    private let deadline: TimeInterval
    private let expiresAt: Date

    init(started: TimeInterval, received: TimeInterval, now: Date, expiresAt: Date) throws {
        guard started.isFinite, received.isFinite, received >= started,
              received - started < 30, now.timeIntervalSince1970.isFinite,
              expiresAt.timeIntervalSince1970.isFinite, expiresAt > now else {
            throw NativeDataError.staleSessionResponse
        }
        self.started = started
        deadline = min(started + 30, received + expiresAt.timeIntervalSince(now))
        self.expiresAt = expiresAt
    }

    func valid(uptime: TimeInterval, now: Date) -> Bool {
        uptime.isFinite && uptime >= started && uptime < deadline && now < expiresAt
    }
}
