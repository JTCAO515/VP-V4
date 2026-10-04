import Foundation
import Observation

@MainActor
@Observable
final class NativeTrafficStore {
    private(set) var actor: NativeDataScope?
    private(set) var reviewReference: String?
    private(set) var context: NativeTrafficContext?
    private var contextGeneration = UUID()
    private(set) var observation: NativeTrafficObservation?
    private(set) var attemptedScope: NativeTransportScope?
    private(set) var notice: String?
    private(set) var busy = false
    private var generation = UUID()
    private var stopGeneration = UUID()
    private var stoppingScope: NativeTransportScope?

    func bind(_ actor: NativeDataScope?) {
        guard self.actor != actor else { return }
        self.actor = actor; stopGeneration = UUID(); stoppingScope = nil; invalidate(); attemptedScope = nil; clearContext()
    }
    func invalidate() { generation = UUID(); observation = nil; busy = false; reviewReference = nil }
    /// Exact original Proposal review is the sole continuation of this foreground scope.
    /// Stops/expiry still apply; no new observation or TTL is created by entering review.
    func beginReview(pending: NativeRecoveryPending, outcome: NativeRecoveryOutcome, current: NativeDataScope?) throws {
        guard let actor, current == actor, pending.matches(actor),
              let ref = pending.transportReference, ref.scope == attemptedScope,
              outcome.operation.state == "pending", let reference = outcome.proposalReference
        else { throw NativeDataError.invalidResponse }
        try pending.validate(); try outcome.validate(pending: pending, now: Date())
        invalidate(); reviewReference = reference
    }
    /// Recovered local metadata is usable for stopping the original scope, never qualification.
    func restoreStopScope(_ scope: NativeTransportScope?) {
        guard attemptedScope == nil, let scope else { return }
        attemptedScope = scope
    }
    func clearContext() { contextGeneration = UUID(); context = nil }
    func loadContext(trip: String, version: Int, day: String, item: String, scope: NativeTransportScope?,
                     current: () -> NativeDataScope?, post: (Data) async throws -> Data) async {
        clearContext()
        guard let actor, current() == actor, !day.isEmpty, !item.isEmpty else { return }
        let token = contextGeneration
        do {
            let bytes = try await post(NativeTrafficContext.body(version: version, day: day, item: item, scope: scope))
            guard contextGeneration == token, self.actor == actor, current() == actor, !Task.isCancelled else { return }
            context = try NativeTrafficContext.decode(bytes, trip: trip, version: version, day: day, item: item)
        } catch {
            if contextGeneration == token, self.actor == actor, current() == actor, !Task.isCancelled { notice = "EXACT_ENDPOINTS_UNAVAILABLE" }
        }
    }
    func visible(scope: NativeTransportScope?, foreground: Bool, now: Date) -> NativeTrafficObservation? {
        guard foreground, let scope, let observation,
              attemptedScope == scope, NativeRecoveryWire.date(observation.expiresAt).map({ $0 > now }) == true,
              observation.durableReceipt.map({ $0.current(scope: scope, now: now) }) ?? true else { return nil }
        return observation
    }
    func receipt(scope: NativeTransportScope?, foreground: Bool, now: Date) -> NativeTrafficReceipt? {
        guard let observation = visible(scope: scope, foreground: foreground, now: now),
              observation.qualification.status == "qualified", let receipt = observation.durableReceipt,
              receipt.recoveryQualified else { return nil }
        return receipt
    }
    func check(scope: NativeTransportScope, refresh: Bool, consent: Bool,
               current: () -> NativeDataScope?, post: (Data) async throws -> Data) async {
        guard !busy, stoppingScope == nil, reviewReference == nil, consent, let actor, current() == actor else { return }
        let prior = visible(scope: scope, foreground: true, now: Date())?.durableReceipt
        if refresh && prior == nil { notice = "RECEIPT_UNAVAILABLE"; return }
        let token = UUID(); generation = token; busy = true; attemptedScope = scope; observation = nil; notice = nil
        defer { if generation == token { busy = false } }
        do {
            let body = try NativeTrafficWire.body(scope: scope, operation: refresh ? "refresh" : "check", consent: consent,
                                                  foreground: true, previous: prior?.receiptId, stopEpoch: prior?.stopEpoch ?? (context?.stop.status == "current" ? context?.stop.epoch : nil))
            let bytes = try await post(body)
            guard generation == token, current() == actor, self.actor == actor, !Task.isCancelled else { return }
            let row = try NativeRecoveryWire.root(bytes)
            if row["status"] as? String == "unavailable" {
                try Self.validateUnavailable(row)
                notice = row["reason"] as? String; return
            }
            observation = try NativeTrafficObservation.decode(bytes, scope: scope, previous: prior?.receiptId, now: Date())
        } catch {
            guard generation == token, self.actor == actor, current() == actor, !Task.isCancelled else { return }
            observation = nil; notice = "FOREGROUND_RESULT_UNKNOWN"
        }
    }
    /// First/lost ACK is stoppable with nil epoch. The server reads current epoch and performs CAS.
    /// Local hiding never asserts that the durable stop succeeded.
    func stop(current: () -> NativeDataScope?, post: (Data) async throws -> Data) async {
        let scope = attemptedScope, previous = observation?.durableReceipt
        invalidate()
        guard let actor, current() == actor, let scope else { return }
        guard stoppingScope != scope else { return }
        stoppingScope = scope
        let token = stopGeneration
        defer { if stopGeneration == token, stoppingScope == scope { stoppingScope = nil } }
        do {
            let bytes = try await post(NativeTrafficWire.body(scope: scope, operation: "stop", consent: false,
                foreground: false, previous: previous?.receiptId, stopEpoch: nil))
            guard self.actor == actor, current() == actor, stopGeneration == token, attemptedScope == scope else { return }
            let row = try NativeRecoveryWire.root(bytes)
            if row["status"] as? String == "unavailable" {
                try Self.validateUnavailable(row); notice = "DURABLE_STOP_UNAVAILABLE"; return
            }
            _ = try NativeRecoveryWire.exact(row, ["kind", "status", "reason", "tripMutation", "providerCalls", "fallback", "qualification", "scopeStopConfirmed"])
            guard row["kind"] as? String == "foreground_traffic/1", row["status"] as? String == "stopped",
                  row["reason"] as? String == "FOREGROUND_STOPPED", NativeRecoveryWire.boolean(row["scopeStopConfirmed"]) == true,
                  NativeRecoveryWire.integer(row["providerCalls"]) == 0, row["tripMutation"] as? String == "none"
            else { throw NativeDataError.invalidResponse }
            attemptedScope = nil; notice = "FOREGROUND_STOPPED"
        } catch {
            if self.actor == actor, current() == actor, stopGeneration == token, attemptedScope == scope { notice = "DURABLE_STOP_UNAVAILABLE" }
        }
    }
    private static func validateUnavailable(_ row: [String: Any]) throws {
        _ = try NativeRecoveryWire.exact(row, ["kind", "status", "reason", "tripMutation", "providerCalls", "fallback", "qualification"])
        let qualification = try NativeRecoveryWire.exact(row["qualification"] as Any, ["status", "reason"])
        guard row["kind"] as? String == "foreground_traffic/1", row["status"] as? String == "unavailable",
              let reason = row["reason"] as? String, !reason.isEmpty, reason.utf16.count <= 128,
              NativeRecoveryWire.integer(row["providerCalls"]).map({ (0...5).contains($0) }) == true,
              row["tripMutation"] as? String == "none", row["fallback"] as? String == "existing_trip_address_and_navigation",
              qualification["status"] as? String == "unavailable", qualification["reason"] as? String == "DURABLE_SOURCE_AUTHORITY_UNAVAILABLE"
        else { throw NativeDataError.invalidResponse }
    }
}
