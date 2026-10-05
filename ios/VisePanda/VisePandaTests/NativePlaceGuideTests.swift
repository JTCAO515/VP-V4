import Foundation
import Testing
@testable import VisePanda

@MainActor struct NativePlaceGuideTests {
    private let scope = NativeDataScope(endpoint: "http://127.0.0.1", subject: "guide-owned-synthetic", mobileEpoch: 1, generation: 1)
    private var selection: NativePlaceGuideSelection {
        .init(scope: scope, canonicalPoiID: "00000000-0000-4000-8000-000000000001", placeReferenceID: "00000000-0000-4000-8000-000000000002",
            tripID: "00000000-0000-4000-8000-000000000003", tripVersion: 0, locale: "en", interest: .address)
    }
    private func fixture() -> [String: Any] {
        let f = ISO8601DateFormatter(), now = Date()
        let source: [String: Any] = ["sourceRevisionId": "00000000-0000-4000-8000-000000000004", "revisionLabel": "synthetic-1", "publisher": "Owned synthetic fixture", "uri": "https://example.invalid/guide", "locator": "synthetic line 1"]
        let segment: [String: Any] = ["id": "00000000-0000-4000-8000-000000000005", "kind": "fact", "subjectId": "synthetic_place", "predicate": "located_at",
            "factId": "00000000-0000-4000-8000-000000000006", "factVersion": 1, "assertionId": "00000000-0000-4000-8000-000000000005", "assertionRevision": 1,
            "text": "Synthetic address only.", "conditions": ["Use the selected place."], "exclusions": ["Entrance is not verified."], "reviewedAt": f.string(from: now.addingTimeInterval(-60)), "expiresAt": f.string(from: now.addingTimeInterval(60)), "sources": [source]]
        return ["kind": "ready", "version": 1, "tripId": selection.tripID, "tripVersion": 0, "placeReferenceId": selection.placeReferenceID,
            "canonicalPoiId": selection.canonicalPoiID, "place": ["en": "Synthetic place", "zh": "合成地点"], "locale": "en", "interest": "address", "digest": String(repeating: "a", count: 64),
            "evaluatedAt": f.string(from: now), "expiresAt": f.string(from: now.addingTimeInterval(25)), "rights": ["revision": 1, "display": true, "tts": true, "cache": true, "prompt": true],
            "segments": [segment], "completedSegmentIds": [], "replayAskUnits": 0, "narration": "published_facts", "unsupportedNarratives": ["history", "legend"], "generationCost": NSNull()]
    }
    @Test func captionIncludesEveryQualifierAndRejectsChangedScopeRightsExpiryAndInventedNarrative() throws {
        let raw = fixture(), ready = try NativePlaceGuideReady.decode(NativePlaceActionWire.bytes(raw), expected: selection)
        #expect(ready.segments[0].speechText == "Synthetic address only.\nUse the selected place.\nEntrance is not verified.")
        for mutation in ["canonical", "rights", "expiry", "legend", "cost", "unlicensedProgress"] {
            var altered = raw
            switch mutation {
            case "canonical": altered["canonicalPoiId"] = "00000000-0000-4000-8000-000000000099"
            case "rights": altered["rights"] = ["revision": 1, "display": false, "tts": true, "cache": true, "prompt": true]
            case "expiry": altered["expiresAt"] = ISO8601DateFormatter().string(from: Date().addingTimeInterval(-1))
            case "legend": altered["narration"] = "legend"
            case "cost": altered["generationCost"] = 0
            default:
                altered["rights"] = ["revision": 1, "display": true, "tts": true, "cache": false, "prompt": true]
                altered["completedSegmentIds"] = ["00000000-0000-4000-8000-000000000005"]
            }
            #expect(throws: (any Error).self) { try NativePlaceGuideReady.decode(NativePlaceActionWire.bytes(altered), expected: selection) }
        }
    }
    @Test func replayDoesNotSubmitAskAndActorChangeFencesLateGuideRead() async throws {
        let store = NativePlaceGuideStore(); store.bind(selection)
        let ready = fixture(), bytes = try NativePlaceActionWire.bytes(["data": ready])
        var actions: [String] = []
        let request: NativePlaceGuideStore.Request = { _, body in
            let object = try NativePlaceActionWire.object(body); actions.append(try #require(object["action"] as? String)); return bytes
        }
        #expect(await store.read(current: { scope }, request: request))
        #expect(await store.read(replay: true, current: { scope }, request: request))
        #expect(actions == ["read", "replay"])
        var continuation: CheckedContinuation<Data, Never>?
        let stale = Task { await store.read(current: { scope }, request: { _, _ in await withCheckedContinuation { continuation = $0 } }) }
        for _ in 0..<20 { if continuation != nil { break }; await Task.yield() }
        let suspended = try #require(continuation)
        store.bind(nil); suspended.resume(returning: bytes)
        #expect(await stale.value == false)
        #expect(store.visible(scope) == nil && store.selection == nil && !store.busy)
    }
    @Test func pendingBodyKeepsSameOperationAndRejectsAnotherOwner() throws {
        let policyID = "00000000-0000-4000-8000-000000000010", operationID = "00000000-0000-4000-8000-000000000011"
        let body = try selection.command("follow_up", extra: ["operationId": operationID, "expectedDigest": String(repeating: "a", count: 64), "completedSegmentIds": ["00000000-0000-4000-8000-000000000005"], "question": "Is this the address?",
            "threadId": "00000000-0000-4000-8000-000000000012", "turnId": "00000000-0000-4000-8000-000000000013", "policyId": policyID,
            "serviceTask": ["id": "00000000-0000-4000-8000-000000000014", "scopeVersion": 1, "relationship": "new_goal", "parentTurnId": NSNull()]])
        let pending = NativePlaceGuidePending(endpoint: scope.endpoint, owner: scope.subject, mobileEpoch: scope.mobileEpoch, canonicalPoiID: selection.canonicalPoiID,
            tripID: selection.tripID, tripVersion: selection.tripVersion, placeReferenceID: selection.placeReferenceID, locale: selection.locale, interest: selection.interest,
            noticeHash: String(repeating: "b", count: 64), expiresAt: Date().addingTimeInterval(25), body: body)
        let restored = try JSONDecoder().decode(NativePlaceGuidePending.self, from: JSONEncoder().encode(pending))
        #expect(restored.body == body && restored == pending)
        #expect(try restored.fields()["operationId"] as? String == operationID)
        let fenced = try restored.fenced()
        #expect(fenced.body.isEmpty && fenced.fencedReference?.operationID == operationID)
        #expect(throws: (any Error).self) { try fenced.fields() }
        try fenced.validatedRecovery()
        #expect(throws: (any Error).self) { try restored.selection(for: .init(endpoint: scope.endpoint, subject: "other", mobileEpoch: 1, generation: 2)) }
        // Exact synthetic Native-generated command, for the partner's closed HTTP/SQL parser check.
        let fixtureURL = FileManager.default.temporaryDirectory.appendingPathComponent("vpj28-owned-native-new-goal.json")
        try body.write(to: fixtureURL, options: .atomic)
        print("VPJ28_OWNED_NATIVE_COMMAND_PATH " + fixtureURL.path)
    }
    @Test func canonicalMetadataExportConsumesFinalSQLShapeAndRejectsLegacyOrPrivateFields() throws {
        // The exact safe metadata fields emitted by final guide_place_v1; past expiry is historical metadata.
        let binding: [String: Any] = ["turnId": "00000000-0000-4000-8000-000000000013", "serviceTaskId": "00000000-0000-4000-8000-000000000014",
            "operationId": "00000000-0000-4000-8000-000000000011", "canonicalPoiId": selection.canonicalPoiID,
            "locale": "en", "interest": "address", "digest": String(repeating: "a", count: 64), "rightsRevision": 1,
            "expiresAt": "2000-01-01T00:00:00Z", "tripVersion": 0, "invalidated": true]
        let value: [String: Any] = ["kind": "export", "version": 1, "scope": "guide_selection_metadata", "coverage": "complete_for_selection",
            "tripId": selection.tripID, "placeReferenceId": selection.placeReferenceID, "records": [], "bindings": [binding]]
        let text = try NativePlaceGuideMetadataExport.decode(NativePlaceActionWire.bytes(["data": value]), expected: selection)
        let result = try NativePlaceActionWire.object(Data(text.utf8))
        #expect(Set(result.keys) == Set(value.keys))
        #expect((result["bindings"] as? [[String: Any]])?.count == 1)
        for variant in ["legacyAlias", "privateBody", "invalidRevision", "boolHead", "overflow"] {
            var changed = value, row = binding
            switch variant {
            case "legacyAlias": changed["bindings"] = nil; changed["followUpBindings"] = [binding]; changed["excludedModules"] = ["grounded_history", "use_review_audit"]
            case "privateBody": row["question"] = "Private input must not be shared"; changed["bindings"] = [row]
            case "invalidRevision": row["rightsRevision"] = 0; changed["bindings"] = [row]
            case "boolHead": row["tripVersion"] = true; changed["bindings"] = [row]
            default: changed["bindings"] = Array(repeating: binding, count: 101)
            }
            #expect(throws: (any Error).self) { try NativePlaceGuideMetadataExport.decode(NativePlaceActionWire.bytes(["data": changed]), expected: selection) }
        }
    }
}
