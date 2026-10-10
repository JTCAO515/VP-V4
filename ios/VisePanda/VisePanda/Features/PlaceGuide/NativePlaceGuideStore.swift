import Foundation
import Observation

@MainActor @Observable final class NativePlaceGuideStore: NativeGuideCacheDataSource {
    let guideCacheInstanceID = UUID()
    private(set) var guideCacheGeneration = UUID()
    private var cacheRevision = UUID()
    private var qualifiedSourceIdentifiers: [String] = []
    private var qualifiedRightsRevision: Int?
    private var qualifiedExpiresAt: Date?
    private var requiresExplicitRead = false
    weak var guideCacheFollowUp: NativePlaceGuideFollowUpStore?
    typealias Request = (NativePlaceGuideSelection, Data) async throws -> Data
    private(set) var selection: NativePlaceGuideSelection?
    private(set) var ready: NativePlaceGuideReady?
    private(set) var progress = NativePlaceGuideProgress()
    private(set) var busy = false
    private(set) var notice: String?
    private var generation = UUID()
    private var deadline: TimeInterval = 0
    private var qualifiedDigest: String?
    private var cacheAllowed = false
    private let uptime: () -> TimeInterval
    init(uptime: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) { self.uptime = uptime }

    func bind(_ next: NativePlaceGuideSelection?, explicit: Bool = true) {
        guard !requiresExplicitRead || explicit else { return }
        guard selection != next else { return }
        clear(); selection = next
    }
    func clear() {
        generation = UUID(); guideCacheGeneration = UUID(); cacheRevision = UUID()
        qualifiedSourceIdentifiers = []; qualifiedRightsRevision = nil; qualifiedExpiresAt = nil
        selection = nil; ready = nil; qualifiedDigest = nil
        progress = .init(); cacheAllowed = false; busy = false; notice = nil; deadline = 0
    }
    /// Only licensed source identifiers and progress survive a temporary foreground suspension.
    func suspend() {
        generation = UUID(); guideCacheGeneration = UUID(); cacheRevision = UUID(); ready = nil; busy = false; deadline = 0
        if !cacheAllowed { qualifiedDigest = nil; progress = .init(); qualifiedSourceIdentifiers = []; qualifiedRightsRevision = nil; qualifiedExpiresAt = nil }
    }
    func visible(_ current: NativeDataScope?) -> NativePlaceGuideReady? {
        guard let selection, current == selection.scope, uptime() < deadline,
              let ready, ready.remaining() > 0 else { return nil }
        return ready
    }

    @discardableResult func read(replay: Bool = false, explicit: Bool = true, current: () -> NativeDataScope?, request: Request) async -> Bool {
        guard (!requiresExplicitRead || explicit), !busy, let selection, selection.valid, current() == selection.scope else { return false }
        let expected = qualifiedDigest
        if replay && expected == nil { return false }
        let own = generation, started = uptime(); busy = true; cacheRevision = UUID(); notice = nil
        defer { if generation == own { busy = false; cacheRevision = UUID() } }
        do {
            let body = try selection.command(replay ? "replay" : "read", extra: replay ? ["expectedDigest": expected!] : [:])
            let bytes = try await request(selection, body)
            guard generation == own, self.selection == selection, current() == selection.scope, !Task.isCancelled,
                  uptime() - started < 30 else { return false }
            let outcome = try unwrap(bytes)
            if outcome["kind"] as? String == "unavailable" {
                _ = try NativePlaceActionWire.exact(outcome, ["kind", "reason", "fallback"])
                guard outcome["fallback"] as? String == "explore", let reason = outcome["reason"] as? String,
                      ["not_covered", "rights_unavailable", "source_changed", "unsupported_language", "capacity"].contains(reason) else { throw NativeDataError.invalidResponse }
                ready = nil; deadline = 0; qualifiedDigest = nil; progress = .init(); cacheAllowed = false
                qualifiedSourceIdentifiers = []; qualifiedRightsRevision = nil; qualifiedExpiresAt = nil; notice = reason
                return false
            }
            let value = try NativePlaceGuideReady.decode(NativePlaceActionWire.bytes(outcome), expected: selection)
            guard !replay || value.digest == expected else { throw NativeDataError.invalidResponse }
            if qualifiedDigest != value.digest { progress = .init() }
            ready = value; qualifiedDigest = value.digest; cacheAllowed = value.rights.cache
            qualifiedSourceIdentifiers = value.rights.cache ? Array(Set(value.segments.flatMap { $0.sources.map(\.sourceRevisionId) })).sorted() : []
            qualifiedRightsRevision = value.rights.revision; qualifiedExpiresAt = value.playbackExpiresAt; requiresExplicitRead = false
            deadline = started + min(30, value.remaining())
            return uptime() < deadline
        } catch {
            guard generation == own else { return false }
            ready = nil; deadline = 0; progress = .init(); qualifiedDigest = nil; cacheAllowed = false; qualifiedSourceIdentifiers = []; qualifiedRightsRevision = nil; qualifiedExpiresAt = nil; notice = "unavailable"
            return false
        }
    }

    func advance(id: String, characters: Int, finished: Bool, current: NativeDataScope?) {
        guard let ready = visible(current), let segment = ready.segments.first(where: { $0.id == id }) else { return }
        let previous = progress
        progress.advance(segmentID: id, characters: characters, total: segment.speechText.utf16.count, finished: finished)
        if progress != previous { cacheRevision = UUID() }
    }
    func completedForQuestion(current: NativeDataScope?) -> [String] {
        guard let ready = visible(current) else { return [] }
        return ready.segments.map(\.id).filter(progress.completedSegmentIDs.contains)
    }
    func clearUnlicensedProgress() { if !cacheAllowed { progress = .init(); cacheRevision = UUID() } }

    func saveProgress(current: () -> NativeDataScope?, request: Request) async {
        guard !busy, let selection, let ready = visible(current()), ready.rights.cache else { return }
        let completed = ready.segments.map(\.id).filter { ready.completedSegmentIds.contains($0) || progress.completedSegmentIDs.contains($0) }
        let own = generation; busy = true; cacheRevision = UUID()
        defer { if generation == own { busy = false; cacheRevision = UUID() } }
        do {
            let bytes = try await request(selection, selection.command("progress", extra: [
                "operationId": UUID().uuidString.lowercased(), "expectedDigest": ready.digest, "completedSegmentIds": completed]))
            guard generation == own, current() == selection.scope, !Task.isCancelled else { return }
            let value = try NativePlaceGuideReady.decode(NativePlaceActionWire.bytes(unwrap(bytes)), expected: selection)
            guard value.digest == ready.digest, value.rights.cache, value.completedSegmentIds == completed else { throw NativeDataError.invalidResponse }
            self.ready = value; qualifiedRightsRevision = value.rights.revision; qualifiedExpiresAt = value.playbackExpiresAt
            deadline = min(deadline, uptime() + value.remaining())
        } catch { if own == generation { suspend(); notice = "unavailable" } }
    }

    /// Source withdrawal/expiry never prevents owner deletion of retained metadata.
    func forget(current: () -> NativeDataScope?, request: Request) async {
        guard !busy, let selection, current() == selection.scope else { return }
        let own = generation, operation = UUID().uuidString.lowercased(); busy = true; cacheRevision = UUID()
        ready = nil; deadline = 0; progress = .init(); qualifiedDigest = nil; cacheAllowed = false
        qualifiedSourceIdentifiers = []; qualifiedRightsRevision = nil; qualifiedExpiresAt = nil
        defer { if generation == own { busy = false; cacheRevision = UUID() } }
        do {
            let bytes = try await request(selection, selection.command("forget", extra: ["operationId": operation]))
            guard generation == own, current() == selection.scope, !Task.isCancelled else { return }
            let value = try NativePlaceActionWire.exact(unwrap(bytes), ["kind", "operationId"])
            guard value["kind"] as? String == "forgotten", value["operationId"] as? String == operation else { throw NativeDataError.invalidResponse }
            notice = "forgotten"
        } catch { if generation == own { notice = "delete_unconfirmed" } }
    }

    func guideCacheSnapshot(current: NativeDataScope) -> NativeGuideCacheDataSnapshot? {
        guard let selection, selection.scope == current else { return nil }
        let completed = cacheAllowed ? Array(Set((ready?.completedSegmentIds ?? []) + Array(progress.completedSegmentIDs))).sorted() : []
        return .init(instanceID: guideCacheInstanceID, generation: guideCacheGeneration, revision: cacheRevision,
            selection: selection, digest: qualifiedDigest, rightsRevision: qualifiedRightsRevision, cacheAllowed: cacheAllowed,
            sourceIdentifiers: qualifiedSourceIdentifiers, completedSegmentIDs: completed,
            progressSegmentID: cacheAllowed ? progress.segmentID : nil, progressCharacters: cacheAllowed ? progress.characters : 0,
            hasReady: ready != nil, busy: busy, sourceExpiresAt: qualifiedExpiresAt)
    }
    func clearGuideCache(expected: NativeGuideCacheDataSnapshot, current: NativeDataScope) -> Bool {
        guard guideCacheSnapshot(current: current) == expected else { return false }
        guideCacheFollowUp?.hideForLocalGuideCacheClear()
        clear(); requiresExplicitRead = true
        return guideCacheIsEmpty(current: current)
    }
    func guideCacheIsEmpty(current: NativeDataScope) -> Bool {
        selection == nil && ready == nil && qualifiedDigest == nil && progress == .init()
        && qualifiedSourceIdentifiers.isEmpty && qualifiedRightsRevision == nil && qualifiedExpiresAt == nil
        && !cacheAllowed && !busy && notice == nil && deadline == 0
    }

    static func outcome(_ bytes: Data) throws -> [String: Any] {
        guard bytes.count <= 65_536 else { throw NativeDataError.invalidResponse }
        let envelope = try NativePlaceActionWire.exact(JSONSerialization.jsonObject(with: bytes), ["data"])
        guard let outcome = envelope["data"] as? [String: Any] else { throw NativeDataError.invalidResponse }
        return outcome
    }
    private func unwrap(_ bytes: Data) throws -> [String: Any] { try Self.outcome(bytes) }
}
