import Foundation
import Observation

@MainActor
@Observable
final class NativeTripStore {
    private(set) var trips: [NativeTripSummary] = []
    private(set) var selectedID: String?
    private(set) var detail: NativeTripDetail?
    private(set) var pending: NativeTripPending?
    var draft: NativeTripDraft?
    private(set) var busy = false
    private(set) var notice: String?
    private(set) var scope: NativeDataScope?
    private var confirmationKeys: [String: String] = [:]
    private var creation: (id: String, title: String)?
    private let base = "api/trips/native/v2"

    var confirmationReference: String? {
        pending.map { "\($0.proposal.id):\($0.proposal.revision):\($0.proposal.digest)" }
    }

    func reset(for scope: NativeDataScope?) {
        guard self.scope != scope else { return }
        self.scope = scope
        trips = []; selectedID = nil; detail = nil; pending = nil; draft = nil
        confirmationKeys = [:]; creation = nil; notice = nil; busy = false
    }

    func list(using session: NativeSession) async {
        await perform(session) { scope in
            try await self.loadList(session, scope)
        }
    }

    func select(_ id: String, using session: NativeSession) async {
        guard draft == nil || selectedID == id else { notice = "finishDraft"; return }
        await perform(session) { scope in
            guard UUID(uuidString: id) != nil else { throw NativeDataError.invalidResponse }
            if self.selectedID != id { self.detail = nil; self.pending = nil }
            self.selectedID = id
            try await self.loadSelected(session, scope)
        }
    }

    func reload(using session: NativeSession) async {
        await perform(session) { scope in
            try await self.loadList(session, scope)
            if self.selectedID != nil { try await self.loadSelected(session, scope) }
        }
    }

    func create(title: String, using session: NativeSession) async {
        guard draft == nil else { notice = "finishDraft"; return }
        let title = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty, title.count <= 160 else { notice = "INVALID_INPUT"; return }
        await perform(session) { scope in
            if self.creation?.title != title { self.creation = (UUID().uuidString.lowercased(), title) }
            guard let creation = self.creation else { throw NativeDataError.invalidResponse }
            let reply: NativeTripCreated = try await self.call(session, scope, path: self.base, method: "POST", body: ["tripId": creation.id, "title": title])
            guard reply.version == 2, reply.trip.id == creation.id else { throw NativeDataError.invalidResponse }
            self.creation = nil
            self.detail = nil; self.pending = nil
            self.selectedID = reply.trip.id
            try await self.loadList(session, scope)
            try await self.loadSelected(session, scope)
        }
    }

    func beginDraft() {
        guard !busy, pending == nil, let detail else { return }
        draft = NativeTripDraft(detail)
        notice = nil
    }

    func discardDraft() {
        guard !busy, pending == nil else { return }
        draft = nil
        notice = nil
    }

    func propose(using session: NativeSession) async {
        guard let draft, !draft.patch.operations.isEmpty else { notice = "noChanges"; return }
        let patch = draft.patch
        await perform(session) { scope in
            let created: NativeProposalCreated = try await self.call(session, scope, path: "\(self.base)/\(draft.tripId)/proposal", method: "POST", body: ProposalBody(patch: patch))
            let result = try await self.readPending(draft.tripId, proposalID: created.proposalId, session, scope)
            guard result.proposal.id == created.proposalId,
                  result.proposal.revision == created.revision,
                  result.proposal.baseTripVersion == draft.baseVersion,
                  result.proposal.patch == patch else { throw NativeDataError.invalidResponse }
            self.pending = result
            self.notice = "reviewRequired"
        }
    }

    func confirm(reviewedReference: String, using session: NativeSession) async {
        guard confirmationReference == reviewedReference, let pending, !pending.proposal.stale, pending.proposal.status == "pending", detail?.trip.headVersion == pending.proposal.baseTripVersion else { notice = "PROPOSAL_NOT_CONFIRMABLE"; return }
        let proposal = pending.proposal
        await perform(session) { scope in
            let keyID = "\(proposal.id):\(proposal.revision):\(proposal.digest)"
            let key = self.confirmationKeys[keyID] ?? UUID().uuidString
            self.confirmationKeys[keyID] = key
            let result: NativeTripConfirmed = try await self.call(session, scope, path: "\(self.base)/\(pending.trip.id)/confirm", method: "POST", body: ConfirmBody(proposalId: proposal.id, idempotencyKey: key, digest: proposal.digest))
            guard result.version == 2, ["applied", "already_applied"].contains(result.outcome) else { throw NativeDataError.invalidResponse }
            // Never infer the new content from the submitted patch or an HTTP success.
            self.pending = nil
            self.draft = nil
            try await self.loadList(session, scope)
            try await self.loadSelected(session, scope)
            guard let detail = self.detail, detail.trip.headVersion >= result.resultingVersion, detail.confirmationState == "confirmed" else { throw NativeDataError.invalidResponse }
            self.notice = "confirmed"
        }
    }

    func reject(using session: NativeSession) async {
        guard let pending else { return }
        await perform(session) { scope in
            let result: Rejected = try await self.call(session, scope, path: "\(self.base)/\(pending.trip.id)/proposal/reject", method: "POST", body: ["proposalId": pending.proposal.id])
            guard result.version == 2, result.status == "rejected", result.proposalId == pending.proposal.id else { throw NativeDataError.invalidResponse }
            self.pending = nil
            // Existing local edits remain available after rejecting a proposal.
            self.notice = "rejected"
            try await self.loadSelected(session, scope)
        }
    }

    private func loadList(_ session: NativeSession, _ scope: NativeDataScope) async throws {
        let result: NativeTripList = try await call(session, scope, path: base, method: "GET")
        guard result.version == 2, result.trips.allSatisfy({ UUID(uuidString: $0.id) != nil }) else { throw NativeDataError.invalidResponse }
        trips = result.trips
    }

    private func loadSelected(_ session: NativeSession, _ scope: NativeDataScope) async throws {
        guard let selectedID else { return }
        let result: NativeTripDetail = try await call(session, scope, path: "\(base)/\(selectedID)", method: "GET")
        guard result.version == 2, result.trip.id == selectedID,
              result.hardLocks == "unknown", result.externalOrderStatus == "unknown" else { throw NativeDataError.invalidResponse }
        detail = result
        do { pending = try await readPending(selectedID, proposalID: nil, session, scope) }
        catch NativeDataError.server(let code) where code == "PROPOSAL_NOT_CONFIRMABLE" { pending = nil }
        if let draft, draft.baseVersion != result.trip.headVersion { notice = "STALE_TRIP_VERSION" }
    }

    private func readPending(_ tripID: String, proposalID: String?, _ session: NativeSession, _ scope: NativeDataScope) async throws -> NativeTripPending {
        let query = proposalID.map { [URLQueryItem(name: "proposalId", value: $0)] } ?? []
        let result: NativeTripPending = try await call(session, scope, path: "\(base)/\(tripID)/proposal", method: "GET", query: query)
        guard result.version == 2, result.trip.id == tripID, result.proposal.status == "pending",
              !result.proposal.digest.isEmpty, result.proposal.patch.expectedVersion == result.proposal.baseTripVersion else { throw NativeDataError.invalidResponse }
        return result
    }

    private func perform(_ session: NativeSession, operation: (NativeDataScope) async throws -> Void) async {
        guard !busy, let scope, session.dataScope == scope else { return }
        busy = true; notice = nil
        defer { if self.scope == scope { busy = false } }
        do { try await operation(scope) }
        catch {
            guard self.scope == scope, session.dataScope == scope else { reset(for: session.retainedDataScope); return }
            switch error {
            case NativeDataError.server(let code): notice = code
            case NativeDataError.invalidResponse, is DecodingError: notice = "invalidResponse"
            case NativeDataError.sessionUnavailable, NativeDataError.staleSessionResponse: notice = "sessionUnavailable"
            default: notice = "networkRetry"
            }
        }
    }

    private func call<T: Decodable>(_ session: NativeSession, _ scope: NativeDataScope, path: String, method: String, query: [URLQueryItem] = []) async throws -> T {
        let data = try await session.tripRequest(path: path, method: method, queryItems: query)
        guard self.scope == scope, session.dataScope == scope else { throw NativeDataError.staleSessionResponse }
        return try JSONDecoder().decode(T.self, from: data)
    }

    private func call<T: Decodable, Body: Encodable>(_ session: NativeSession, _ scope: NativeDataScope, path: String, method: String, body: Body) async throws -> T {
        let data = try await session.tripRequest(path: path, method: method, body: JSONEncoder().encode(body))
        guard self.scope == scope, session.dataScope == scope else { throw NativeDataError.staleSessionResponse }
        return try JSONDecoder().decode(T.self, from: data)
    }

    private struct ProposalBody: Encodable { let patch: NativeTripPatch }
    private struct ConfirmBody: Encodable { let proposalId: String; let idempotencyKey: String; let digest: String }
    private struct Rejected: Decodable { let version: Int; let proposalId: String; let status: String }
}
