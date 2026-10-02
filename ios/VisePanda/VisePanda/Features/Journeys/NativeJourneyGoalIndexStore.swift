import Foundation
import Observation

struct NativeJourneyGoalIndexQualification: Equatable {
    let scope: NativeDataScope
    let policy: NativeTextPolicy

    func eligible(at now: Date) -> Bool {
        guard policy.valid, policy.consentState == .accepted else { return false }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let expiry = formatter.date(from: policy.expiresAt) ?? ISO8601DateFormatter().date(from: policy.expiresAt)
        return expiry.map { $0 > now } == true
    }
}

/// One transient page of existing goal facts. The host supplies qualification
/// and an authorized read; this component grants no selection/write authority.
@MainActor @Observable
final class NativeJourneyGoalIndexStore {
    enum State: Equatable { case idle, loading, ready, unavailable }
    private(set) var state: State = .idle
    private var page: NativeJourneyGoalIndexPage?
    private var qualification: NativeJourneyGoalIndexQualification?
    private var readableUntil: TimeInterval?
    private var generation = UUID()
    private let uptime: () -> TimeInterval
    private let wallNow: () -> Date

    init(uptime: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime },
         wallNow: @escaping () -> Date = Date.init) {
        self.uptime = uptime; self.wallNow = wallNow
    }

    func clear() {
        generation = UUID(); page = nil; qualification = nil; readableUntil = nil; state = .idle
    }

    func visiblePage(qualification current: NativeJourneyGoalIndexQualification?, foreground: Bool) -> NativeJourneyGoalIndexPage? {
        guard state != .idle else { return nil }
        guard foreground, let current, current == qualification, current.eligible(at: wallNow()) else {
            unavailable(); return nil
        }
        guard state == .ready else { return nil }
        guard let readableUntil, uptime() < readableUntil else { unavailable(); return nil }
        return page
    }

    func reloadFirst(qualification requested: NativeJourneyGoalIndexQualification?,
                     currentQualification: () -> NativeJourneyGoalIndexQualification?, foreground: () -> Bool,
                     read: (String?) async throws -> Data) async {
        await load(cursor: nil, qualification: requested, currentQualification: currentQualification, foreground: foreground, read: read)
    }

    func loadNext(qualification requested: NativeJourneyGoalIndexQualification?,
                  currentQualification: () -> NativeJourneyGoalIndexQualification?, foreground: () -> Bool,
                  read: (String?) async throws -> Data) async {
        guard let page = visiblePage(qualification: requested, foreground: foreground()),
              let raw = page.nextCursor, let cursor = NativeJourneyGoalIndexCursor(raw) else { return }
        await load(cursor: cursor, qualification: requested, currentQualification: currentQualification, foreground: foreground, read: read)
    }

    private func unavailable() {
        generation = UUID(); page = nil; qualification = nil; readableUntil = nil; state = .unavailable
    }

    private func load(cursor: NativeJourneyGoalIndexCursor?, qualification requested: NativeJourneyGoalIndexQualification?,
                      currentQualification: () -> NativeJourneyGoalIndexQualification?, foreground: () -> Bool,
                      read: (String?) async throws -> Data) async {
        clear() // Page navigation removes the previous page before dispatch.
        guard let requested, requested == currentQualification(), requested.eligible(at: wallNow()), foreground(), !Task.isCancelled else {
            unavailable(); return
        }
        qualification = requested; state = .loading
        let token = generation
        let deadline = uptime() + 20 // Includes transport and decoding latency.
        func current() -> Bool {
            !Task.isCancelled && token == generation && foreground() && requested == currentQualification()
                && requested.eligible(at: wallNow()) && uptime() < deadline
        }
        do {
            let bytes = try await read(cursor?.rawValue)
            guard token == generation else { return }
            guard current(), bytes.count <= 512_000 else { unavailable(); return }
            let reply = try JSONDecoder().decode(NativeJourneyGoalIndexPage.self, from: bytes)
            guard reply.follows(cursor), current() else { unavailable(); return }
            page = reply; readableUntil = deadline; state = .ready
        } catch {
            guard token == generation else { return }
            unavailable() // No retained cursor/pages; only explicit reloadFirst can recover.
        }
    }
}
