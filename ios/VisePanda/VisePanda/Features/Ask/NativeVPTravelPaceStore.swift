import Foundation
import Observation

/// Reuses the two existing authorities: Profile pace and explicit current-goal intake.
@MainActor @Observable
final class NativeVPTravelPaceStore {
    let saved = NativeTravelPaceStore()
    let current = NativeTravelIntakeStore()
    private(set) var selection: NativeTravelIntakeSelection?
    private(set) var activeScope: NativeDataScope?
    private(set) var localProjection: NativeTaskTravelPace?
    var choice: NativeTravelPace = .balanced
    var consent = false
    private(set) var saveReadbackChanged = false
    private(set) var lastSavedAction: String?
    var savedNotice: String? { saved.notice ?? lastSavedAction }
    func bind(scope: NativeDataScope?, selection: NativeTravelIntakeSelection?) {
        if activeScope != scope { saved.reset(for: scope); choice = .balanced; consent = false; lastSavedAction = nil; saveReadbackChanged = false }
        if self.selection != selection { localProjection = nil }
        activeScope = scope; self.selection = selection; current.bind(selection)
    }
    func applyProfileErasure(_ value: NativeProfileDataErasure?) {
        guard let value, activeScope == value.actor.scope else { return }
        saved.applyProfileErasure(value)
        if saved.snapshot == nil { choice = .balanced; consent = false; lastSavedAction = nil; saveReadbackChanged = false }
        if let projection = localProjection, projection.source == "profile", (projection.sourceRevision ?? 0) < value.paceFloor { localProjection = nil }
    }
    func load(using session: NativeSession, selected: @escaping () -> NativeTravelIntakeSelection?) async {
        bind(scope: session.dataScope, selection: selected())
        await saved.load(using: session)
        guard activeScope == session.dataScope else { return }
        if let pace = saved.snapshot?.travelPace { choice = pace }
        consent = saved.snapshot?.state == "explicit"
        await current.load(request: { try await session.travelIntakeRequest(conversationID: $0, goalID: $1) }, current: selected)
    }
    var currentExplicitPace: NativeTravelPace? {
        guard let value = current.basis?.intake.pace else { return nil }
        return value == "fast" ? .packed : NativeTravelPace(rawValue: value)
    }
    func applyThisTime(using session: NativeSession, chinese: Bool,
                       selected: @escaping () -> NativeTravelIntakeSelection?, accepted: @escaping () async -> Void) {
        guard current.canSubmit, let basis = current.basis, current.selection == selected() else { return }
        var projection = basis.intake
        projection.pace = choice == .packed ? "fast" : choice.rawValue
        current.draft = projection
        current.submit(locale: chinese ? "zh" : "en", current: selected,
            post: { try await session.submitTravelIntakeRequest($0) },
            read: { try await session.travelIntakeRequest(conversationID: $0, goalID: $1) }, accepted: accepted)
    }
    func saveLongTerm(using session: NativeSession) async {
        saveReadbackChanged = false; localProjection = nil; lastSavedAction = nil
        await saved.save(choice, consent: consent, using: session)
        guard saved.pending == nil, let acknowledged = saved.snapshot, acknowledged.state == "explicit", let scope = session.dataScope else { return }
        await saved.load(using: session)
        guard session.dataScope == scope else { return }
        saveReadbackChanged = saved.snapshot?.revision != acknowledged.revision || saved.snapshot?.operationId != acknowledged.operationId
    }
    func changeSaved(_ action: String, using session: NativeSession) async {
        localProjection = nil; lastSavedAction = nil
        await saved.change(action, using: session)
        guard saved.pending == nil, let acknowledgment = saved.snapshot, let confirmed = saved.notice,
              confirmed == "undone" || confirmed == action, let scope = session.dataScope else { return }
        await saved.load(using: session)
        guard session.dataScope == scope, saved.snapshot?.revision == acknowledgment.revision,
              saved.snapshot?.operationId == acknowledgment.operationId, saved.snapshot?.state == acknowledgment.state else { return }
        lastSavedAction = confirmed
    }
    func previewSavedForTrip(_ tripID: String, using session: NativeSession) async {
        guard saved.snapshot?.state == "explicit", let revision = saved.snapshot?.revision, let scope = session.dataScope else { return }
        localProjection = nil
        do {
            let value = try await NativeTaskTravelPaceReader.read(tripID: tripID, choice: .saved, expectedSourceRevision: revision,
                currentScope: { session.dataScope }, request: { try await session.memoryRequest(path: "api/memory/native/v1/travel-pace/project", method: "POST", body: $0) })
            guard session.dataScope == scope, saved.scope == scope, saved.snapshot?.revision == revision,
                  saved.snapshot?.operationId == value.sourceOperationId else { return }
            localProjection = value
        } catch { localProjection = nil }
    }
    func leave() {
        current.invalidate(); localProjection = nil
        if let toast = saved.toast { saved.dismissToast(toast.operationId) }
        selection = nil
    }
}
