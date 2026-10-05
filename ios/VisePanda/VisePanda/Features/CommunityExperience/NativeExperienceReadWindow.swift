import Foundation
import Observation

/// Only a current qualified response may populate this process-local window.
/// Wire parsing remains the producer's closed contract; this owns lifetime and races.
@MainActor @Observable final class NativeExperienceReadWindow<Value> {
    private(set) var busy = false
    private(set) var notice: String?
    private var actor: NativeCommunitySafetyActor?
    private var generation = UUID()
    private var value: Value?
    private var lifetime: NativeExperienceLifetime?
    private let uptime: () -> TimeInterval
    private let now: () -> Date

    init(uptime: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }, now: @escaping () -> Date = Date.init) {
        self.uptime = uptime; self.now = now
    }

    func bind(_ next: NativeCommunitySafetyActor?) {
        guard next != actor else { return }
        clear(); actor = next
    }

    func clear() {
        generation = UUID(); value = nil; lifetime = nil; busy = false; notice = nil
    }

    func visible(current: NativeCommunitySafetyActor?) -> Value? {
        guard current != nil, current == actor, let lifetime,
              lifetime.valid(uptime: uptime(), now: now()) else { return nil }
        return value
    }

    func tick(current: NativeCommunitySafetyActor?) {
        if current != actor { bind(current); return }
        if value != nil && visible(current: current) == nil { clear(); notice = "REFRESH_REQUIRED" }
    }

    /// Clear before requesting, so failure, denial and invalid response leave no old body.
    func load(current: () -> NativeCommunitySafetyActor?, request: () async throws -> (Value, Date)) async {
        bind(current())
        guard let actor, current() == actor, !busy else { return }
        clear(); busy = true
        let own = generation, started = uptime()
        defer { if generation == own { busy = false } }
        do {
            let (candidate, expiry) = try await request()
            guard generation == own, current() == actor, !Task.isCancelled else { return }
            let lease = try NativeExperienceLifetime(started: started, received: uptime(), now: now(), expiresAt: expiry)
            value = candidate; lifetime = lease
        } catch {
            guard generation == own else { return }
            value = nil; lifetime = nil
            if current() != actor { bind(current()); return }
            if !Task.isCancelled { notice = "EXPERIENCE_UNAVAILABLE" }
        }
    }
}
