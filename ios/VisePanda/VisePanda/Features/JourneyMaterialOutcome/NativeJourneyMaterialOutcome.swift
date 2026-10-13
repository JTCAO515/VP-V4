import Foundation
import Observation

/// Transient original-writer handoff. No material, Task, metric sink or Trip writer.
enum NativeJourneyMaterialOutcome {
    enum Medium: String, Codable, Sendable { case pdf, screenshot }
    struct Context: Equatable, Sendable {
        let actor: NativeDataScope
        let tripID: String
        let tripVersion: Int
        let active: Bool
        let readable: Bool
        let editable: Bool
        var eligible: Bool {
            active && readable && NativePDFWire.uuid(tripID)
                && NativePDFWire.uuid(actor.subject) && !actor.endpoint.isEmpty
                && actor.mobileEpoch > 0 && actor.generation >= 0
                && (0...999_999_998).contains(tripVersion)
        }
    }
    struct Selection: Equatable, Sendable {
        let logicalID: UUID
        let processID: UUID
        let context: Context
        let medium: Medium
        let started: TimeInterval
        let expires: TimeInterval
    }
    struct Proposal: Equatable, Sendable {
        let id: String
        let revision: Int
        let digest: String
        let baseVersion: Int
        let expiresAt: Date
    }
    /// Internal original source tuple, never a Result artifact or measurement Signal.
    struct PDFSource: Equatable, Sendable {
        let operationID: String
        let requestDigest: String
        let commandDigest: String
        let previewDigest: String
        let contentHash: String
        let byteCount: Int
        let pageCount: Int
        let extraction: String
        let expiresAt: String
        let confirmationEventID: String
    }
    struct Confirmed: Equatable, Sendable {
        let selection: Selection
        let proposal: Proposal
        let source: PDFSource
        let resultingVersion: Int
        let elapsedMilliseconds: Int?
    }
    enum Phase: Equatable { case idle, correcting, awaitingDiff, confirmationUnknown, confirmed, unavailable }
    enum Exit { case cancelled, skipped, rejected, scopeChanged, expired }
    enum Reason: Equatable { case screenshotLineageUnavailable, originalProofUnavailable, stale, protectedSourceUnavailable }
    enum Handoff: Equatable {
        case continuation(Reason)
        // Local original receipt/readback proof is NOT protected measurement admission.
        case confirmedReadback(Confirmed)
    }
}

@MainActor @Observable final class NativeJourneyMaterialOutcomeStore {
    typealias Domain = NativeJourneyMaterialOutcome
    private(set) var phase: Domain.Phase = .idle
    private(set) var selection: Domain.Selection?
    private(set) var confirmed: Domain.Confirmed?
    private var proposal: Domain.Proposal?
    private var journal: NativePDFJournal?
    private var confirmationKey: String?
    private var rendered = false
    private let processID: UUID
    private let uptime: () -> TimeInterval
    private let now: () -> Date

    init(processID: UUID = UUID(), uptime: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime },
         now: @escaping () -> Date = Date.init) {
        self.processID = processID; self.uptime = uptime; self.now = now
    }
    /// Explicit new selection only; original actor/active/current Trip/cleanup guards
    /// must pass before this boundary and before any bytes/extraction/OCR.
    @discardableResult func select(context: Domain.Context, medium: Domain.Medium) -> Domain.Selection? {
        clear()
        let start = uptime()
        guard context.eligible, start.isFinite, start >= 0, (start + 1800).isFinite else { return nil }
        let value = Domain.Selection(logicalID: UUID(), processID: processID, context: context,
                                     medium: medium, started: start, expires: start + 1800)
        selection = value; phase = .correcting
        return value
    }
    func current(_ value: Domain.Selection, context: Domain.Context, confirmedVersion: Int? = nil) -> Bool {
        guard selection == value else { return false } // A late old callback cannot clear a newer selection.
        let clock = uptime()
        guard context.eligible, context.actor == value.context.actor, context.tripID == value.context.tripID,
              context.tripVersion == (confirmedVersion ?? value.context.tripVersion),
              clock.isFinite, clock >= value.started, clock < value.expires else { clear(); return false }
        return true
    }
    /// Original journal matches authentic actor and canonical original command bytes.
    /// A retry cannot replace any source tuple, bytes or logical ID.
    func bindPDF(_ value: NativePDFJournal, selection selected: Domain.Selection, context: Domain.Context) -> Bool {
        guard current(selected, context: context), selected.medium == .pdf, phase != .confirmed,
              value.matches(context.actor), value.tripID == context.tripID,
              value.command.expectedHeadVersion == selected.context.tripVersion,
              NativePDFWire.date(value.command.expiresAt).map({ $0 > now() }) == true else { return false }
        if let journal { return journal == value }
        journal = value; return true
    }
    func retryJournal(selection selected: Domain.Selection, context: Domain.Context) -> NativePDFJournal? {
        current(selected, context: context) ? journal : nil
    }
    /// Reads the original server pending proposal, after adoptPDFProposal. A preview
    /// or OCR result cannot become a confirmable proposal through this adapter.
    func proposalReady(_ pending: NativeTripPending, selection selected: Domain.Selection, context: Domain.Context) -> Bool {
        guard current(selected, context: context), let journal, phase != .confirmed,
              journal.matches(context.actor), pending.version == 2, pending.trip.id == journal.tripID,
              pending.trip.headVersion == selected.context.tripVersion,
              pending.proposal.baseTripVersion == selected.context.tripVersion,
              pending.proposal.patch.expectedVersion == selected.context.tripVersion,
              NativePDFWire.uuid(pending.proposal.id), pending.proposal.revision > 0,
              NativePDFWire.hash(pending.proposal.digest), !pending.proposal.stale,
              pending.proposal.status == "pending", let expiry = NativePDFWire.date(pending.proposal.expiresAt), expiry > now() else { return false }
        let next = Domain.Proposal(id: pending.proposal.id, revision: pending.proposal.revision,
                                  digest: pending.proposal.digest, baseVersion: pending.proposal.baseTripVersion, expiresAt: expiry)
        if let proposal, proposal != next { return false }
        proposal = next; phase = .awaitingDiff; return true
    }
    /// Invoke at the ORIGINAL visible-diff explicit confirm action with its exact key.
    /// NativeTripStore's original key permits uppercase UUIDs; no new key is made here.
    func confirmStarted(pending: NativeTripPending, key: String, selection selected: Domain.Selection,
                        context: Domain.Context) -> Bool {
        guard current(selected, context: context), let proposal, proposal.expiresAt > now(),
              pending.trip.id == context.tripID, pending.proposal.id == proposal.id,
              pending.proposal.revision == proposal.revision, pending.proposal.digest == proposal.digest,
              !pending.proposal.stale, pending.proposal.status == "pending", UUID(uuidString: key) != nil,
              phase == .awaitingDiff || phase == .confirmationUnknown else { return false }
        if let confirmationKey, confirmationKey != key { return false }
        confirmationKey = key; phase = .confirmationUnknown; return true
    }
    /// Original Operation.matches proves the full journal/proposal binding and
    /// supplies the genuine event ID. Exact authenticated readback is mandatory.
    /// The original confirm response is checked when available; recovery uses the
    /// original confirmed operation instead. A response never invents an event ID.
    @discardableResult func completePDF(operation: NativePDFOperation, receipt: NativeTripConfirmed?,
                                        readback: NativeTripDetail, selectedID: String?,
                                        selection selected: Domain.Selection, context: Domain.Context) -> Domain.Handoff {
        guard selected.medium == .pdf else { return .continuation(.screenshotLineageUnavailable) }
        guard context.editable, let journal, let proposal, phase == .confirmationUnknown, confirmationKey != nil,
              operation.matches(journal, actor: context.actor), operation.state == "confirmed",
              operation.proposalId == proposal.id, operation.proposalRevision == proposal.revision,
              operation.baseTripVersion == proposal.baseVersion,
              let event = operation.confirmationEventId, let resulting = operation.resultingVersion,
              let commandDigest = operation.commandDigest, proposal.expiresAt > now(),
              NativePDFWire.date(journal.command.expiresAt).map({ $0 > now() }) == true,
              resulting == selected.context.tripVersion + 1,
              receipt.map({ $0.version == 2 && ["applied", "already_applied"].contains($0.outcome)
                  && $0.resultingVersion == resulting }) ?? true else { return .continuation(.originalProofUnavailable) }
        guard current(selected, context: context, confirmedVersion: resulting), readback.version == 2,
              selectedID == journal.tripID, readback.trip.id == journal.tripID,
              readback.trip.headVersion == resulting, readback.confirmationState == "confirmed" else {
            if selection == selected { clear() }
            return .continuation(.stale)
        }
        let elapsed = (uptime() - selected.started) * 1000
        let milliseconds = elapsed.isFinite && elapsed >= 0 && elapsed <= Double(Int32.max) ? Int(elapsed) : nil
        let source = Domain.PDFSource(operationID: journal.command.operationId, requestDigest: journal.requestDigest,
            commandDigest: commandDigest, previewDigest: journal.previewDigest,
            contentHash: journal.command.contentHash, byteCount: journal.command.byteCount, pageCount: journal.command.pageCount,
            extraction: journal.command.extraction, expiresAt: journal.command.expiresAt, confirmationEventID: event)
        let result = Domain.Confirmed(selection: selected, proposal: proposal, source: source,
                                      resultingVersion: resulting, elapsedMilliseconds: milliseconds)
        confirmed = result; phase = .confirmed; self.journal = nil
        return .confirmedReadback(result)
    }
    /// Actual visible original result render, not server-ready/proposal presentation.
    func presented(_ value: Domain.Confirmed, context: Domain.Context) -> Domain.Confirmed? {
        guard !rendered, confirmed == value, current(value.selection, context: context,
              confirmedVersion: value.resultingVersion), phase == .confirmed else { return nil }
        rendered = true; return value
    }
    func failed(selection selected: Domain.Selection, context: Domain.Context) {
        guard current(selected, context: context), phase != .confirmed else { return }
        if phase != .confirmationUnknown { phase = .unavailable }
    }
    func invalidate(context: Domain.Context?) {
        guard let selection else { return }
        guard let context else { clear(); return }
        let version = confirmed?.resultingVersion ?? (phase == .confirmationUnknown && context.tripVersion == selection.context.tripVersion + 1 ? context.tripVersion : nil)
        _ = current(selection, context: context, confirmedVersion: version)
    }
    func exit(_ reason: Domain.Exit) { clear() }
    private func clear() {
        selection = nil; confirmed = nil; proposal = nil; journal = nil; confirmationKey = nil
        rendered = false; phase = .idle
    }
}

/// Typed continuation consumer. No protected original-source/lifecycle port is
/// installed. Local confirmation, Trip equality, render and client flags cannot
/// authorize measurement. This default denial must not affect the original writer.
@MainActor struct NativeJourneyMaterialOutcomeConsumer {
    func measurementQualification(for handoff: NativeJourneyMaterialOutcome.Handoff) -> NativeJourneyMaterialOutcome.Reason {
        switch handoff {
        case .continuation(let reason): reason
        case .confirmedReadback: .protectedSourceUnavailable
        }
    }
}
