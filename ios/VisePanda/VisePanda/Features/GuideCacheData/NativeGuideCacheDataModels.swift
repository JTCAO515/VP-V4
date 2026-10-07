import Foundation

/// A projection of an actual live Guide store. No published text or pending request bytes.
struct NativeGuideCacheDataSnapshot: Equatable {
    let instanceID: UUID
    let generation: UUID
    let revision: UUID
    let selection: NativePlaceGuideSelection
    let digest: String?
    let rightsRevision: Int?
    let cacheAllowed: Bool
    let sourceIdentifiers: [String]
    let completedSegmentIDs: [String]
    let progressSegmentID: String?
    let progressCharacters: Int
    let hasReady: Bool
    let busy: Bool
    let sourceExpiresAt: Date?

    var valid: Bool {
        selection.valid && sourceIdentifiers.count <= 32 && completedSegmentIDs.count <= 4
        && Set(sourceIdentifiers).count == sourceIdentifiers.count
        && Set(completedSegmentIDs).count == completedSegmentIDs.count
        && sourceIdentifiers.allSatisfy { UUID(uuidString: $0) != nil }
        && completedSegmentIDs.allSatisfy { UUID(uuidString: $0) != nil }
        && progressCharacters >= 0 && progressCharacters <= 2400
        && (progressSegmentID == nil || UUID(uuidString: progressSegmentID!) != nil)
        && (digest == nil || NativePlaceActionWire.digest(digest) != nil)
        && (rightsRevision == nil || rightsRevision! > 0)
        && (cacheAllowed || (sourceIdentifiers.isEmpty && completedSegmentIDs.isEmpty
            && progressSegmentID == nil && progressCharacters == 0))
    }
}

/// Clear is synchronous on the MainActor, so comparison, invalidation and inspection cannot interleave.
@MainActor protocol NativeGuideCacheDataSource: AnyObject {
    var guideCacheInstanceID: UUID { get }
    func guideCacheSnapshot(current: NativeDataScope) -> NativeGuideCacheDataSnapshot?
    func clearGuideCache(expected: NativeGuideCacheDataSnapshot, current: NativeDataScope) -> Bool
    func guideCacheIsEmpty(current: NativeDataScope) -> Bool
}

struct NativeGuideCacheDataPreview: Equatable {
    let id: UUID
    let actor: NativeCommunitySafetyActor
    let createdAt: Date
    let uptime: TimeInterval
    let snapshots: [NativeGuideCacheDataSnapshot]
    let renderer: NativeGuideCacheDataRendererState

    func valid(current: NativeCommunitySafetyActor?, now: Date, uptime currentUptime: TimeInterval) -> Bool {
        current == actor && now >= createdAt && now.timeIntervalSince(createdAt) < 30
        && currentUptime >= uptime && currentUptime - uptime < 30
        && snapshots.count <= 16 && !snapshots.isEmpty
        && snapshots.allSatisfy { $0.valid && $0.selection.scope == actor.scope }
        && Set(snapshots.map(\.instanceID)).count == snapshots.count
    }
}

/// Immutable local evidence. IDs identify local instances, never server deletion operations.
struct NativeGuideCacheDataReceipt: Codable, Equatable {
    let version: Int
    let operationID: UUID
    let completedAt: Date
    let instanceCount: Int
    let inspectedEmptyCount: Int
    let guideRendererInspectedEmpty: Bool
    let scope: String
    let serverData: String
    let pendingRequests: String
    let externalCopies: String
    let actorBinding: String
}

struct NativeGuideCacheDataRendererState: Equatable {
    let generation: UUID
    let callbackRevision: UUID
    let playbackID: String?
    let hasText: Bool
    let hasProgressCallback: Bool
    let paused: Bool
    let characters: Int
}

@MainActor protocol NativeGuideCacheDataRenderer: AnyObject {
    func guideCacheRendererState(current: NativeDataScope) -> NativeGuideCacheDataRendererState?
    func clearGuideCacheRenderer(expected: NativeGuideCacheDataRendererState, current: NativeDataScope) -> Bool
    func guideCacheRendererIsEmpty(current: NativeDataScope) -> Bool
}
