import Foundation

/// Ephemeral read-cache invalidation. Contains no receipt/content and admits no
/// action; shared readers retain their own permanent erasure fences and journals.
struct NativeAssistantEventsInvalidation: Equatable {
    let id: UUID
    let selection: NativeAssistantEventsSelection
    let object: NativeAssistantEventsReference.Object?

    func matches(scope: NativeDataScope?, sessionID: String?) -> Bool {
        selection.scope == scope && selection.sessionID == sessionID
    }
}
