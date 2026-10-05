import Foundation

/// Read authority belongs to one actor, session and foreground generation.
/// A title or an opaque reference is never permission to read an object.
struct NativeMaterialReferenceLifetime {
    private(set) var generation = UUID()
    private(set) var actor: NativeCommunitySafetyActor?
    private(set) var active = false

    mutating func bind(_ actor: NativeCommunitySafetyActor?, active: Bool) {
        if self.actor != actor || self.active != active {
            generation = UUID()
            self.actor = actor
            self.active = active
        }
    }

    mutating func invalidate() { generation = UUID(); active = false }
    mutating func advance() { generation = UUID() }

    func accepts(_ generation: UUID, actor: NativeCommunitySafetyActor,
                 current: NativeCommunitySafetyActor?) -> Bool {
        active && self.generation == generation && self.actor == actor && current == actor
    }
}

/// Captured once when a request starts. Rendering and recovery cannot renew it.
struct NativeMaterialReferenceLease {
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
