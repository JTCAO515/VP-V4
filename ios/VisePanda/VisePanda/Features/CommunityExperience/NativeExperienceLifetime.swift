import Foundation

/// A request-start lease, never renewed by rendering, restoration or a late reply.
@MainActor struct NativeExperienceLifetime {
    private let started: TimeInterval
    private let deadline: TimeInterval
    private let expiresAt: Date

    init(started: TimeInterval, received: TimeInterval, now: Date, expiresAt: Date, maximumAge: TimeInterval = 30) throws {
        guard started.isFinite, received.isFinite, received >= started,
              maximumAge.isFinite, maximumAge > 0, maximumAge <= 30,
              received - started < maximumAge, expiresAt > now else { throw NativeDataError.staleSessionResponse }
        self.started = started
        self.deadline = min(started + maximumAge, received + expiresAt.timeIntervalSince(now))
        self.expiresAt = expiresAt
    }

    func valid(uptime: TimeInterval, now: Date) -> Bool {
        uptime.isFinite && uptime >= started && uptime < deadline && now < expiresAt
    }
}

/// An opaque identifier carries no content, rights, source or read authorization.
struct NativeExperienceReference: Hashable, Identifiable {
    let id: String
    init(id: String) throws {
        guard let uuid = UUID(uuidString: id), uuid.uuidString.lowercased() == id else { throw NativeDataError.invalidResponse }
        self.id = id
    }
}
