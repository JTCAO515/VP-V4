import Foundation

/// Normalized input from the closed wire decoder, never decoded server content.
/// A notification is an invalidation hint; original readers own display eligibility.
struct NativeAssistantEventsReference: Equatable {
    enum Object: Hashable { case task(String), artifact(String) }
    let eventID: String
    let cursor: String
    let object: Object
    let revision: Int
    let invalidated: Bool

    var valid: Bool {
        let id: String
        switch object { case .task(let value), .artifact(let value): id = value }
        return UUID(uuidString: id) != nil && revision > 0 &&
            !cursor.isEmpty && cursor.utf8.count <= 512 &&
            !eventID.isEmpty && eventID.utf8.count <= 160
    }
}

/// In-memory state has no authority after suspension. Durable replay is server-owned.
/// The adapter persists only an opaque cursor after successful original readback.
@MainActor
final class NativeAssistantEventsProjection {
    enum Outcome: Equatable { case applied, duplicate, stale, unavailable }
    private(set) var lifetime = NativeAssistantEventsLifetime()
    private(set) var cursor: String?
    private var revisions: [NativeAssistantEventsReference.Object: Int] = [:]
    private var identities: [String: NativeAssistantEventsReference] = [:]
    private var identityOrder: [String] = []
    private var busy = false

    func bind(_ selection: NativeAssistantEventsSelection?, active: Bool) {
        let old = lifetime.generation
        lifetime.bind(selection, active: active)
        if old != lifetime.generation { resetProjection() }
    }

    func suspend() { lifetime.invalidate(); resetProjection() }

    private func resetProjection() {
        cursor = nil; revisions.removeAll(); identities.removeAll(); identityOrder.removeAll(); busy = false
    }

    /// Calls no submit/cancel/confirm writer and never changes navigation or draft state.
    /// `readCurrent` must recheck original policy, membership and current revision.
    func consume(_ reference: NativeAssistantEventsReference,
                 selection: NativeAssistantEventsSelection,
                 clear: (NativeAssistantEventsReference.Object) -> Void,
                 readCurrent: (NativeAssistantEventsReference) async throws -> Bool,
                 saveCursor: (NativeAssistantEventsSelection, String) throws -> Void) async throws -> Outcome {
        let generation = lifetime.generation
        guard reference.valid, lifetime.accepts(selection, generation: generation), !busy,
              !Task.isCancelled else { return .stale }
        guard let sequence = Int(reference.cursor), (1...999_999_999_999_999).contains(sequence),
              reference.cursor == String(sequence), reference.eventID == "\(selection.conversationID):\(sequence)" else {
            throw NativeDataError.invalidResponse
        }
        if let previous = identities[reference.eventID] {
            guard previous == reference else { throw NativeDataError.invalidResponse }
            return .duplicate
        }
        guard reference.revision >= (revisions[reference.object] ?? 0),
              sequence > (cursor.flatMap(Int.init) ?? 0),
              revisions[reference.object] != nil || revisions.count < 200 else {
            throw NativeDataError.invalidResponse
        }
        busy = true
        defer { if lifetime.generation == generation { busy = false } }
        // Clear before await, including withdraw/delete; failed read never leaves old display.
        clear(reference.object)
        let eligible: Bool
        do { eligible = try await readCurrent(reference) }
        catch {
            guard lifetime.accepts(selection, generation: generation) else { return .stale }
            throw error
        }
        guard lifetime.accepts(selection, generation: generation), !Task.isCancelled else { return .stale }
        guard eligible || reference.invalidated else { return .unavailable }
        // Write-before-ack: a failed cursor save forces replay of the complete event.
        try saveCursor(selection, reference.cursor)
        revisions[reference.object] = reference.revision
        identities[reference.eventID] = reference
        identityOrder.append(reference.eventID)
        if identityOrder.count > 50 { identities.removeValue(forKey: identityOrder.removeFirst()) }
        cursor = reference.cursor
        return .applied
    }
}
