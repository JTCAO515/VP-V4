import XCTest
import Security
@testable import VisePanda

nonisolated final class NativeTripLifecycleTests: XCTestCase {
    private let trip = "12345678-1234-4234-8234-123456789abc"
    private let owner = "22345678-1234-4234-8234-123456789abc"
    @MainActor private var actor: NativeDataScope {
        .init(endpoint: "http://127.0.0.1:64000", subject: owner, mobileEpoch: 2, generation: 1)
    }
    @MainActor private func profile(id: String = "32345678-1234-4234-8234-123456789abc",
                                     state: String = "explicit", kind: String = "preference",
                                     consent: String = "granted", revision: Int = 1) -> NativeMemoryProfile {
        .init(id: id, revision: revision, state: state, constraintKind: kind,
              summary: consent == "revoked" ? nil : "Prefer quiet stays",
              sourceReceiptId: "42345678-1234-4234-8234-123456789abc",
              consentId: "52345678-1234-4234-8234-123456789abc", consentStatus: consent,
              createdAt: "2026-10-05T00:00:00Z", updatedAt: "2026-10-05T00:00:00Z")
    }

    @MainActor func testPreferenceChoiceStartsEmptyAndNeverOffersInferredConstraintsOrRevokedRows() throws {
        let allowed = profile()
        let inferred = profile(id: "62345678-1234-4234-8234-123456789abc", state: "inferred")
        let temporary = profile(id: "72345678-1234-4234-8234-123456789abc", kind: "hard_constraint")
        let revoked = profile(id: "82345678-1234-4234-8234-123456789abc", consent: "revoked")
        let rows = [allowed, inferred, temporary, revoked]
        var review = try NativeTripPreferenceReview(tripID: trip, headVersion: 4, actor: actor, profiles: rows)
        XCTAssertEqual(review.candidates, [allowed])
        XCTAssertTrue(try review.references(currentActor: actor, tripID: trip, headVersion: 4, profiles: rows).isEmpty)
        review.select(inferred.id, keep: true)
        XCTAssertTrue(review.selectedIDs.isEmpty)
        review.select(allowed.id, keep: true)
        XCTAssertEqual(try review.references(currentActor: actor, tripID: trip, headVersion: 4, profiles: rows).count, 1)
        review.select(allowed.id, keep: false)
        XCTAssertTrue(review.selectedIDs.isEmpty)
    }

    @MainActor func testChangedPreferenceTripOrSessionRequiresNewExplicitReview() throws {
        let original = profile()
        var review = try NativeTripPreferenceReview(tripID: trip, headVersion: 4, actor: actor, profiles: [original])
        review.select(original.id, keep: true)
        XCTAssertThrowsError(try review.references(currentActor: actor, tripID: trip, headVersion: 4,
                                                  profiles: [profile(revision: 2)]))
        XCTAssertThrowsError(try review.references(currentActor: actor, tripID: trip, headVersion: 4,
                                                  profiles: [profile(consent: "revoked")]))
        XCTAssertThrowsError(try review.references(currentActor: actor, tripID: trip, headVersion: 5, profiles: [original]))
        let replaced = NativeDataScope(endpoint: actor.endpoint, subject: owner, mobileEpoch: 3, generation: 1)
        XCTAssertThrowsError(try review.references(currentActor: replaced, tripID: trip, headVersion: 4, profiles: [original]))
        XCTAssertThrowsError(try NativeTripPreferenceReview(tripID: trip, headVersion: 4, actor: actor,
                                                           profiles: [original, original]))
    }

    @MainActor private func command() throws -> NativeTripLifecycleCommand {
        try .init(action: .activate, tripID: trip, sessionID: "92345678-1234-4234-8234-123456789abc",
                  revision: 2, activeTripID: nil, headVersion: 4)
    }
    @MainActor private func snapshot(revision: Int = 2) throws -> Data {
        try JSONSerialization.data(withJSONObject: ["version": "trip-lifecycle/1", "ownerId": owner,
            "sessionId": "92345678-1234-4234-8234-123456789abc", "revision": revision,
            "capacity": ["draftCount": 1, "draftLimit": 3, "activeTripId": NSNull(), "activeLimit": 1, "legacyCount": 0],
            "trips": [["tripId": trip, "title": "Saved Trip", "headVersion": 4, "state": "draft",
                       "archivedVersion": NSNull(), "archivedAt": NSNull()]], "nextTripId": NSNull(), "serviceStatus": "unavailable"])
    }
    @MainActor private func declined(_ command: NativeTripLifecycleCommand, reason: String = "LIFECYCLE_CONFLICT") throws -> Data {
        try JSONSerialization.data(withJSONObject: ["version": "trip-lifecycle/1", "ownerId": owner,
            "sessionId": command.sessionID, "operationId": command.operationID, "requestDigest": command.digest,
            "action": command.action.rawValue, "tripId": command.tripID, "status": "declined", "reason": reason, "revision": 3])
    }

    @MainActor func testJournalRetainsOriginalWhitespaceBytesAndRejectsOverwriteOrOtherEpoch() throws {
        let vault = LifecycleTestVault(), persistence = NativeTripLifecycleJournalVault(vault: vault)
        let original = try command()
        let padded = try NativeTripLifecycleCommand(bytes: Data(" \n".utf8) + original.bytes + Data("\n".utf8))
        XCTAssertNotEqual(original.digest, padded.digest)
        let retained = try persistence.remember(padded, actor: actor)
        XCTAssertEqual(try retained.command().bytes, padded.bytes)
        XCTAssertEqual(try persistence.remember(padded, actor: actor), retained)
        XCTAssertThrowsError(try persistence.remember(command(), actor: actor))
        let replaced = NativeDataScope(endpoint: actor.endpoint, subject: actor.subject, mobileEpoch: actor.mobileEpoch + 1, generation: 1)
        XCTAssertThrowsError(try persistence.read(replaced))
        XCTAssertEqual(try persistence.read(actor), retained)
        try persistence.complete(retained, actor: actor)
        XCTAssertNil(try persistence.read(actor))
    }

    @MainActor func testNullRecoveryAndNetworkFailureKeepSameOperationUntilDigestMatchedDecline() async throws {
        let vault = LifecycleTestVault(), persistence = NativeTripLifecycleJournalVault(vault: vault)
        let actor = self.actor
        var sent: [Data] = [], completeCount = 0, shouldDecline = false
        let client = NativeTripLifecycleClient(current: { actor }, read: { _, _, _ in try self.snapshot() },
            saved: { try persistence.read($0) }, remember: { try persistence.remember($0, actor: $1) },
            submit: { journal, _ in
                sent.append(journal.bytes)
                if shouldDecline { return try self.declined(journal.command()) }
                throw URLError(.networkConnectionLost)
            }, recover: { journal, _ in
                let command = try journal.command()
                return try JSONSerialization.data(withJSONObject: ["version": "trip-lifecycle/1", "ownerId": self.owner,
                    "sessionId": command.sessionID, "operationId": command.operationID, "receipt": NSNull()])
            }, abandon: { journal, _ in try self.declined(journal.command(), reason: "USER_ABANDONED") },
            complete: { journal, actor in try persistence.complete(journal, actor: actor); completeCount += 1 })
        let store = NativeTripLifecycleStore()
        await store.load(client)
        let reviewed = try XCTUnwrap(store.visible(actor)), row = try XCTUnwrap(store.trips.first)
        await store.perform(.activate, trip: row, reviewed: reviewed, client: client)
        let pending = try XCTUnwrap(store.pending)
        XCTAssertEqual(sent, [pending.bytes]); XCTAssertEqual(completeCount, 0)
        await store.resolve(client)
        XCTAssertEqual(store.pending, pending); XCTAssertEqual(completeCount, 0)
        shouldDecline = true
        await store.resolve(client, resend: true)
        XCTAssertEqual(sent, [pending.bytes, pending.bytes]); XCTAssertEqual(completeCount, 1)
        XCTAssertNil(store.pending); XCTAssertEqual(store.receipt, .declined("LIFECYCLE_CONFLICT"))
        XCTAssertNotNil(store.visible(actor))
        var wrong = try XCTUnwrap(JSONSerialization.jsonObject(with: declined(pending.command())) as? [String: Any])
        wrong["requestDigest"] = String(repeating: "a", count: 64)
        XCTAssertThrowsError(try NativeTripLifecycleTerminal(bytes: JSONSerialization.data(withJSONObject: wrong), actor: actor, command: pending.command()))
    }

    @MainActor func testReplacementDuringResponseFencesLateResultAndPreservesJournal() async throws {
        let vault = LifecycleTestVault(), persistence = NativeTripLifecycleJournalVault(vault: vault)
        let original = actor
        var current: NativeDataScope? = original
        var completed = false
        let client = NativeTripLifecycleClient(current: { current }, read: { _, _, _ in try self.snapshot() },
            saved: { try persistence.read($0) }, remember: { try persistence.remember($0, actor: $1) },
            submit: { journal, _ in
                current = .init(endpoint: original.endpoint, subject: original.subject, mobileEpoch: 3, generation: 2)
                return try self.declined(journal.command())
            }, recover: { _, _ in throw URLError(.notConnectedToInternet) },
            abandon: { _, _ in throw URLError(.notConnectedToInternet) }, complete: { _, _ in completed = true })
        let store = NativeTripLifecycleStore()
        await store.load(client)
        await store.perform(.activate, trip: try XCTUnwrap(store.trips.first), reviewed: try XCTUnwrap(store.visible(original)), client: client)
        XCTAssertFalse(completed); XCTAssertNil(store.receipt); XCTAssertNil(store.visible(current))
        XCTAssertNotNil(try persistence.read(original))
        store.bind(current)
        XCTAssertNil(store.pending)
        XCTAssertNotNil(try persistence.read(original))
    }

    @MainActor func testClosedCommandRejectsBooleanRevisionAndSnapshotDoesNotAcceptFakeEmptyCapacity() throws {
        var raw = try XCTUnwrap(JSONSerialization.jsonObject(with: command().bytes) as? [String: Any])
        raw["expectedRevision"] = true
        XCTAssertThrowsError(try NativeTripLifecycleCommand(bytes: JSONSerialization.data(withJSONObject: raw)))
        var view = try XCTUnwrap(JSONSerialization.jsonObject(with: snapshot()) as? [String: Any])
        view["serviceStatus"] = "empty"
        XCTAssertThrowsError(try NativeTripLifecycleSnapshot(bytes: JSONSerialization.data(withJSONObject: view), actor: actor))
        view["serviceStatus"] = "unavailable"; view["revision"] = true
        XCTAssertThrowsError(try NativeTripLifecycleSnapshot(bytes: JSONSerialization.data(withJSONObject: view), actor: actor))
    }
}

@MainActor private final class LifecycleTestVault: NativeCredentialVault {
    private var storage: [String: Data] = [:]
    func write(_ data: Data, service: String, owner: String) -> OSStatus { storage[service + owner] = data; return errSecSuccess }
    func read(service: String, owner: String) -> (OSStatus, Data?) {
        if let value = storage[service + owner] { return (errSecSuccess, value) }
        return (errSecItemNotFound, nil)
    }
    func remove(service: String, owner: String) -> OSStatus {
        storage.removeValue(forKey: service + owner) == nil ? errSecItemNotFound : errSecSuccess
    }
}
