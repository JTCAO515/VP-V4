import Foundation
import Observation

@MainActor @Observable
final class NativeProposalReferenceStore {
    enum State { case idle, loading, ready, unavailable }
    typealias Read = (_ artifactID: String, _ revision: Int) async throws -> Data
    private(set) var state = State.idle
    private var record: NativeProposalReferenceRecord?
    private var scope: NativeDataScope?
    private var generation = UUID()
    private var deadline: TimeInterval = 0
    private let uptime: () -> TimeInterval
    init(uptime: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) { self.uptime = uptime }
    func clear() { generation = UUID(); record = nil; scope = nil; deadline = 0; state = .idle }
    func visible(scope requested: NativeDataScope?, active: Bool = true) -> NativeProposalReferenceRecord? {
        guard active, requested != nil, requested == scope, state == .ready, uptime() < deadline else { return nil }; return record
    }
    func load(artifactID: String, revision: Int, scope requested: NativeDataScope?, active: Bool,
              currentScope: () -> NativeDataScope?, read: Read) async {
        clear()
        guard active, let requested, currentScope() == requested, UUID(uuidString: artifactID) != nil, (1...1000).contains(revision), !Task.isCancelled else { state = .unavailable; return }
        let own = generation, started = uptime(); scope = requested; state = .loading
        do {
            let bytes = try await read(artifactID, revision)
            guard generation == own, !Task.isCancelled else { return }
            guard currentScope() == requested,
                  let value = try NativeProposalReferenceRecord.decode(bytes),
                  value.artifactID == artifactID.lowercased(), value.artifactRevision == revision,
                  uptime() - started < 20 else { throw NativeDataError.invalidResponse }
            record = value; deadline = started + 20; state = .ready
        } catch {
            guard generation == own else { return }; record = nil; deadline = 0; state = .unavailable
        }
    }
    /// Discovery and exact open share one request-start deadline and selected-Trip fence.
    func loadTrip(tripID: String, scope requested: NativeDataScope?, active: Bool,
                  currentScope: () -> NativeDataScope?, selectedTrip: () -> String?,
                  discover: (String) async throws -> Data, read: Read) async {
        clear()
        guard active, let requested, currentScope() == requested, selectedTrip() == tripID,
              UUID(uuidString: tripID) != nil, !Task.isCancelled else { state = .unavailable; return }
        let own = generation, started = uptime(); scope = requested; state = .loading
        do {
            let receipt = try await discover(tripID)
            guard generation == own, !Task.isCancelled else { return }
            guard currentScope() == requested, selectedTrip() == tripID, uptime() - started < 20,
                  let reference = try NativeTripProposalReference.decode(receipt, expectedTripID: tripID)
            else { throw NativeDataError.invalidResponse }
            let bytes = try await read(reference.artifactID, reference.revision)
            guard generation == own, !Task.isCancelled else { return }
            guard currentScope() == requested, selectedTrip() == tripID, uptime() - started < 20,
                  let value = try NativeProposalReferenceRecord.decode(bytes),
                  value.artifactID == reference.artifactID, value.artifactRevision == reference.revision,
                  value.tripID == reference.tripID else { throw NativeDataError.invalidResponse }
            record = value; deadline = started + 20; state = .ready
        } catch {
            guard generation == own else { return }; record = nil; deadline = 0; state = .unavailable
        }
    }

}
