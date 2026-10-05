import Foundation

/// Session-owned transport and protected recovery. UI cannot supply credentials or read grants.
@MainActor struct NativeExperienceAccess {
    let current: () -> NativeCommunitySafetyActor?
    let request: (Data, NativeCommunitySafetyActor) async throws -> Data
    let read: (NativeCommunitySafetyActor) throws -> NativeExperiencePending?
    let retain: (Data, NativeCommunitySafetyActor) throws -> NativeExperiencePending
    let complete: (NativeExperiencePending, NativeCommunitySafetyActor) throws -> Void
}
