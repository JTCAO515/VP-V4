import Foundation
import Security

#if !NATIVE_SCOPED_HOST_TEST
import Testing
@testable import VisePanda
#endif

@MainActor struct NativeScopedTripEditTests {
    enum Failure: Error { case assertion(String) }
    static func require(_ result: Bool, _ message: String) throws { if !result { throw Failure.assertion(message) } }
    static func rejects(_ block: () throws -> Void) throws {
        do { try block() } catch { return }; throw Failure.assertion("Expected rejection")
    }
    static let trip = "11111111-1111-4111-8111-111111111111"
    static let contextID = "22222222-2222-4222-8222-222222222222"
    static let operationID = "33333333-3333-4333-8333-333333333333"
    static let digest = String(repeating: "a", count: 64)
    static let actor = NativeDataScope(endpoint: "https://staging.go2china.space", subject: "owner-a", mobileEpoch: 4, generation: 1)
    static var detail: NativeTripDetail {
        .init(version: 2, trip: .init(id: trip, title: "Trip", headVersion: 4, updatedAt: "2026-10-05T00:00:00Z"),
              content: .init(days: [.init(id: "Day-1", date: "2026-10-05", items: [
                .init(id: "item_A", dayId: "Day-1", title: "A"), .init(id: "item_B", dayId: "Day-1", title: "B")])]),
              hardLocks: .notEnabled, externalOrderStatus: .notConnected, confirmationState: "confirmed")
    }
    static var selection: NativeScopedTripSelection { NativeScopedTripSelection(actor: actor, detail: detail, dayID: "Day-1")! }
    static var basis: [String: Any] { ["contextId": contextID, "contextDigest": digest, "baseVersion": 4] }
    static var command: NativeScopedTripCommand {
        get throws { try .init(object: ["action": "manual", "operationId": operationID, "basis": basis,
            "edit": ["kind": "set_time", "itemId": "item_A", "startsAt": "2026-10-05T12:00:00Z", "endsAt": NSNull()]]) }
    }
    static func contextObject() -> [String: Any] {
        ["kind": "scoped_edit_context/1", "contextId": contextID, "contextDigest": digest, "tripId": trip, "baseVersion": 4,
         "scope": ["dayIds": ["Day-1"], "itemIds": [String]()],
         "snapshot": ["version": 4, "title": "Trip", "days": [["id": "Day-1", "date": "2026-10-05", "items": [["id": "item_A", "dayId": "Day-1", "title": "A"], ["id": "item_B", "dayId": "Day-1", "title": "B"]]]]],
         "orderedItemIdsByDay": [["dayId": "Day-1", "itemIds": ["item_A", "item_B"]]],
         "lockedItemIds": ["item_B"], "fixedItemIds": [String](),
         "sourceBasis": ["profileUpdatedAt": NSNull(), "memoryBasisDigest": digest, "reservationBasisDigest": digest,
            "sourceDigest": digest, "lockRevision": 1, "fixedBindings": [Any]()],
         "expiresAt": ISO8601DateFormatter().string(from: Date().addingTimeInterval(300))]
    }
    static func context() throws -> NativeScopedTripContext {
        try .decode(JSONSerialization.data(withJSONObject: contextObject()), selection: selection, startedAt: Date())
    }
    static func proposalObject() -> [String: Any] {
        ["kind": "scoped_edit_proposal/1", "operationId": operationID, "tripId": trip, "contextId": contextID,
         "contextDigest": digest, "proposalId": "44444444-4444-4444-8444-444444444444", "proposalRevision": 1,
         "proposalDigest": "trip-v2:" + digest, "baseVersion": 4,
         "expiresAt": ISO8601DateFormatter().string(from: Date().addingTimeInterval(200)),
         "returnScope": ["dayIds": ["Day-1"], "itemIds": [String]()],
         "diff": ["changes": [["kind": "changed", "itemId": "item_A",
            "before": ["id": "item_A", "dayId": "Day-1", "title": "A"],
            "after": ["id": "item_A", "dayId": "Day-1", "title": "A", "startsAt": "2026-10-05T12:00:00Z"]]],
            "preservedItemIds": ["item_B"], "transferImpact": "pending", "walkingImprovement": "unverified", "externalOrderEffect": "none"], "reused": false]
    }
    final class Vault: NativeCredentialVault {
        var records: [String: Data] = [:]
        var failRead = false
        var failErase = false
        func read(service: String, owner: String) -> (OSStatus, Data?) {
            if failRead { return (errSecInteractionNotAllowed, nil) }
            guard let bytes = records[service + owner] else { return (errSecItemNotFound, nil) }; return (errSecSuccess, bytes)
        }
        func write(_ data: Data, service: String, owner: String) -> OSStatus { records[service + owner] = data; return errSecSuccess }
        func remove(service: String, owner: String) -> OSStatus {
            if failErase { return errSecInteractionNotAllowed }; records.removeValue(forKey: service + owner); return errSecSuccess
        }
    }

    #if !NATIVE_SCOPED_HOST_TEST
    @Test
    #endif
    static func opaqueSelectionAndActorFence() throws {
        try require(selection.dayID == "Day-1", "Opaque day")
        try require(NativeScopedTripSelection(actor: actor, detail: detail, dayID: "Day-1", itemID: "item_A") != nil, "Opaque item")
        for invalid in ["", "item.A", String(repeating: "a", count: 65), "项目"] { try require(!NativeScopedTripSelection.validObjectID(invalid), "Invalid ID") }
        try require(NativeScopedTripSelection(actor: actor, detail: detail, dayID: "Day-1", itemID: "absent") == nil, "Membership")
        try require(!selection.isCurrent(actor: .init(endpoint: actor.endpoint, subject: "owner-b", mobileEpoch: 4, generation: 1), detail: detail), "Owner fence")
        try require(!selection.isCurrent(actor: .init(endpoint: actor.endpoint, subject: actor.subject, mobileEpoch: 4, generation: 2), detail: detail), "Generation fence")
    }
    #if !NATIVE_SCOPED_HOST_TEST
    @Test
    #endif
    static func closedCommandsRejectBooleansAndInvalidTimes() throws {
        var raw: [String: Any] = ["action": "manual", "operationId": operationID, "basis": basis, "edit": ["kind": "set_time", "itemId": "item_A", "startsAt": "2026-10-05T12:00:00Z", "endsAt": NSNull()]]
        _ = try NativeScopedTripCommand(object: raw)
        var badBasis = basis; badBasis["baseVersion"] = true; raw["basis"] = badBasis
        try rejects { _ = try NativeScopedTripCommand(object: raw) }
        raw["basis"] = basis; raw["edit"] = ["kind": "set_time", "itemId": "item_A", "startsAt": "2026-10-05T12:00:00Z", "endsAt": "2026-10-05T11:00:00Z"]
        try rejects { _ = try NativeScopedTripCommand(object: raw) }
        raw["edit"] = ["kind": "reorder_items", "dayId": "Day-1", "itemIds": ["item_A", "item_A"]]
        try rejects { _ = try NativeScopedTripCommand(object: raw) }
        raw["edit"] = ["kind": "delete_everything"]
        try rejects { _ = try NativeScopedTripCommand(object: raw) }
    }
    #if !NATIVE_SCOPED_HOST_TEST
    @Test
    #endif
    static func journalNeverOverwritesUnknownAndReadbackMustSucceed() throws {
        let memory = Vault(); let vault = NativeScopedTripJournalVault(vault: memory)
        let saved = try vault.remember(command, selection: selection, actor: actor)
        try require(try vault.read(actor) == saved, "Durable readback")
        let other = try NativeScopedTripCommand(object: ["action": "ask", "operationId": UUID().uuidString.lowercased(), "basis": basis, "text": "Change this day"])
        try rejects { _ = try vault.remember(other, selection: selection, actor: actor) }
        try require(try vault.read(actor) == saved, "Unknown retained")
        memory.failRead = true
        try rejects { _ = try vault.read(actor) }
        memory.failRead = false
        try require(try vault.read(actor) == saved, "Read failure did not erase")
    }
    #if !NATIVE_SCOPED_HOST_TEST
    @Test
    #endif
    static func journalFencesEpochAndEraseFailure() throws {
        let memory = Vault(); let vault = NativeScopedTripJournalVault(vault: memory)
        let saved = try vault.remember(command, selection: selection, actor: actor)
        try rejects { _ = try vault.read(.init(endpoint: actor.endpoint, subject: actor.subject, mobileEpoch: 5, generation: 2)) }
        memory.failErase = true
        try rejects { try vault.complete(saved, actor: actor) }
        memory.failErase = false
        try require(try vault.read(actor) == saved, "Failed erase retained")
        try vault.complete(saved, actor: actor)
        try require(try vault.read(actor) == nil, "Successful erase")
    }
    #if !NATIVE_SCOPED_HOST_TEST
    @Test
    #endif
    static func contextOrderProtectionAndSourceAreAuthoritative() throws {
        let value = try context()
        try require(value.editableItemIDs == ["item_A"], "Protected item excluded")
        try require(value.orderedItemIDs["Day-1"] == ["item_A", "item_B"], "Real order")
        var raw = contextObject(); raw["orderedItemIdsByDay"] = [["dayId": "Day-1", "itemIds": ["item_B", "item_A"]]]
        try rejects { _ = try NativeScopedTripContext.decode(JSONSerialization.data(withJSONObject: raw), selection: selection, startedAt: Date()) }
        raw = contextObject(); raw["fixedItemIds"] = ["item_A"]
        try rejects { _ = try NativeScopedTripContext.decode(JSONSerialization.data(withJSONObject: raw), selection: selection, startedAt: Date()) }
        raw = contextObject(); raw["expiresAt"] = "2000-01-01T00:00:00Z"
        try rejects { _ = try NativeScopedTripContext.decode(JSONSerialization.data(withJSONObject: raw), selection: selection, startedAt: Date()) }
    }
    #if !NATIVE_SCOPED_HOST_TEST
    @Test
    #endif
    static func receiptBindsOriginalOperationAndPreservedItems() throws {
        let saved = try NativeScopedTripJournalVault(vault: Vault()).remember(command, selection: selection, actor: actor)
        let context = try context()
        _ = try NativeScopedTripProposalReceipt.decode(JSONSerialization.data(withJSONObject: proposalObject()), journal: saved, context: context)
        var raw = proposalObject(); raw["operationId"] = UUID().uuidString.lowercased()
        try rejects { _ = try NativeScopedTripProposalReceipt.decode(JSONSerialization.data(withJSONObject: raw), journal: saved, context: context) }
        raw = proposalObject(); var diff = raw["diff"] as! [String: Any]; diff["preservedItemIds"] = [String](); raw["diff"] = diff
        try rejects { _ = try NativeScopedTripProposalReceipt.decode(JSONSerialization.data(withJSONObject: raw), journal: saved, context: context) }
        raw = proposalObject(); raw["reused"] = 1
        try rejects { _ = try NativeScopedTripProposalReceipt.decode(JSONSerialization.data(withJSONObject: raw), journal: saved, context: context) }
    }
    static func candidatesObject(operationID: String) -> [String: Any] {
        let proposal = proposalObject()
        return ["kind": "scoped_edit_candidates/1", "operationId": operationID, "tripId": trip,
            "contextId": contextID, "contextDigest": digest, "baseVersion": 4,
            "expiresAt": proposal["expiresAt"]!, "returnScope": proposal["returnScope"]!,
            "candidates": [["candidateId": "55555555-5555-4555-8555-555555555555",
                "edits": [["kind": "set_time", "itemId": "item_A", "startsAt": "2026-10-05T12:00:00Z", "endsAt": NSNull()]],
                "diff": proposal["diff"]!]], "reused": false]
    }
    #if !NATIVE_SCOPED_HOST_TEST
    @Test
    #endif
    static func candidatesRequireTerminalAskAndFreshSeparateSelection() throws {
        let ask = try NativeScopedTripCommand(object: ["action": "ask", "operationId": operationID, "basis": basis, "text": "Change time"])
        let saved = try NativeScopedTripJournalVault(vault: Vault()).remember(ask, selection: selection, actor: actor)
        let ready = try NativeScopedTripCandidates.decode(JSONSerialization.data(withJSONObject: candidatesObject(operationID: operationID)), journal: saved, context: context())
        try require(ready.askOperationID == operationID && ready.candidates.count == 1, "Bound Ask candidates")
        var raw = candidatesObject(operationID: operationID)
        let first = (raw["candidates"] as! [Any])[0]; raw["candidates"] = [first, first, first]
        try rejects { _ = try NativeScopedTripCandidates.decode(JSONSerialization.data(withJSONObject: raw), journal: saved, context: context()) }
        try rejects { _ = try NativeScopedTripCommand(object: ["action": "select_candidate", "operationId": operationID, "basis": basis, "askOperationId": operationID, "candidateId": ready.candidates[0].id]) }
        let select = try NativeScopedTripCommand(object: ["action": "select_candidate", "operationId": UUID().uuidString.lowercased(), "basis": basis, "askOperationId": operationID, "candidateId": ready.candidates[0].id])
        try require(select.operationID != ask.operationID, "Separate mutation identity")
    }
    #if NATIVE_SCOPED_HOST_TEST
    static func pollingDoesNotCreateProposalAndStaleSourceStopsReview() async throws {
        let memory = Vault(); let session = NativeSession(scope: actor, vault: memory)
        var mutation: [String: Any] = [:]
        var proposal: [String: Any] = [:]
        var stale = false
        session.responder = { request in
            let action = request["action"] as! String
            let result: [String: Any]
            switch action {
            case "context": result = contextObject()
            case "ask":
                mutation = request
                result = ["kind": "scoped_edit_pending/1", "operationId": request["operationId"]!, "tripId": trip,
                    "contextId": contextID, "contextDigest": digest, "baseVersion": 4, "reason": "queued", "reused": false]
            case "read_operation":
                result = ["kind": "scoped_edit_operation/1", "operationId": request["operationId"]!, "tripId": trip,
                    "mutation": mutation, "receipt": proposal.isEmpty ? candidatesObject(operationID: request["operationId"] as! String) : proposal,
                    "state": stale ? "stale" : "pending", "resultingVersion": NSNull()]
            case "select_candidate":
                mutation = request; proposal = proposalObject(); proposal["operationId"] = request["operationId"]!
                result = proposal
            default: throw Failure.assertion("Unexpected mutation")
            }
            return try JSONSerialization.data(withJSONObject: result)
        }
        let store = NativeScopedTripEditStore()
        await store.load(selection: selection, session: session, locale: "en", current: { true })
        await store.send(action: "ask", fields: ["text": "Change time"], selection: selection, session: session, current: { true })
        try require(store.journal != nil, "Queued remains recoverable")
        await store.recover(mode: "read", selection: selection, session: session, current: { true })
        try require(store.candidates != nil && store.receipt == nil && store.journal == nil, "Candidates are not proposals; terminal Ask released")
        try require(!session.requests.contains { $0["action"] as? String == "select_candidate" }, "Polling did not submit selection")
        let ready = store.candidates!
        await store.selectCandidate(ready.candidates[0].id, selection: selection, session: session, current: { true })
        try require(store.receipt != nil && store.journal == nil, "Explicit selection produced exact review reference")
        let selects = session.requests.filter { $0["action"] as? String == "select_candidate" }
        try require(selects.count == 1 && selects[0]["operationId"] as? String != ready.askOperationID, "Exactly one new selection operation")
        stale = true
        try require(!(await store.revalidateCandidate(selection: selection, session: session, current: { true })), "Source stale blocks review")
        try require(store.receipt == nil && session.requests.filter { $0["action"] as? String == "select_candidate" }.count == 1, "No stale submission")
    }
    #endif

}

#if NATIVE_SCOPED_HOST_TEST
@main struct NativeScopedTripHostTests {
    @MainActor static func main() async throws {
        try NativeScopedTripEditTests.opaqueSelectionAndActorFence()
        try NativeScopedTripEditTests.closedCommandsRejectBooleansAndInvalidTimes()
        try NativeScopedTripEditTests.journalNeverOverwritesUnknownAndReadbackMustSucceed()
        try NativeScopedTripEditTests.journalFencesEpochAndEraseFailure()
        try NativeScopedTripEditTests.contextOrderProtectionAndSourceAreAuthoritative()
        try NativeScopedTripEditTests.receiptBindsOriginalOperationAndPreservedItems()
        try NativeScopedTripEditTests.candidatesRequireTerminalAskAndFreshSeparateSelection()
        try await NativeScopedTripEditTests.pollingDoesNotCreateProposalAndStaleSourceStopsReview()
        print("8 scoped-edit host behavior cases PASS; iOS runtime UNRUN")
    }
}
#endif
