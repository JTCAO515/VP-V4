import Foundation

/// A read-only local stamp. A guest never becomes a NativeDataScope.
struct NativeLocalVoiceIdentity: Equatable {
    let session: ObjectIdentifier
    let signedScope: NativeDataScope?
    let subject: String?
    let status: String
    let generation: Int
    let endpointEnabled: Bool
    let locale: String

    var recognitionLocale: String? {
        if locale.hasPrefix("zh") { return "zh-CN" }
        if locale.hasPrefix("en") { return "en-US" }
        return nil
    }
}

extension NativeLocalVoiceIdentity {
    @MainActor init(settings: AppSettings) {
        let session = settings.nativeSession
        self.session = ObjectIdentifier(session)
        signedScope = session.dataScope
        subject = session.subject
        status = session.status
        generation = session.dataGeneration
        endpointEnabled = session.enabled
        locale = settings.selectedLocale.rawValue
    }

}

struct NativeLocalVoiceContext: Equatable {
    let state: ObjectIdentifier
    let conversation: String
    let epoch: UUID
    let revision: UUID
    let originalDraft: String
    let chatContext: String?
    let identity: NativeLocalVoiceIdentity

    @MainActor init(state: NativeFrontendState, identity: NativeLocalVoiceIdentity) {
        self.state = ObjectIdentifier(state)
        conversation = state.activeLocalConversationID
        epoch = state.localInputEpoch
        revision = state.localDraftRevision
        originalDraft = state.draft
        chatContext = state.chatContext
        self.identity = identity
    }
}
