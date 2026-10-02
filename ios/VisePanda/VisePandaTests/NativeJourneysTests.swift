import XCTest
@testable import VisePanda

nonisolated final class NativeJourneysTests: XCTestCase {
    private let conversation = "10000000-0000-4000-8000-000000000001"
    private let goal = "20000000-0000-4000-8000-000000000001"
    private let trip = "30000000-0000-4000-8000-000000000001"
    private var scope: NativeDataScope { .init(endpoint: "http://127.0.0.1", subject: "owner", mobileEpoch: 1, generation: 1) }
    @MainActor
    func testPlanningEligibilityRequiresExactCurrentParentAndPreservesImmutableRetry() {
        let selected = AssistantGoal(goalId: goal, scopeVersion: 7, text: "Older goal")
        func message(_ id: String, _ version: Int) -> AssistantMessage {
            AssistantMessage(messageId: trip, sequence: 1, locale: "en", text: "Input",
                relationship: "goal_start", goalId: id, scopeVersion: version, taskId: nil,
                parentMessageId: nil, turnId: nil, status: "recorded", outcome: nil, output: nil)
        }
        let otherGoal = "20000000-0000-4000-8000-000000000002"
        let unrelated = [message(goal, 6), message(otherGoal, 7)]
        XCTAssertEqual(AssistantPlanningEligibility.evaluate(goal: selected, messages: [], hasPending: false), .missingParent)
        XCTAssertEqual(AssistantPlanningEligibility.evaluate(goal: selected, messages: unrelated, hasPending: false), .missingParent)
        let current = unrelated + [message(goal, 7)]
        XCTAssertEqual(AssistantPlanningEligibility.evaluate(goal: selected, messages: current, hasPending: false), .create)
        XCTAssertEqual(AssistantPlanningEligibility.parent(for: selected, messages: current)?.scopeVersion, 7)
        XCTAssertEqual(AssistantPlanningEligibility.evaluate(goal: selected, messages: unrelated, hasPending: true), .retry)
        let terminal = AssistantGoal(goalId: goal, scopeVersion: 10001, text: "Ended")
        XCTAssertEqual(AssistantPlanningEligibility.evaluate(goal: terminal, messages: [message(goal, 10001)], hasPending: false), .terminal)
        XCTAssertEqual(AssistantPlanningEligibility.evaluate(goal: terminal, messages: [], hasPending: true), .retry)
    }

    private func data(_ value: Any) throws -> Data { try JSONSerialization.data(withJSONObject: value) }
    private func policy(_ state: String = "accepted") throws -> Data {
        try data(["version":5,"kind":"policy","policy":["id":conversation,"provider":"qwen","recipient":"test","sourceRegion":"test","processingRegion":"test","storageRegion":"test","termsVersion":"test","noticeVersion":"test","noticeHash":String(repeating:"a",count:64),"noticeZh":"test","noticeEn":"test","retention":"retain_after_hide_v1","expiresAt":"2099-01-01","consentState":state]])
    }
    private func wire(_ path: String, linked: Bool = false, revision: Int = 1) throws -> Data {
        if path.hasSuffix("/policy") { return try policy() }
        if path == "api/trips/native/v2" { return try data(["version":2,"trips":[["id":trip,"title":"Saved Shanghai","headVersion":2,"updatedAt":"2026-10-02"]],"currentTripId":NSNull()]) }
        return try data(["version":5,"kind":"journeys_page","conversationId":conversation,"conversationVersion":1,"snapshot":String(repeating:"a",count:32),"goals":[["goalId":goal,"scopeVersion":1,"text":"China someday, dates undecided","relation":["state":linked ? "linked" : "unlinked","tripId":linked ? trip as Any : NSNull(),"tripHeadVersion":linked ? (revision == 1 ? 2 : 3) as Any : NSNull()]]],"nextCursor":NSNull()])
    }

    @MainActor
    func testUndatedGoalAndOwnedTripHaveDistinctIdentityAndNoWriterRequests() async throws {
        let store = NativeJourneysStore(); var paths: [String] = []
        await store.load(scope: scope, assistant: true, currentScope: { self.scope }) { path in
            paths.append(path); return try self.wire(path)
        }
        XCTAssertEqual(store.rows.first?.goal.text, "China someday, dates undecided")
        XCTAssertEqual(store.rows.first?.relation, .unlinked)
        XCTAssertEqual(store.trips.first?.id, trip)
        XCTAssertTrue(store.goalsAvailable); XCTAssertTrue(store.tripsAvailable)
        XCTAssertEqual(paths, ["api/trips/native/v2","api/chat/native/v5/policy","api/chat/native/v5/journeys","api/chat/native/v5/policy"])
    }
    @MainActor
    func testExactOwnedCurrentTripLinkAndStaleVersion() async throws {
        let store = NativeJourneysStore()
        await store.load(scope: scope, assistant: true, currentScope: { self.scope }) { try self.wire($0, linked: true) }
        XCTAssertEqual(store.rows.first?.relation, .linked(trip))
        await store.load(scope: scope, assistant: true, currentScope: { self.scope }) { try self.wire($0, linked: true, revision: 2) }
        XCTAssertEqual(store.rows.first?.relation, .unknown)
        for patch in [["tripHeadVersion": 3 as Any], ["tripId": "40000000-0000-4000-8000-000000000001" as Any]] {
            await store.load(scope: scope, assistant: true, currentScope: { self.scope }) { path in
                let bytes = try self.wire(path, linked: true)
                guard path == "api/chat/native/v5/journeys" else { return bytes }
                var reply = try XCTUnwrap(JSONSerialization.jsonObject(with: bytes) as? [String:Any])
                var goals = try XCTUnwrap(reply["goals"] as? [[String:Any]])
                var relation = try XCTUnwrap(goals[0]["relation"] as? [String:Any])
                for (key,value) in patch { relation[key] = value }
                goals[0]["relation"] = relation; reply["goals"] = goals
                return try self.data(reply)
            }
            XCTAssertEqual(store.rows.first?.relation, .unknown)
        }
    }
    @MainActor
    func testMissingPageRelationFieldsAreUnavailableRatherThanUnlinked() async throws {
        let store = NativeJourneysStore()
        await store.load(scope: scope, assistant: true, currentScope: { self.scope }) { path in
            let bytes = try self.wire(path)
            guard path == "api/chat/native/v5/journeys" else { return bytes }
            var reply = try XCTUnwrap(JSONSerialization.jsonObject(with: bytes) as? [String:Any])
            var goals = try XCTUnwrap(reply["goals"] as? [[String:Any]])
            goals[0]["relation"] = ["state":"unlinked"]; reply["goals"] = goals
            return try self.data(reply)
        }
        XCTAssertFalse(store.goalsAvailable); XCTAssertTrue(store.rows.isEmpty); XCTAssertTrue(store.tripsAvailable)
    }
    @MainActor
    func testWithdrawalDuringReadHidesGoalsButRetainsIndependentTripList() async throws {
        let store = NativeJourneysStore(); var policies = 0
        await store.load(scope: scope, assistant: true, currentScope: { self.scope }) { path in
            if path.hasSuffix("/policy") { policies += 1; return try self.policy(policies == 1 ? "accepted" : "withdrawn") }
            return try self.wire(path)
        }
        XCTAssertTrue(store.rows.isEmpty); XCTAssertFalse(store.goalsAvailable)
        XCTAssertTrue(store.tripsAvailable); XCTAssertEqual(store.trips.count, 1)
    }
    @MainActor
    func testAccountSwitchAndLateReadAfterClearCannotPublish() async throws {
        let store = NativeJourneysStore(); var current: NativeDataScope? = scope
        await store.load(scope: scope, assistant: true, currentScope: { current }) { path in
            current = nil; return try self.wire(path)
        }
        XCTAssertTrue(store.rows.isEmpty); XCTAssertTrue(store.trips.isEmpty)
        await store.load(scope: scope, assistant: true, currentScope: { self.scope }) { path in
            store.clear(); return try self.wire(path)
        }
        XCTAssertNil(store.scope); XCTAssertTrue(store.trips.isEmpty)
        var pending: CheckedContinuation<Data, Error>?
        let read = Task {
            await store.load(scope: self.scope, assistant: true, currentScope: { self.scope }) { _ in
                try await withCheckedThrowingContinuation { pending = $0 }
            }
        }
        while pending == nil { await Task.yield() }
        store.clear()
        pending?.resume(returning: try wire("api/trips/native/v2"))
        await read.value
        XCTAssertNil(store.scope); XCTAssertTrue(store.rows.isEmpty); XCTAssertTrue(store.trips.isEmpty)
    }
    @MainActor
    func testExpiryIsRequestBoundAndOldModeKeepsTripReadsOnly() async throws {
        let start: TimeInterval = 1000; var clock = start
        let store = NativeJourneysStore(uptime: { clock })
        await store.load(scope: scope, assistant: false, currentScope: { self.scope }, request: { path in
            XCTAssertEqual(path, "api/trips/native/v2"); clock = start + 10
            return try self.wire(path)
        })
        clock = start + 19
        XCTAssertTrue(store.isCurrent(scope))
        clock = start + 20
        XCTAssertFalse(store.isCurrent(scope))
        XCTAssertFalse(store.goalsAvailable); XCTAssertTrue(store.tripsAvailable)
    }
    @MainActor
    func testMalformedAndOversizedGoalListNeverBecomesEmptySuccess() async throws {
        for malformed in [true, false] {
            let store = NativeJourneysStore()
            await store.load(scope: scope, assistant: true, currentScope: { self.scope }) { path in
                if path == "api/chat/native/v5/journeys" {
                    let row: [String:Any] = malformed ? ["goalId":self.goal,"text":"missing version"] : ["goalId":self.goal,"scopeVersion":1,"text":"duplicate/over bound"]
                    return try self.data(["version":5,"kind":"journeys_page","conversationId":self.conversation,"conversationVersion":1,"snapshot":String(repeating:"a",count:32),"nextCursor":NSNull(),"goals":Array(repeating:row,count:malformed ? 1 : 51)])
                }
                return try self.wire(path)
            }
            XCTAssertFalse(store.goalsAvailable); XCTAssertTrue(store.rows.isEmpty); XCTAssertTrue(store.tripsAvailable)
        }
    }
    @MainActor
    func testTripEntryReloadsThenSelectsOnlyTheOwnedRequestedID() async {
        let selected = NativeJourneyTripSelection(tripID: trip, scope: scope)
        var paths: [String] = []
        let opened = await NativeJourneyTripEntry.open(selected, currentScope: { self.scope }, reload: {
            paths.append("reload")
            return [.init(id: self.trip, title: "Owned", headVersion: 2, updatedAt: "today")]
        }, select: { id in paths.append(id); return true })
        XCTAssertTrue(opened); XCTAssertEqual(paths, ["reload", trip])
    }
    @MainActor
    func testTripEntryRejectsMissingIDAndScopeReplacementAfterReload() async {
        for replaced in [false, true] {
            let selected = NativeJourneyTripSelection(tripID: trip, scope: scope)
            var current: NativeDataScope? = scope; var selects = 0
            let opened = await NativeJourneyTripEntry.open(selected, currentScope: { current }, reload: {
                if replaced { current = .init(endpoint: self.scope.endpoint, subject: "other", mobileEpoch: 2, generation: 2) }
                return replaced ? [.init(id: self.trip, title: "Old owner", headVersion: 2, updatedAt: "today")] : []
            }, select: { _ in selects += 1; return true })
            XCTAssertFalse(opened); XCTAssertEqual(selects, 0)
        }
    }
    @MainActor
    func testTripEntrySelectionFailureCannotFallBackToAnotherTrip() async {
        let opened = await NativeJourneyTripEntry.open(.init(tripID: trip, scope: scope), currentScope: { self.scope }, reload: {
            [.init(id: self.trip, title: "Owned", headVersion: 2, updatedAt: "today")]
        }, select: { _ in false })
        XCTAssertFalse(opened)
    }

    @MainActor
    func testSlowReadCannotPublishAfterTwentySecondsOfUptime() async throws {
        var clock: TimeInterval = 1000
        let store = NativeJourneysStore(uptime: { clock })
        var requests = 0
        await store.load(scope: scope, assistant: true, currentScope: { self.scope }) { path in
            requests += 1
            clock += 21 // Elapsed read time, independent of wall-clock correction.
            return try self.wire(path)
        }
        XCTAssertEqual(requests, 1)
        XCTAssertTrue(store.rows.isEmpty); XCTAssertTrue(store.trips.isEmpty)
        XCTAssertFalse(store.isCurrent(scope)); XCTAssertFalse(store.busy)
    }

    @MainActor
    func testLateFinalPolicyReadCannotPublishAndRenderUsesTheSameClock() async throws {
        var clock: TimeInterval = 1000
        let store = NativeJourneysStore(uptime: { clock })
        var policyReads = 0
        await store.load(scope: scope, assistant: true, currentScope: { self.scope }) { path in
            if path.hasSuffix("/policy") {
                policyReads += 1
                if policyReads == 2 { clock += 20 }
            }
            return try self.wire(path)
        }
        XCTAssertEqual(policyReads, 2)
        XCTAssertTrue(store.rows.isEmpty); XCTAssertTrue(store.trips.isEmpty)
        XCTAssertFalse(store.isCurrent(scope))
        await store.load(scope: scope, assistant: true, currentScope: { self.scope }) { try self.wire($0) }
        XCTAssertTrue(store.isCurrent(scope)); XCTAssertEqual(store.rows.count, 1)
        clock += 20
        XCTAssertFalse(store.isCurrent(scope))
    }

    @MainActor
    func testHundredGoalsUseFiveSummaryReadsAndReplaceEachPage() async throws {
        let store = NativeJourneysStore(); var ids: [String] = []; var pageReads = 0
        for _ in 0..<5 {
            let cursor = store.nextCursor
            await store.load(scope: scope, assistant: true, cursor: cursor, currentScope: { self.scope }) { path in
                guard path.hasPrefix("api/chat/native/v5/journeys") else { return try self.wire(path) }
                pageReads += 1
                let after = path.split(separator: "/").last!.split(separator: ".")
                let start = after.count == 5 ? Int(after[3].suffix(12))! : 0
                let rows = (start+1...start+20).map { n -> [String:Any] in
                    ["goalId":String(format:"90000000-0000-4000-8000-%012d",n),"scopeVersion":1,"text":"Goal \(n)","relation":["state":"unlinked","tripId":NSNull(),"tripHeadVersion":NSNull()]]
                }
                let last = rows.last!["goalId"] as! String
                let next: Any = start+20 < 100 ? "v1.\(self.conversation).101.\(last).\(String(repeating:"a",count:32))" : NSNull()
                return try self.data(["version":5,"kind":"journeys_page","conversationId":self.conversation,"conversationVersion":101,"snapshot":String(repeating:"a",count:32),"goals":rows,"nextCursor":next])
            }
            XCTAssertTrue(store.goalsAvailable); XCTAssertEqual(store.rows.count,20)
            ids += store.rows.map(\.id)
        }
        XCTAssertEqual(pageReads,5); XCTAssertEqual(Set(ids).count,100); XCTAssertNil(store.nextCursor)
        XCTAssertEqual(store.rows.first?.goal.text,"Goal 81")
    }

    @MainActor
    func testPageCursorVersionDriftAndInvalidTokenCannotRestoreOldRows() async throws {
        let store = NativeJourneysStore()
        await store.load(scope: scope, assistant: true, currentScope: { self.scope }) { try self.wire($0) }
        XCTAssertEqual(store.rows.count,1)
        let cursor = "v1.\(conversation).2.\(goal).\(String(repeating:"a",count:32))"
        await store.load(scope: scope, assistant: true, cursor: cursor, currentScope: { self.scope }) { try self.wire($0) }
        XCTAssertFalse(store.goalsAvailable); XCTAssertTrue(store.rows.isEmpty); XCTAssertNil(store.nextCursor)
        var reads = 0
        await store.load(scope: scope, assistant: true, cursor: "../bad", currentScope: { self.scope }) { _ in reads += 1; return Data() }
        XCTAssertEqual(reads,0); XCTAssertNil(store.scope)
    }

    @MainActor
    func testTerminalScope10001KeepsMixedPageReadableBut10002IsUnavailable() async throws {
        for version in [10001,10002] {
            let store = NativeJourneysStore()
            await store.load(scope: scope, assistant: true, currentScope: { self.scope }) { path in
                let bytes = try self.wire(path)
                guard path.hasPrefix("api/chat/native/v5/journeys") else { return bytes }
                var reply = try XCTUnwrap(JSONSerialization.jsonObject(with: bytes) as? [String:Any])
                var rows = try XCTUnwrap(reply["goals"] as? [[String:Any]])
                var ordinary = rows[0]; ordinary["goalId"] = "20000000-0000-4000-8000-000000000002"
                rows[0]["scopeVersion"] = version; rows.append(ordinary); reply["goals"] = rows
                return try self.data(reply)
            }
            if version == 10001 {
                XCTAssertTrue(store.goalsAvailable); XCTAssertEqual(store.rows.count,2)
                XCTAssertEqual(store.rows[0].goal.scopeVersion,10001); XCTAssertEqual(store.rows[0].relation,.unlinked)
                XCTAssertEqual(store.rows[1].goal.scopeVersion,1)
            } else { XCTAssertFalse(store.goalsAvailable); XCTAssertTrue(store.rows.isEmpty) }
        }
    }

    private func entryConversation(_ id: String, version: Int = 7) throws -> Data {
        try data(["version":5,"kind":"conversation","conversationId":id,"nextSequence":3,"messages":[],"goals":[
            ["goalId":goal,"scopeVersion":version,"text":"Selected earlier goal"],
            ["goalId":"20000000-0000-4000-8000-000000000002","scopeVersion":1,"text":"Last goal is different"]]])
    }

    @MainActor
    func testGoalEntryReadsExactConversationAndSelectsEarlierGoalRatherThanLast() async throws {
        let entry = NativeJourneyGoalEntry(scope: scope, conversationID: conversation, goalID: goal, scopeVersion: 7)
        var policies = 0
        let (_,read) = try await NativeJourneyGoalReader.read(entry, isCurrent: { true }, policy: {
            policies += 1; return try self.policy()
        }, conversation: { try self.entryConversation(entry.conversationID) })
        let selected = try XCTUnwrap(entry.goal(in: read, scope: scope))
        XCTAssertEqual(selected.goalId,goal); XCTAssertEqual(selected.scopeVersion,7)
        XCTAssertNotEqual(selected.goalId,read.goals.last?.goalId); XCTAssertEqual(policies,2)
        let other = NativeJourneyGoalEntry(scope: scope, conversationID: "10000000-0000-4000-8000-000000000002", goalID: goal, scopeVersion:7)
        XCTAssertNil(other.goal(in: read,scope:scope))
    }

    @MainActor
    func testGoalEntryRejectsWrongConversationOldVersionAndWithdrawnPolicy() async throws {
        let entry = NativeJourneyGoalEntry(scope: scope, conversationID: conversation, goalID: goal, scopeVersion:7)
        for mode in ["conversation","version","withdrawal"] {
            var policies = 0
            do {
                _ = try await NativeJourneyGoalReader.read(entry,isCurrent:{true},policy:{
                    policies += 1; return try self.policy(mode == "withdrawal" && policies == 2 ? "withdrawn":"accepted")
                },conversation:{ try self.entryConversation(mode == "conversation" ? "10000000-0000-4000-8000-000000000002":self.conversation,version:mode == "version" ? 8:7) })
                XCTFail("Stale/foreign/withdrawn goal must not become a selection")
            } catch {}
        }
    }

    @MainActor
    func testGoalEntryLateActorOrRequestChangeCannotPublish() async throws {
        let entry = NativeJourneyGoalEntry(scope:scope,conversationID:conversation,goalID:goal,scopeVersion:7)
        var current = true
        do {
            _ = try await NativeJourneyGoalReader.read(entry,isCurrent:{current},policy:{try self.policy()},conversation:{
                await Task.yield(); current = false; return try self.entryConversation(self.conversation)
            })
            XCTFail("Late handoff cannot publish after scope/request changes")
        } catch NativeDataError.staleSessionResponse {} catch { XCTFail("Unexpected error \(error)") }
        let read = try JSONDecoder().decode(AssistantConversation.self,from:entryConversation(conversation))
        let other = NativeDataScope(endpoint:scope.endpoint,subject:"other",mobileEpoch:1,generation:2)
        XCTAssertNil(entry.goal(in:read,scope:other))
    }

    @MainActor
    func testGoalEntryDraftDecisionRequiresExplicitDiscardAndNeverOverridesPending() {
        XCTAssertEqual(NativeJourneyGoalDraftDecision.decide(pending:true,draft:"draft",planningDraft:"",discard:true),.blocked)
        XCTAssertEqual(NativeJourneyGoalDraftDecision.decide(pending:false,draft:"draft",planningDraft:"",discard:false),.confirmDiscard)
        XCTAssertEqual(NativeJourneyGoalDraftDecision.decide(pending:false,draft:"",planningDraft:"plan",discard:false),.confirmDiscard)
        XCTAssertEqual(NativeJourneyGoalDraftDecision.decide(pending:false,draft:"draft",planningDraft:"",discard:true),.open)
        XCTAssertEqual(NativeJourneyGoalDraftDecision.decide(pending:false,draft:"",planningDraft:"",discard:false),.open)
    }

    @MainActor
    func testSameCompleteScopeReappearancePreservesSelectionButReplacementDoesNot() {
        let a = scope
        let replaced = NativeDataScope(endpoint:a.endpoint,subject:a.subject,mobileEpoch:a.mobileEpoch+1,generation:a.generation+1)
        XCTAssertTrue(NativeAssistantScopeAppearance.preservesContext(bound:a,retained:a,active:a))
        XCTAssertTrue(NativeAssistantScopeAppearance.preservesContext(bound:a,retained:a,active:nil))
        XCTAssertFalse(NativeAssistantScopeAppearance.preservesContext(bound:a,retained:replaced,active:replaced))
        XCTAssertFalse(NativeAssistantScopeAppearance.preservesContext(bound:a,retained:a,active:replaced))
        XCTAssertFalse(NativeAssistantScopeAppearance.preservesContext(bound:a,retained:nil,active:nil))
    }

    @MainActor
    func testConversationAndGoalSelectionPublishAtomicallyAndManualSelectionClearsPin() {
        var selection = AssistantConversationSelection()
        selection.select("10000000-0000-4000-8000-000000000002")
        let entry = NativeJourneyGoalEntry(scope:scope,conversationID:conversation,goalID:goal,scopeVersion:7)
        selection.selectGoal(entry)
        XCTAssertEqual(selection.conversationID,conversation); XCTAssertEqual(selection.goalEntry,entry)
        let generation=selection.generation
        XCTAssertTrue(NativeAssistantScopeAppearance.preservesContext(bound:scope,retained:scope,active:scope))
        XCTAssertEqual(selection.generation,generation); XCTAssertEqual(selection.goalEntry,entry)
        selection.select(nil)
        XCTAssertNil(selection.goalEntry); XCTAssertNil(selection.conversationID)
    }

}
