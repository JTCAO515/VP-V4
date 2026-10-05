import Foundation
import Observation

@MainActor @Observable
final class NativePlaceActionTrips {
    private(set) var trips: [NativeTripSummary] = []
    private(set) var detail: NativeTripDetail?
    private(set) var loading = false
    private(set) var unavailable = false
    private(set) var scope: NativeDataScope?
    private var generation = UUID()
    private var deadline: TimeInterval = 0
    private let uptime: () -> TimeInterval

    init(uptime: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) {
        self.uptime = uptime
    }
    func clear() {
        generation = UUID(); trips = []; detail = nil; scope = nil
        deadline = 0; loading = false; unavailable = false
    }
    func readable(scope: NativeDataScope?) -> Bool {
        scope != nil && scope == self.scope && uptime() < deadline
    }
    func list(scope: NativeDataScope, current: () -> NativeDataScope?, fetch: () async throws -> Data) async {
        clear(); guard current() == scope, !Task.isCancelled else { return }
        self.scope = scope
        let own = generation, started = uptime(); loading = true
        defer { if generation == own { loading = false } }
        do {
            let bytes = try await fetch()
            guard generation == own, current() == scope, !Task.isCancelled else { return }
            guard bytes.count <= 1_000_000, uptime() - started < 30 else { throw NativeDataError.invalidResponse }
            let value = try JSONDecoder().decode(NativeTripList.self, from: bytes)
            guard value.version == 2, value.trips.count <= 100,
                  Set(value.trips.map(\.id)).count == value.trips.count,
                  value.trips.allSatisfy({ UUID(uuidString: $0.id) != nil && $0.headVersion >= 0 && !$0.title.isEmpty })
            else { throw NativeDataError.invalidResponse }
            trips = value.trips; deadline = started + 30
        } catch { if generation == own { trips = []; detail = nil; deadline = 0; unavailable = true } }
    }
    func select(tripId: String, scope: NativeDataScope, current: () -> NativeDataScope?, fetch: () async throws -> Data) async {
        generation = UUID(); detail = nil; deadline = 0; unavailable = false
        guard self.scope == scope, current() == scope, trips.contains(where: { $0.id == tripId }), !Task.isCancelled else { return }
        let own = generation, started = uptime(); loading = true
        defer { if generation == own { loading = false } }
        do {
            let bytes = try await fetch()
            guard generation == own, current() == scope, !Task.isCancelled else { return }
            guard bytes.count <= 1_000_000, uptime() - started < 30 else { throw NativeDataError.invalidResponse }
            let value = try JSONDecoder().decode(NativeTripDetail.self, from: bytes)
            guard value.version == 2, value.trip.id == tripId, value.trip.headVersion >= 0,
                  value.content.days.count <= 100,
                  Set(value.content.days.map(\.id)).count == value.content.days.count,
                  value.content.days.allSatisfy({ day in
                      !day.id.isEmpty && day.items.count <= 100 &&
                      Set(day.items.map(\.id)).count == day.items.count &&
                      day.items.allSatisfy { $0.dayId == day.id && !$0.id.isEmpty }
                  }) else { throw NativeDataError.invalidResponse }
            detail = value; deadline = started + 30
        } catch { if generation == own { detail = nil; deadline = 0; unavailable = true } }
    }
}
