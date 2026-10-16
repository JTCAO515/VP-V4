import Foundation

/// Native credentials remain in NativeSession; this port exposes only the QA wire.
@MainActor
final class NativeQASessionTransport: NativeQATransport {
    private let session: NativeSession
    private let journal: NativeQAPendingJournal
    private var observedScope: NativeDataScope?
    private var observedDeletion: UUID?
    private var presentationGeneration = 0
    private var verifiedAdmission: (pending: NativeQAPending, scope: NativeDataScope)?

    init(session: NativeSession, journal: NativeQAPendingJournal) {
        self.session = session
        self.journal = journal
    }

    func matches(session other: NativeSession) -> Bool { session === other }

    var scope: NativeDataScope? {
        guard let base = session.dataScope else {
            observedScope = nil
            observedDeletion = nil
            verifiedAdmission = nil
            return nil
        }
        let deletion = session.nativeQAProjectionGeneration
        if observedScope != base || observedDeletion != deletion {
            guard presentationGeneration < Int.max else { return nil }
            presentationGeneration += 1
            observedScope = base
            observedDeletion = deletion
            verifiedAdmission = nil
        }
        // This is a local presentation lease, never a new identity or mobile epoch.
        return NativeDataScope(endpoint: base.endpoint, subject: base.subject,
                               mobileEpoch: base.mobileEpoch, generation: presentationGeneration)
    }

    private func current(_ expected: NativeDataScope) throws -> NativeDataScope {
        guard scope == expected, let base = session.dataScope,
              base.endpoint == expected.endpoint, base.subject == expected.subject,
              base.mobileEpoch == expected.mobileEpoch else { throw NativeQAError.stale }
        return base
    }

    func request(_ command: NativeQARequest, scope expected: NativeDataScope) async throws -> NativeQAHTTPResponse {
        let base = try current(expected)
        verifiedAdmission = nil
        let response = try await session.nativeQARequest(command, scope: base)
        _ = try current(expected)
        if case .recover(let sessionID, let requestID) = command,
           response.status == 200,
           let pending = try journal.load(scope: base), pending.matches(expected),
           pending.sessionID == sessionID, pending.requestID == requestID,
           let receipt = try? NativeQAWire.decode(NativeQAWire.Message.self, response: response),
           receipt.message.valid(sessionID: sessionID), receipt.message.requestId == requestID,
           pending.matchesOriginalInputBytes(receipt.message.input) {
            _ = try current(expected)
            verifiedAdmission = (pending, expected)
        }
        return response
    }

    func loadPending(scope expected: NativeDataScope) throws -> NativeQAPending? {
        let base = try current(expected)
        let pending = try journal.load(scope: base)
        _ = try current(expected)
        return pending
    }

    func retainPending(_ pending: NativeQAPending, scope expected: NativeDataScope) throws {
        let base = try current(expected)
        guard pending.matches(expected) else { throw NativeQAError.stale }
        try journal.retain(pending, scope: base)
        _ = try current(expected)
    }

    func clearPending(_ pending: NativeQAPending, scope expected: NativeDataScope) throws {
        let base = try current(expected)
        guard verifiedAdmission?.scope == expected, verifiedAdmission?.pending == pending else {
            throw NativeQAError.journalUnavailable
        }
        try journal.clearExact(pending, scope: base)
        _ = try current(expected)
        verifiedAdmission = nil
    }
}
