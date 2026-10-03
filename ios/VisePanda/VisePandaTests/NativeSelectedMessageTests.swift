import XCTest
@testable import VisePanda

nonisolated final class NativeSelectedMessageTests: XCTestCase {
    @MainActor private func request() -> NativeSelectedMessageRequest {
        .init(conversationId:UUID().uuidString,messageId:UUID().uuidString,idempotencyKey:UUID().uuidString,policyId:UUID().uuidString,locale:"en",text:"Continue using this explicit Trip version",relationship:"follow_up",goalId:UUID().uuidString,expectedGoalVersion:2,parentMessageId:UUID().uuidString,turnId:nil,selectedSources:.init(trip:.init(tripId:UUID().uuidString,headVersion:3)))
    }
    @MainActor private func accepted(_ r: NativeSelectedMessageRequest) throws -> Data {
        try JSONSerialization.data(withJSONObject:["version":6,"kind":"accepted","conversationId":r.conversationId,"messageId":r.messageId,"sequence":5,"goalId":r.goalId!,"scopeVersion":2,"turnId":NSNull(),"reused":false,"selectedSources":["artifact":NSNull(),"trip":["tripId":r.selectedSources.trip!.tripId,"headVersion":3,"purpose":"current_trip_reference"],"evidence":[]],"readyForProvider":false])
    }
    @MainActor private func manifest(_ r:NativeSelectedMessageRequest, purpose:String="previous_result_reference",current:Bool=false) throws -> Data {
        let sections=["system","policy","constraints","trip","proposal","memory","evidence","tool","thread","user_message"]
        return try JSONSerialization.data(withJSONObject:["version":6,"kind":"context_manifest","schemaVersion":"assistant-goal-context/2","conversationId":r.conversationId,"goalId":r.goalId!,"goalScopeVersion":2,"messageId":r.messageId,"messageSequence":5,"selectedMemoryCount":0,"readyForProvider":false,"context":["contextVersion":"assistant-selected-source-context-plan/2","compactionVersion":"context-compaction-v1","sourceRefs":[["id":"artifact:synthetic","kind":"thread","sourceVersion":"revision:1","purpose":purpose,"recipient":"first_party","artifactId":UUID().uuidString,"revision":1,"originGoalVersion":1,"current":current]],"sourceVersions":["revision:1"],"omittedReasons":[],"sectionTokenCounts":Dictionary(uniqueKeysWithValues:sections.map{($0,1)}),"totalTokens":10,"contentHashes":[String(repeating:"a",count:64)]]])
    }
    @MainActor func testExactFourteenKeyNoPaidTaskAndFiveContextSelectors() throws {
        let r=request(); XCTAssertTrue(r.valid)
        let json=try XCTUnwrap(JSONSerialization.jsonObject(with:JSONEncoder().encode(r)) as? [String:Any])
        XCTAssertEqual(Set(json.keys),Set(NativeSelectedMessageRequest.CodingKeys.allCases.map(\.rawValue)));XCTAssertEqual(json.count,14)
        XCTAssertTrue(json["taskId"] is NSNull);XCTAssertTrue(json["turnId"] is NSNull)
        let refs=try XCTUnwrap(json["selectedSources"] as? [String:Any]);XCTAssertEqual(Set(refs.keys),Set(["artifact","trip","evidence"]))
        XCTAssertTrue(refs["artifact"] is NSNull);XCTAssertNil(refs["current"]);XCTAssertNil(json["budget"])
        let c=NativeSelectedContextRequest(conversationId:r.conversationId,goalId:r.goalId!,messageId:r.messageId,expectedGoalVersion:2,memoryIds:[])
        let ctx=try XCTUnwrap(JSONSerialization.jsonObject(with:JSONEncoder().encode(c)) as? [String:Any]);XCTAssertEqual(ctx.count,5);XCTAssertNil(ctx["selectedSources"])
    }
    @MainActor func testCapturedReceiptAndHistoricalContextCannotGrantCurrentAdvice() throws {
        let r=request();XCTAssertTrue(try NativeSelectedMessageAccepted.decode(accepted(r)).matches(r))
        let old=try NativeSelectedContextManifest.decode(manifest(r));XCTAssertEqual(old.context.sourceRefs[0].current,false)
        XCTAssertThrowsError(try NativeSelectedContextManifest.decode(manifest(r,current:true)))
        var bad=try XCTUnwrap(JSONSerialization.jsonObject(with:accepted(r)) as? [String:Any]);bad["readyForProvider"]=true
        XCTAssertThrowsError(try NativeSelectedMessageAccepted.decode(JSONSerialization.data(withJSONObject:bad)))
        bad["readyForProvider"]=false;bad["providerPayload"]="private";XCTAssertThrowsError(try NativeSelectedMessageAccepted.decode(JSONSerialization.data(withJSONObject:bad)))
    }
    @MainActor func testSameOperationRetryAnd409RetainFrozenRequestNoAutomaticPost() async throws {
        let r=request(),scope=NativeDataScope(endpoint:"http://127.0.0.1:63251",subject:UUID().uuidString,mobileEpoch:1,generation:1),store=NativeSelectedMessageStore()
        store.bind(scope);_=try store.prepare(r);XCTAssertEqual(try store.prepare(r),r);var posts=0
        do {_=try await store.send(currentScope:{scope},post:{_ in posts+=1;throw NativeDataError.server(code:"SERVICE_TASK_CONFLICT")},context:{_ in XCTFail();return Data()});XCTFail()}catch{}
        XCTAssertEqual(posts,1);XCTAssertEqual(store.pending,r);XCTAssertNil(store.manifest)
        let receipt=try await store.send(currentScope:{scope},post:{_ in posts+=1;return try self.accepted(r)},context:{_ in try self.manifest(r)})
        XCTAssertEqual(receipt.messageID,r.messageId);XCTAssertNil(store.pending);XCTAssertNotNil(store.manifest);XCTAssertEqual(posts,2)
    }
    @MainActor func testRevocationAndLateResponseCannotRestoreOldActorCache() async throws {
        let r=request(),scope=NativeDataScope(endpoint:"http://127.0.0.1:63251",subject:UUID().uuidString,mobileEpoch:1,generation:1),store=NativeSelectedMessageStore()
        store.bind(scope);_=try store.prepare(r);var resume:CheckedContinuation<Data,Never>?
        let pending=Task {try? await store.send(currentScope:{store.scope},post:{_ in await withCheckedContinuation{resume=$0}},context:{_ in try self.manifest(r)})}
        while resume==nil {await Task.yield()};store.bind(nil);resume?.resume(returning:try accepted(r));_=await pending.value
        XCTAssertNil(store.pending);XCTAssertNil(store.manifest);XCTAssertTrue(store.sources.empty)
        store.bind(scope);_=try store.prepare(r)
        do{_=try await store.send(currentScope:{scope},post:{_ in throw NativeDataError.server(code:"DATA_POLICY_BLOCKED")},context:{_ in Data()});XCTFail()}catch{}
        XCTAssertNil(store.pending);XCTAssertNil(store.manifest);XCTAssertTrue(store.sources.empty)
    }
}
