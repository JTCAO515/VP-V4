import Foundation
import Observation

struct NativePDFIntakeSource: Identifiable {
    let id = UUID()
    let actor: NativeDataScope
    let detail: NativeTripDetail
}

@MainActor @Observable final class NativePDFIntakeStore {
    let source: NativePDFIntakeSource
    private(set) var document: NativePDFDocument?
    private(set) var receipt: NativePDFInbox.Receipt?
    private(set) var fields: [NativePDFField] = []
    private(set) var preview: NativePDFPreview?
    private(set) var command: NativePDFCommand?
    private(set) var journal: NativePDFJournal?
    private(set) var message: String?
    private(set) var busy = false
    private let inbox: NativePDFInbox
    private var generation = UUID()
    private var readTask: Task<(Data, NativePDFDocument), Error>?
    private var cleanupPending = false
    init(source: NativePDFIntakeSource, inbox: NativePDFInbox = NativePDFInbox()) { self.source = source; self.inbox = inbox }
    private func current(_ session: NativeSession) -> Bool { session.dataScope == source.actor }

    func start(using session: NativeSession) {
        do {
            guard current(session) else { throw NativePDFError.scope }
            // A process restart cannot reuse abandoned raw copies. The separate unknown-ACK journal survives.
            try inbox.eraseAll()
            journal = try session.pdfIntakeRecovery(actor: source.actor)
            if journal != nil { message = "recoveryRequired" }
        } catch { cleanupPending = true; message = "cleanupRequired" }
    }
    func load(_ url: URL, using session: NativeSession, expiresNoLaterThan: Date? = nil) async {
        guard current(session), !busy, journal == nil else { return }
        if let expiry = expiresNoLaterThan, !expiry.timeIntervalSince1970.isFinite || expiry <= Date() {
            message = "expired"; return
        }
        guard clearCopy() else { return }
        busy = true; message = nil
        let token = generation
        let namespace = NativePDFWire.namespace(source.actor)
        let task = Task.detached(priority: .userInitiated) {
            let bytes = try NativePDFDocument.readSelectedURL(url)
            try Task.checkCancellation()
            let document = try NativePDFDocument.extract(bytes)
            try Task.checkCancellation()
            return (bytes, document)
        }
        readTask = task
        defer { if generation == token { busy = false; readTask = nil } }
        do {
            let result = try await task.value
            guard current(session), generation == token, !Task.isCancelled else { return }
            // Publish the protected copy only after main-actor revalidation. No detached writer can race logout/clear.
            let saved = try inbox.receiveValidated(result.0, document: result.1, namespace: namespace, expiresNoLaterThan: expiresNoLaterThan)
            receipt = saved; document = result.1
            if result.1.pages.allSatisfy({ $0.lines.isEmpty }) { message = "unavailable" }
        } catch is CancellationError {} catch {
            if generation == token { message = errorCode(error) }
        }
    }
    func keep(kind: String, value: String, line: NativePDFDocument.Line) {
        guard !busy, journal == nil, NativePDFField.validValue(value, kind: kind),
              document?.pages.first(where: { $0.id == line.page })?.lines.contains(line) == true else { return }
        fields.removeAll { $0.kind == kind }
        fields.append(.init(kind: kind, value: value, locator: .init(page: line.page, line: line.number,
            sourceTextHash: NativePDFDocument.digest(Data(line.text.utf8)))))
        generation = UUID(); preview = nil; command = nil; message = nil
    }
    func remove(_ kind: String) { guard !busy, journal == nil else { return }; generation = UUID(); fields.removeAll { $0.kind == kind }; preview = nil; command = nil }

    func review(using session: NativeSession) async {
        guard !busy, current(session), journal == nil, let receipt, let document else { return }
        generation = UUID(); let token = generation
        busy = true; defer { if generation == token { busy = false } }
        do {
            try inbox.validate(receipt, namespace: NativePDFWire.namespace(source.actor))
            let command = NativePDFCommand(operationId: UUID().uuidString.lowercased(), expectedHeadVersion: source.detail.trip.headVersion,
                contentHash: document.digest, byteCount: document.bytes, pageCount: document.pages.count, extraction: "pdfkit_text",
                expiresAt: NativePDFWire.instant(receipt.expiresAt), fields: fields)
            let bytes = try await session.pdfIntakeRequest(tripID: source.detail.trip.id, action: "preview", body: command.encoded(), actor: source.actor)
            let preview = try JSONDecoder().decode(NativePDFPreview.self, from: bytes)
            guard generation == token, current(session), self.receipt == receipt, !Task.isCancelled else { return }
            try inbox.validate(receipt, namespace: NativePDFWire.namespace(source.actor))
            guard preview.matches(command, tripID: source.detail.trip.id) else { throw NativeDataError.invalidResponse }
            self.command = command; self.preview = preview; message = nil
        } catch { if generation == token { message = errorCode(error) } }
    }

    func propose(using session: NativeSession, tripStore: NativeTripStore) async -> Bool {
        guard !busy, current(session), journal == nil, let receipt, let command, let preview,
              preview.matches(command, tripID: source.detail.trip.id), preview.patch != nil else { return false }
        busy = true; defer { busy = false }
        do {
            try inbox.validate(receipt, namespace: NativePDFWire.namespace(source.actor))
            let commandObject = try JSONSerialization.jsonObject(with: command.encoded())
            let bytes = try JSONSerialization.data(withJSONObject: ["command": commandObject, "reviewedPreviewDigest": preview.previewDigest], options: [.sortedKeys, .withoutEscapingSlashes])
            let value = NativePDFJournal(endpoint: source.actor.endpoint, owner: source.actor.subject, epoch: source.actor.mobileEpoch,
                tripID: source.detail.trip.id, command: command, previewDigest: preview.previewDigest, bytes: bytes)
            try session.rememberPDFIntake(value, actor: source.actor)
            journal = value // Persisted before the first POST. Errors always recover this exact operation.
            return try await send(value, using: session, tripStore: tripStore)
        } catch { message = errorCode(error); return false }
    }

    private func send(_ value: NativePDFJournal, using session: NativeSession, tripStore: NativeTripStore) async throws -> Bool {
        let bytes = try await session.pdfIntakeRequest(tripID: value.tripID, action: "proposal", body: value.bytes, actor: source.actor)
        let result = try JSONDecoder().decode(NativePDFProposal.self, from: bytes)
        guard result.kind == "pdf_intake_proposal/1", result.operationId == value.command.operationId, result.tripId == value.tripID,
              result.sessionEpoch == source.actor.mobileEpoch, result.requestDigest == value.requestDigest,
              result.commandDigest == value.command.digest, result.previewDigest == value.previewDigest,
              result.baseTripVersion == value.command.expectedHeadVersion else { throw NativeDataError.invalidResponse }
        return await adopt(value, proposalID: result.proposalId, revision: result.proposalRevision, tripStore: tripStore, session: session)
    }
    private func adopt(_ value: NativePDFJournal, proposalID: String, revision: Int, tripStore: NativeTripStore, session: NativeSession) async -> Bool {
        guard current(session), value.tripID == source.detail.trip.id else { message = "otherTrip"; return false }
        let adopted = await tripStore.adoptPDFProposal(tripID: value.tripID, proposalID: proposalID, revision: revision,
            baseVersion: value.command.expectedHeadVersion, expectedPatch: preview?.patch, using: session)
        guard adopted, current(session) else { message = "recoveryRequired"; return false }
        message = "reviewRequired"
        return clearCopy() // Unknown bytes remain until original confirmation/cancel is proved.
    }
    func recover(using session: NativeSession, tripStore: NativeTripStore) async -> Bool {
        guard !busy, current(session), let value = journal, value.matches(source.actor) else { return false }
        busy = true; defer { busy = false }
        do {
            let bytes = try await session.pdfIntakeRequest(tripID: value.tripID, action: "operation", operationID: value.command.operationId, actor: source.actor)
            let result = try JSONDecoder().decode(NativePDFOperation.self, from: bytes)
            guard operationMatches(result, value: value) else { throw NativeDataError.invalidResponse }
            if result.state == "absent" {
                guard NativePDFWire.date(value.command.expiresAt).map({ $0 > Date() }) == true else { message = "expired"; return false }
                return try await send(value, using: session, tripStore: tripStore)
            }
            if result.state == "pending", let id = result.proposalId, let revision = result.proposalRevision {
                return await adopt(value, proposalID: id, revision: revision, tripStore: tripStore, session: session)
            }
            if result.state == "confirmed" {
                // The server proves the original applied receipt. A higher Trip head alone never proves this.
                await tripStore.select(value.tripID, using: session)
                guard current(session), tripStore.selectedID == value.tripID, tripStore.detail?.trip.id == value.tripID, (tripStore.detail?.trip.headVersion ?? -1) >= (result.resultingVersion ?? Int.max) else { throw NativeDataError.staleSessionResponse }
                let journalObserver = session.journalDataObservation(.pdf), journalTicket = journalObserver.begin()
                try session.completePDFIntake(value, actor: source.actor); journal = nil; message = "confirmed"
                journalObserver.finish(journalTicket, value.command.operationId)
                return clearCopy()
            }
            message = result.state // Terminal read keeps the unknown journal. Explicit Cancel resolves it.
            return false
        } catch { message = errorCode(error); return false }
    }
    func cancel(using session: NativeSession) async -> Bool {
        guard !busy, current(session) else { return false }
        guard let value = journal else { return clearCopy() }
        busy = true; defer { busy = false }
        do {
            let body = try JSONSerialization.data(withJSONObject: ["operationId": value.command.operationId], options: [.sortedKeys])
            let bytes = try await session.pdfIntakeRequest(tripID: value.tripID, action: "cancel", body: body, actor: source.actor)
            let result = try JSONDecoder().decode(NativePDFOperation.self, from: bytes)
            guard operationMatches(result, value: value), result.state == "cancelled" else { throw NativeDataError.invalidResponse }
            let journalObserver = session.journalDataObservation(.pdf), journalTicket = journalObserver.begin()
            try session.completePDFIntake(value, actor: source.actor); journal = nil
            journalObserver.finish(journalTicket, value.command.operationId)
            return clearCopy()
        } catch { message = errorCode(error); return false }
    }
    private func operationMatches(_ result: NativePDFOperation, value: NativePDFJournal) -> Bool {
        result.matches(value, actor: source.actor)
    }
    func expire() { if clearCopy() { message = "expired" } }
    @discardableResult func clearCopy() -> Bool {
        generation = UUID(); readTask?.cancel(); readTask = nil; busy = false
        do {
            if cleanupPending { try inbox.eraseAll(); cleanupPending = false }
            if let receipt { try inbox.delete(receipt) }
            receipt = nil; document = nil; fields = []; command = nil; preview = nil
            return true
        } catch { message = "cleanupRequired"; return false }
    }
    private func errorCode(_ error: Error) -> String {
        switch error {
        case let value as NativePDFError: return String(describing: value)
        case NativeDataError.server(let code): return code
        case NativeDataError.staleSessionResponse: return "scope"
        default: return journal == nil ? "readOrPreviewUnavailable" : "recoveryRequired"
        }
    }
}
