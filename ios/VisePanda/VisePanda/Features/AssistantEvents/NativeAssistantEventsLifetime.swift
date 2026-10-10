import Foundation

/// No local transcript or event can grant this authority. The session supplies it.
struct NativeAssistantEventsSelection: Equatable {
    let scope: NativeDataScope
    let sessionID: String
    let policyID: String
    let conversationID: String
    let selectionGeneration: UUID

    var valid: Bool {
        !scope.endpoint.isEmpty && !scope.subject.isEmpty && scope.mobileEpoch >= 0 &&
        !sessionID.isEmpty && !policyID.isEmpty && UUID(uuidString: conversationID) != nil
    }
}

struct NativeAssistantEventsLifetime {
    private(set) var selection: NativeAssistantEventsSelection?
    private(set) var generation = UUID()
    private(set) var active = false

    mutating func bind(_ next: NativeAssistantEventsSelection?, active: Bool) {
        guard selection != next || self.active != active else { return }
        selection = next?.valid == true ? next : nil
        self.active = active && selection != nil
        generation = UUID()
    }

    mutating func invalidate() { active = false; generation = UUID() }

    func accepts(_ captured: NativeAssistantEventsSelection, generation: UUID) -> Bool {
        active && captured.valid && selection == captured && self.generation == generation
    }
}
