import Foundation

/// A read never gains a fresh lease through rendering, recovery or foregrounding.
struct NativeArchiveDataLifetime {
    private(set) var actor: NativeCommunitySafetyActor?
    private(set) var generation = UUID()
    private(set) var active = false

    @discardableResult mutating func bind(_ actor: NativeCommunitySafetyActor?) -> Bool {
        guard self.actor != actor || active != (actor != nil) else { return false }
        self.actor = actor
        active = actor != nil
        generation = UUID()
        return true
    }

    mutating func invalidate() { generation = UUID() }
    mutating func suspend() { invalidate(); active = false }

    func accepts(actor: NativeCommunitySafetyActor?, generation: UUID) -> Bool {
        active && actor != nil && self.actor == actor && self.generation == generation
    }
}

struct NativeArchiveDataLease {
    private let start: TimeInterval
    private let deadline: TimeInterval
    private let expiry: Date

    init(start: TimeInterval, received: TimeInterval, now: Date, expiry: Date) throws {
        guard start.isFinite, received.isFinite, received >= start, received - start < 30,
              now.timeIntervalSince1970.isFinite, expiry.timeIntervalSince1970.isFinite,
              expiry > now else { throw NativeDataError.staleSessionResponse }
        self.start = start
        self.expiry = expiry
        deadline = min(start + 30, received + expiry.timeIntervalSince(now))
    }

    func valid(now: Date, uptime: TimeInterval) -> Bool {
        now.timeIntervalSince1970.isFinite && uptime.isFinite && uptime >= start && uptime < deadline && now < expiry
    }
}
