import XCTest
@testable import VisePanda

nonisolated final class NativeTravelDirectionsTests: XCTestCase {
    @MainActor private func days(_ count: Int = 10) -> [NativeTravelDirectionDay] {
        (1...count).map { .init(id: "relative_\($0)", relativeDay: $0,
            city: $0 <= 5 ? "Shanghai" : "Beijing", activities: ["Food theme", "Walking theme"], fixed: $0 == 3) }
    }

    @MainActor private func trip(existing: [NativeTripDay] = []) -> NativeTripDetail {
        .init(version: 2, trip: .init(id: "11111111-1111-4111-8111-111111111111", title: "Existing Trip", headVersion: 4, updatedAt: "2026-10-10T00:00:00Z"),
              content: .init(days: existing), hardLocks: .notEnabled, externalOrderStatus: .notConnected)
    }

    @MainActor func testEditChangesOnlyOneDayAndCannotChangeFixedArrangement() {
        var editor = NativeTravelDirectionsEditing(days: days())
        XCTAssertTrue(editor.valid)
        editor.edit(id: "relative_8", activity: 1, title: "My walking theme")
        XCTAssertEqual(editor.changedIDs, ["relative_8"])
        XCTAssertEqual(editor.days[0], editor.base[0])
        editor.edit(id: "relative_3", activity: 0, title: "Replace fixed plan")
        XCTAssertEqual(editor.days[2], editor.base[2])
        editor.discard()
        XCTAssertFalse(editor.hasChanges)
    }

    @MainActor func testTenDayMultiCityDateBindingAppendsWithoutReplacingOrInventingTimes() throws {
        let saved = NativeTripDay(id: "existing_day", date: "2026-11-01", items: [.init(id: "existing_item", dayId: "existing_day", title: "Keep my reservation")])
        let draft = try NativeTravelDirectionsDateBinding.draft(days: days(), starting: "2026-11-03", detail: trip(existing: [saved]))
        XCTAssertEqual(draft.days.count, 11)
        XCTAssertEqual(draft.days.first, saved)
        XCTAssertEqual(draft.days.last?.date, "2026-11-12")
        XCTAssertEqual(draft.patch.expectedVersion, 4)
        XCTAssertEqual(draft.patch.operations.count, 30)
        XCTAssertTrue(draft.patch.operations.allSatisfy { [.upsertDay, .upsertItem].contains($0.kind) })
        XCTAssertTrue(draft.days.dropFirst().flatMap(\.items).allSatisfy { $0.startsAt == nil && $0.endsAt == nil })
    }

    @MainActor func testDateBindingRejectsUnknownInvalidOverlapAndCapacityWithoutPartialDraft() {
        for invalid in ["", "tomorrow", "2026-02-30", "2026-11-3"] {
            XCTAssertThrowsError(try NativeTravelDirectionsDateBinding.draft(days: days(), starting: invalid, detail: trip()))
        }
        let saved = NativeTripDay(id: "existing", date: "2026-11-09", items: [])
        XCTAssertThrowsError(try NativeTravelDirectionsDateBinding.draft(days: days(), starting: "2026-11-03", detail: trip(existing: [saved]))) { error in
            XCTAssertEqual(error as? NativeTravelDirectionsDateBinding.Failure, .overlap)
        }
        let crowded = (1...21).map { NativeTripDay(id: "existing_\($0)", date: String(format: "2026-12-%02d", $0), items: []) }
        XCTAssertThrowsError(try NativeTravelDirectionsDateBinding.draft(days: days(), starting: "2026-11-03", detail: trip(existing: crowded))) { error in
            XCTAssertEqual(error as? NativeTravelDirectionsDateBinding.Failure, .capacity)
        }
        var invalidDays = days()
        invalidDays[9].activities = [String(repeating: "x", count: 161)]
        XCTAssertThrowsError(try NativeTravelDirectionsDateBinding.draft(days: invalidDays, starting: "2026-11-03", detail: trip()))
    }
}

extension NativeTravelDirectionsTests {
    @MainActor private func content(days: Int? = 10, destinations: [String] = ["Shanghai", "Beijing"]) -> [String: Any] {
        let count = days != nil && !destinations.isEmpty ? days! : 0
        return ["schemaVersion": "travel-directions/1", "title": "Directions", "summary": "Relative days only",
            "intake": ["schemaVersion": "travel-directions-intake/1", "destinations": destinations,
                "durationDays": days as Any? ?? NSNull(), "interests": ["food", "walks"], "currentPace": NSNull(),
                "budget": NSNull(), "dates": NSNull(), "intent": "explore"],
            "directions": [["id": "depth", "title": "Space", "tradeoff": "Less breadth"], ["id": "breadth", "title": "Variety", "tradeoff": "Less rest"]],
            "selectedDirectionId": "depth", "draft": ["directionId": "depth", "requestedDays": days as Any? ?? NSNull(),
                "days": (1...max(1, count)).filter { $0 <= count }.map { ["ordinal": $0, "destination": $0 <= 5 ? "Shanghai" : "Beijing", "activities": ["A theme to review"]] as [String: Any] },
                "coverage": count > 0 && destinations.count <= count ? "complete_relative" : "partial_relative",
                "limitations": ["Transport, hours and prices unknown; not executable"], "pace": NSNull(), "paceSource": "none"], "actions": []]
    }
    @MainActor func testClosedRelativeResultPreservesTenDaysAndRejectsSyntheticDatesAndTruncation() throws {
        let raw = content()
        let value = try NativeTravelDirectionsContent.decode(raw)
        XCTAssertEqual(value.draft?.days.count, 10)
        XCTAssertEqual(value.draft?.days.last?.destination, "Beijing")
        var dated = raw
        var draft = try XCTUnwrap(dated["draft"] as? [String: Any])
        var days = try XCTUnwrap(draft["days"] as? [[String: Any]])
        days[0]["date"] = "2026-11-01"; draft["days"] = days; dated["draft"] = draft
        XCTAssertThrowsError(try NativeTravelDirectionsContent.decode(dated))
        draft = try XCTUnwrap(raw["draft"] as? [String: Any]); draft["days"] = Array(days.prefix(7)); dated["draft"] = draft
        XCTAssertThrowsError(try NativeTravelDirectionsContent.decode(dated))
        var booleanDuration = raw
        var intake = try XCTUnwrap(raw["intake"] as? [String: Any]); intake["durationDays"] = true; booleanDuration["intake"] = intake
        XCTAssertThrowsError(try NativeTravelDirectionsContent.decode(booleanDuration))
    }
    @MainActor func testUnknownsCanSaveEmptyRelativeDraftButCannotBindFakeDate() throws {
        let value = try NativeTravelDirectionsContent.decode(content(days: nil, destinations: []))
        XCTAssertEqual(value.draft?.days.count, 0)
        XCTAssertEqual(value.draft?.coverage, "partial_relative")
        XCTAssertNil(value.intake.dates)
        XCTAssertThrowsError(try NativeTravelDirectionsDateBinding.draft(days: [], starting: "2026-11-01", detail: trip()))
    }
    @MainActor func testReceiptCannotSelectAnotherArtifactOrInventConfirmation() throws {
        let id = "11111111-1111-4111-8111-111111111111"
        var raw: [String: Any] = ["version": 1, "kind": "selected", "artifactId": id, "revision": 2, "reused": false]
        let receipt = try NativeTravelDirectionsReceipt.decode(JSONSerialization.data(withJSONObject: raw), action: .choose("depth"), artifactID: id, expectedRevision: 1)
        XCTAssertEqual(receipt.revision, 2)
        raw["confirmed"] = true
        XCTAssertThrowsError(try NativeTravelDirectionsReceipt.decode(JSONSerialization.data(withJSONObject: raw), action: .choose("depth"), artifactID: id, expectedRevision: 1))
        raw.removeValue(forKey: "confirmed"); raw["artifactId"] = "22222222-2222-4222-8222-222222222222"
        XCTAssertThrowsError(try NativeTravelDirectionsReceipt.decode(JSONSerialization.data(withJSONObject: raw), action: .choose("depth"), artifactID: id, expectedRevision: 1))
    }
}

extension NativeTravelDirectionsTests {
    @MainActor private func envelope(_ raw: [String: Any], id: String, revision: Int) throws -> Data {
        try JSONSerialization.data(withJSONObject: ["version": 2, "data": ["kind": "result_artifact", "artifactId": id,
            "revision": revision, "currentRevision": revision, "current": true, "historicalReadable": true, "lifecycle": "active",
            "source": ["tripId": NSNull(), "tripVersion": NSNull(), "taskId": "22222222-2222-4222-8222-222222222222",
                "taskTurnId": "33333333-3333-4333-8333-333333333333", "goalId": "44444444-4444-4444-8444-444444444444",
                "goalVersion": 1, "inputMessageId": "55555555-5555-4555-8555-555555555555", "inputSequence": 1],
            "basis": ["memories": [], "evidence": []], "content": raw, "createdAt": "2026-10-10T00:00:00Z"]])
    }
    @MainActor func testLateReadCannotReviveAnotherSessionAndReadExpires() async throws {
        let id = "11111111-1111-4111-8111-111111111111"
        let scope = NativeDataScope(endpoint: "http://127.0.0.1:59321", subject: "owner-a", mobileEpoch: 1, generation: 1)
        let key = NativeTravelDirectionsStore.Key(scope: scope, artifactID: id)
        var current: NativeTravelDirectionsStore.Key? = key
        var continuation: CheckedContinuation<Data, Error>?
        var clock = 100.0
        let store = NativeTravelDirectionsStore(uptime: { clock })
        let bytes = try envelope(content(), id: id, revision: 1)
        let loading = Task {
            await store.load(key: key, revision: 1, current: { current }, read: { _, _ in
                try await withCheckedThrowingContinuation { continuation = $0 }
            })
        }
        for _ in 0..<100 where continuation == nil { await Task.yield() }
        let parked = try XCTUnwrap(continuation)
        current = nil; store.clear(); parked.resume(returning: bytes)
        await loading.value
        XCTAssertNil(store.record)
        current = key
        await store.load(key: key, revision: 1, current: { current }, read: { _, _ in bytes })
        XCTAssertNotNil(store.visible(current: key))
        clock = 130
        XCTAssertNil(store.visible(current: key))
        XCTAssertFalse(store.canAct(current: key))
    }
    @MainActor func testChoosingDoesNotSaveAndSavingDoesNotBindOrConfirm() async throws {
        let id = "11111111-1111-4111-8111-111111111111"
        let key = NativeTravelDirectionsStore.Key(scope: .init(endpoint: "http://127.0.0.1:59321", subject: "owner", mobileEpoch: 1, generation: 1), artifactID: id)
        let store = NativeTravelDirectionsStore()
        var initial = content(days: nil, destinations: [])
        initial["selectedDirectionId"] = NSNull(); initial["draft"] = NSNull()
        let first = try envelope(initial, id: id, revision: 1)
        await store.load(key: key, revision: 1, current: { key }, read: { _, _ in first })
        var selected = initial; selected["selectedDirectionId"] = "depth"
        let second = try envelope(selected, id: id, revision: 2)
        var endpoints: [String] = []
        await store.perform(.choose("depth"), current: { key }, post: { path, body in
            endpoints.append(path)
            let sent = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
            XCTAssertEqual(Set(sent.keys), Set(["artifactId", "expectedRevision", "operationId", "directionId"]))
            return try JSONSerialization.data(withJSONObject: ["version": 1, "kind": "selected", "artifactId": id, "revision": 2, "reused": false])
        }, read: { _, _ in second })
        XCTAssertNil(store.content(current: key)?.draft)
        XCTAssertNil(store.proposal)
        let saved = try envelope(content(days: nil, destinations: []), id: id, revision: 3)
        await store.perform(.save, current: { key }, post: { path, _ in
            endpoints.append(path)
            return try JSONSerialization.data(withJSONObject: ["version": 1, "kind": "saved", "artifactId": id, "revision": 3, "reused": false])
        }, read: { _, _ in saved })
        XCTAssertEqual(endpoints, ["choose", "save"])
        XCTAssertEqual(store.content(current: key)?.draft?.days.count, 0)
        XCTAssertNil(store.proposal)
    }
}

extension NativeTravelDirectionsTests {
    @MainActor func testEditableThemesRejectControlCharactersWhitespaceDuplicatesAndOversize() {
        for bad in [" leading", "trailing ", "two\nlines", "tab\ttheme", String(repeating: "x", count: 161)] {
            var editor = NativeTravelDirectionsEditing(days: days())
            editor.edit(id: "relative_1", activity: 0, title: bad)
            XCTAssertFalse(editor.valid)
        }
        var editor = NativeTravelDirectionsEditing(days: days())
        editor.edit(id: "relative_1", activity: 0, title: "Walking theme")
        XCTAssertFalse(editor.valid)
        editor.edit(id: "relative_1", activity: 0, title: "Valid reviewed theme")
        XCTAssertTrue(editor.valid)
    }
}

extension NativeTravelDirectionsTests {
    @MainActor func testPublicationAcceptsCrossGoalSequenceButNotReusedOrOutOfBoundsSequence() throws {
        let id = "11111111-1111-4111-8111-111111111111"
        let request: [String: Any] = ["taskId": id, "turnId": id, "conversationId": id, "goalId": id, "messageId": id, "expectedSourceSequence": 7]
        var raw: [String: Any] = ["version": 1, "kind": "published", "artifactId": id, "revision": 1, "reused": false,
            "taskId": id, "turnId": id, "conversationId": id, "goalId": id, "goalVersion": 1,
            "inputMessageId": id, "inputSequence": 100, "intakeRevision": 1, "intakeDigest": String(repeating: "a", count: 64), "current": true]
        let result = try NativeTravelDirectionsPublication.decode(JSONSerialization.data(withJSONObject: raw), request: request)
        XCTAssertEqual(result.inputSequence, 100)
        for invalid in [7, 1_000_001] {
            raw["inputSequence"] = invalid
            XCTAssertThrowsError(try NativeTravelDirectionsPublication.decode(JSONSerialization.data(withJSONObject: raw), request: request))
        }
    }
    @MainActor func testPublicationNeedsFreshMatchingDigestIntakeAndOriginalResultSource() async throws {
        let conversation = "11111111-1111-4111-8111-111111111111", goal = "22222222-2222-4222-8222-222222222222"
        let parent = "33333333-3333-4333-8333-333333333333", policy = "44444444-4444-4444-8444-444444444444"
        let artifact = "55555555-5555-4555-8555-555555555555", digest = String(repeating: "a", count: 64)
        let selection = NativeTravelDirectionsSelection(scope: .init(endpoint: "http://127.0.0.1:59321", subject: "owner", mobileEpoch: 1, generation: 1),
            conversationID: conversation, goalID: goal, goalVersion: 1, parentMessageID: parent, planningPolicyID: policy)
        for mismatched in [false, true] {
            var liveSelection = selection
            let store = NativeTravelDirectionsIntakeStore()
            store.bind(selection)
            await store.load(current: { liveSelection }, read: { kind, _, _ in
                let data: [String: Any] = kind == "basis" ? ["kind": "directions_write_basis", "conversationId": conversation, "goalId": goal,
                    "goalVersion": 1, "parentMessageId": parent, "messageSequence": 7, "intakeRevision": 0, "intakeDigest": NSNull(), "policyId": policy]
                    : ["kind": "unavailable", "reason": "intake_unrecorded"]
                return try JSONSerialization.data(withJSONObject: ["version": 1, "data": data])
            })
            var values = NativeTravelDirectionsFormValues(); values.destinations = "Shanghai\nBeijing"; values.duration = "10"; values.interests = "food\nwalks"
            var captured: [String: Any] = [:]
            var resultReads = 0
            await store.submit(values: values, text: "Ten days in Shanghai and Beijing", locale: "en", current: { liveSelection }, post: { bytes in
                captured = try XCTUnwrap(JSONSerialization.jsonObject(with: bytes) as? [String: Any])
                liveSelection = .init(scope: selection.scope, conversationID: conversation, goalID: goal, goalVersion: 1,
                    parentMessageID: try XCTUnwrap(captured["messageId"] as? String), planningPolicyID: policy)
                return try JSONSerialization.data(withJSONObject: ["version": 1, "kind": "published", "artifactId": artifact, "revision": 1,
                    "reused": false, "taskId": captured["taskId"]!, "turnId": captured["turnId"]!, "conversationId": conversation, "goalId": goal,
                    "goalVersion": 1, "inputMessageId": captured["messageId"]!, "inputSequence": 100, "intakeRevision": 1, "intakeDigest": digest, "current": true])
            }, read: { id, revision in
                resultReads += 1
                var c = content(); c["intake"] = captured["intake"]; c["selectedDirectionId"] = NSNull(); c["draft"] = NSNull()
                var envelope = try XCTUnwrap(JSONSerialization.jsonObject(with: self.envelope(c, id: id, revision: revision)) as? [String: Any])
                var data = try XCTUnwrap(envelope["data"] as? [String: Any])
                data["source"] = ["tripId": NSNull(), "tripVersion": NSNull(), "taskId": captured["taskId"]!, "taskTurnId": captured["turnId"]!,
                    "goalId": goal, "goalVersion": 1, "inputMessageId": captured["messageId"]!, "inputSequence": 100]
                envelope["data"] = data
                return try JSONSerialization.data(withJSONObject: envelope)
            }, readIntake: { _, _ in
                try JSONSerialization.data(withJSONObject: ["version": 1, "data": ["kind": "directions_intake", "schemaVersion": "travel-directions-current-basis/1",
                    "conversationId": conversation, "goalId": goal, "goalVersion": 1, "inputMessageId": captured["messageId"]!, "inputSequence": 100,
                    "intakeRevision": 1, "intakeDigest": mismatched ? String(repeating: "b", count: 64) : digest,
                    "intake": captured["intake"]!, "memoryBasis": [], "tripId": NSNull(), "tripVersion": NSNull(), "profilePace": NSNull()]])
            })
            if mismatched {
                XCTAssertNil(store.publication); XCTAssertNotNil(store.pendingBody); XCTAssertEqual(resultReads, 0)
            } else {
                XCTAssertEqual(store.publication?.inputSequence, 100); XCTAssertNil(store.pendingBody); XCTAssertEqual(resultReads, 1)
            }
        }
    }
}

extension NativeTravelDirectionsTests {
    @MainActor private func localPaceSnapshot(revision: Int = 5, state: String = "explicit") throws -> Data {
        try JSONSerialization.data(withJSONObject: ["schemaVersion": "travel-pace/1", "revision": revision, "state": state,
            "travelPace": "relaxed", "scope": "account", "purpose": "local_trip_planning", "noticeVersion": "local-planning-cross-trip-v1",
            "operationId": "11111111-1111-4111-8111-111111111111"])
    }
    @MainActor private func localPaceProjection(trip: String) throws -> Data {
        try JSONSerialization.data(withJSONObject: ["schemaVersion": "task-travel-pace/1", "tripId": trip, "travelPace": "relaxed",
            "source": "profile", "sourceRevision": 5, "sourceOperationId": "11111111-1111-4111-8111-111111111111", "purpose": "local_trip_planning"])
    }
    @MainActor private func localPaceKey() -> NativeTravelDirectionsLocalPaceStore.Key {
        .init(scope: .init(endpoint: "http://127.0.0.1:59321", subject: "owner", mobileEpoch: 1, generation: 1),
            tripID: "22222222-2222-4222-8222-222222222222", artifactID: "33333333-3333-4333-8333-333333333333", revision: 1)
    }
    @MainActor func testLocalSavedPaceUsesOriginalProjectionAndBothReadClocks() async throws {
        let key = localPaceKey(); var wall = 1000.0, uptime = 100.0
        let store = NativeTravelDirectionsLocalPaceStore(wall: { wall }, uptime: { uptime })
        let snapshot = try localPaceSnapshot(), projection = try localPaceProjection(trip: key.tripID)
        var reads = 0
        await store.load(key: key, current: { key }, snapshot: { reads += 1; return snapshot }, project: { body in
            let request = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
            XCTAssertEqual(request["tripId"] as? String, key.tripID)
            XCTAssertEqual(request["expectedSourceRevision"] as? Int, 5)
            XCTAssertEqual(request["useSaved"] as? Bool, true)
            XCTAssertTrue(request["currentPace"] is NSNull)
            return projection
        })
        XCTAssertEqual(reads, 2)
        XCTAssertEqual(store.visible(current: key)?.sourceRevision, 5)
        wall = 999; XCTAssertNil(store.visible(current: key), "Wall clock rollback cannot prolong qualification")
        wall = 1000; uptime = 99; XCTAssertNil(store.visible(current: key), "Uptime rollback cannot prolong qualification")
        uptime = 130; XCTAssertNil(store.visible(current: key))
    }
    @MainActor func testLocalSavedPacePauseCorrectionErasureAndLateScopeCannotRevivePreview() async throws {
        let key = localPaceKey(), explicit = try localPaceSnapshot(), projection = try localPaceProjection(trip: key.tripID)
        let paused = try localPaceSnapshot(state: "paused")
        let store = NativeTravelDirectionsLocalPaceStore()
        var projects = 0
        await store.load(key: key, current: { key }, snapshot: { paused }, project: { _ in projects += 1; return projection })
        XCTAssertNil(store.visible(current: key)); XCTAssertEqual(projects, 0)
        var reads = 0
        let corrected = try localPaceSnapshot(revision: 6)
        await store.load(key: key, current: { key }, snapshot: { reads += 1; return reads == 1 ? explicit : corrected }, project: { _ in projection })
        XCTAssertNil(store.visible(current: key))
        await store.load(key: key, current: { key }, snapshot: { explicit }, project: { _ in projection })
        XCTAssertNotNil(store.visible(current: key))
        store.applyErasure(scope: key.scope, floor: 5)
        XCTAssertNil(store.visible(current: key))
        await store.load(key: key, current: { key }, snapshot: { explicit }, project: { _ in projection })
        XCTAssertNil(store.visible(current: key), "A fresh read cannot resurrect the erased revision")
        let lateStore = NativeTravelDirectionsLocalPaceStore()
        var live: NativeTravelDirectionsLocalPaceStore.Key? = key
        var continuation: CheckedContinuation<Data, Error>?
        let loading = Task { await lateStore.load(key: key, current: { live }, snapshot: {
            try await withCheckedThrowingContinuation { continuation = $0 }
        }, project: { _ in projection }) }
        for _ in 0..<100 where continuation == nil { await Task.yield() }
        let pending = try XCTUnwrap(continuation); live = nil; lateStore.clear(); pending.resume(returning: explicit)
        await loading.value
        XCTAssertNil(lateStore.projection)
    }
    @MainActor func testLocalSavedPacePreviewDoesNotAlterSavedDraftOrMakeTripGrant() throws {
        let content = try NativeTravelDirectionsContent.decode(self.content())
        let original = try XCTUnwrap(content.draft?.days)
        let preview = NativeTravelDirectionsLocalPacePreview.days(original, pace: .relaxed, chinese: false)
        XCTAssertEqual(preview.count, 10)
        XCTAssertEqual(preview.last?.city, "Beijing")
        XCTAssertEqual(preview[1].activities, ["Leave free time; activities undecided"])
        XCTAssertTrue(preview.allSatisfy(\.fixed))
        XCTAssertEqual(content.draft?.days.map(\.activities), original.map(\.activities))
        XCTAssertNil(content.intake.currentPace)
        XCTAssertEqual(content.draft?.paceSource, "none")
    }
}

extension NativeTravelDirectionsTests {
    @MainActor func testBindRetryKeepsOriginalBytesAndReturnsOnlyFreshOriginalProposal() async throws {
        let artifact = "11111111-1111-4111-8111-111111111111", trip = "22222222-2222-4222-8222-222222222222"
        let proposalID = "33333333-3333-4333-8333-333333333333", proposalArtifact = "44444444-4444-4444-8444-444444444444"
        let key = NativeTravelDirectionsStore.Key(scope: .init(endpoint: "http://127.0.0.1:59321", subject: "owner", mobileEpoch: 1, generation: 1), artifactID: artifact)
        func withTrip(_ bytes: Data) throws -> Data {
            var envelope = try XCTUnwrap(JSONSerialization.jsonObject(with: bytes) as? [String: Any])
            var data = try XCTUnwrap(envelope["data"] as? [String: Any])
            var source = try XCTUnwrap(data["source"] as? [String: Any]); source["tripId"] = trip; source["tripVersion"] = 4
            data["source"] = source; envelope["data"] = data
            return try JSONSerialization.data(withJSONObject: envelope)
        }
        let directions = try withTrip(envelope(content(), id: artifact, revision: 1))
        let reference = try withTrip(envelope(["schemaVersion": "change-proposal-reference/1", "proposalId": proposalID, "proposalRevision": 1, "actions": []], id: proposalArtifact, revision: 1))
        let store = NativeTravelDirectionsStore()
        await store.load(key: key, revision: 1, current: { key }, read: { _, _ in directions })
        var originalBody: Data?
        await store.perform(.bind(tripID: trip, tripVersion: 4, startDate: "2026-11-01"), current: { key }, post: { _, body in
            originalBody = body
            throw NativeDataError.server(code: "PROVIDER_UNAVAILABLE")
        }, read: { _, _ in directions })
        XCTAssertNotNil(store.pending); XCTAssertNil(store.proposal)
        await store.retry(current: { key }, post: { action, body in
            XCTAssertEqual(action, "bind"); XCTAssertEqual(body, originalBody)
            return try JSONSerialization.data(withJSONObject: ["version": 1, "kind": "proposal_created", "artifactId": artifact, "revision": 1,
                "reused": true, "tripId": trip, "tripVersion": 4, "proposalId": proposalID, "proposalRevision": 1,
                "proposalArtifactId": proposalArtifact, "proposalArtifactRevision": 1])
        }, read: { id, _ in id == artifact ? directions : reference })
        XCTAssertNil(store.pending)
        XCTAssertEqual(store.proposal?.proposalID, proposalID)
        XCTAssertEqual(store.proposal?.artifactID, proposalArtifact)
        XCTAssertNotNil(store.visible(current: key))
        XCTAssertNil(store.visible(current: nil), "A new actor/inactive consumer cannot present the old qualified proposal")
    }
}
