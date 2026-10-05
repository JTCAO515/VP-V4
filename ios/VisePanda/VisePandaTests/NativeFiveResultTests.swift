import XCTest
@testable import VisePanda

nonisolated final class NativeFiveResultTests:XCTestCase {
    @MainActor func testArchiveReferenceProofIsTripOnlyStrictBooleanAndExactShape() throws {
        let trip=UUID().uuidString.lowercased(),artifact=UUID().uuidString.lowercased()
        func bytes(_ row:[String:Any]) throws -> Data { try JSONSerialization.data(withJSONObject:["version":2,"data":row]) }
        let original:[String:Any]=["kind":"result_reference","tripId":trip,"artifactId":artifact,"revision":1]
        XCTAssertEqual(try NativeFiveResultReference.decode(bytes(original),field:"tripId",expectedID:trip)?.artifactID,artifact)
        var archived=original;archived["archiveHistorical"]=true
        XCTAssertEqual(try NativeFiveResultReference.decode(bytes(archived),field:"tripId",expectedID:trip)?.artifactID,artifact)
        XCTAssertThrowsError(try NativeFiveResultReference.decode(bytes(archived),field:"tripId",expectedID:UUID().uuidString.lowercased()))
        for invalid in [false as Any,1 as Any,NSNull(),"true" as Any] {
            var malformed=original;malformed["archiveHistorical"]=invalid
            XCTAssertThrowsError(try NativeFiveResultReference.decode(bytes(malformed),field:"tripId",expectedID:trip))
        }
        var extra=archived;extra["extra"]=true
        XCTAssertThrowsError(try NativeFiveResultReference.decode(bytes(extra),field:"tripId",expectedID:trip))
        var task=original;task["tripId"]=nil;task["taskId"]=trip
        XCTAssertNotNil(try NativeFiveResultReference.decode(bytes(task),field:"taskId",expectedID:trip))
        task["archiveHistorical"]=true
        XCTAssertThrowsError(try NativeFiveResultReference.decode(bytes(task),field:"taskId",expectedID:trip))
    }
    @MainActor private func comparison()->[String:Any]{["schemaVersion":"comparison/1","title":"Comparison","summary":"Supported options","options":[["id":"a","title":"A","tradeoff":"A tradeoff"],["id":"b","title":"B","tradeoff":"B tradeoff"]],"actions":[]]}
    @MainActor private func record(_ content:[String:Any],id:String,revision:Int=1,current:Bool=true)throws->Data{
        try JSONSerialization.data(withJSONObject:["version":2,"data":["kind":"result_artifact","artifactId":id,"revision":revision,"currentRevision":revision,"current":current,"historicalReadable":true,"lifecycle":"active",
            "source":["taskId":UUID().uuidString,"taskTurnId":UUID().uuidString,"goalId":UUID().uuidString,"goalVersion":1,"inputMessageId":UUID().uuidString,"inputSequence":1,"tripId":NSNull(),"tripVersion":NSNull()],"basis":["memories":[],"evidence":[]],"content":content,"createdAt":"2026-10-03T00:00:00Z"]])
    }
    @MainActor func testFiveClosedTypesAndInertActionsNoFutureOrHtmlAction()throws{
        let draft:[String:Any]=["schemaVersion":"journey-draft/1","title":"Draft","summary":"Immutable preview","draft":["version":0,"title":"Trip draft","days":[["id":"day1","date":"2026-10-03","items":[["id":"item1","dayId":"day1","title":"Walk"]]]]],"source":["kind":"task_output","taskTurnId":UUID().uuidString],"actions":[]]
        let decision:[String:Any]=["schemaVersion":"decision/1","title":"Decision","summary":"Choose","comparisonRef":["artifactId":UUID().uuidString,"revision":1],"state":"pending","chosenOptionId":NSNull(),"actions":[]]
        let practical:[String:Any]=["schemaVersion":"practical/1","kind":"translation","sourceTurnId":UUID().uuidString,"sourceLocale":"en","targetLocale":"zh","translation":"你好","backTranslation":"Hello","actions":[]]
        let proposal:[String:Any]=["schemaVersion":"change-proposal-reference/1","proposalId":UUID().uuidString,"proposalRevision":1,"actions":[]]
        for content in [comparison(),draft,decision,practical,proposal]{XCTAssertNoThrow(try NativeFiveResultContent.decode(content));var bad=content;bad["actions"]=["javascript:run"];XCTAssertThrowsError(try NativeFiveResultContent.decode(bad));bad=content;bad["html"]="<script>";XCTAssertThrowsError(try NativeFiveResultContent.decode(bad))}
        let row:[String:Any]=["artifactId":UUID().uuidString,"revision":1,"schemaVersion":"practical/1","title":"Translation","summary":"Saved","tripId":NSNull(),"tripVersion":NSNull()]
        func index(_ row:[String:Any])throws->Data {try JSONSerialization.data(withJSONObject:["version":2,"data":["kind":"result_search","results":[row],"nextCursor":NSNull()]])}
        XCTAssertNoThrow(try NativeFiveResultSearch.validate(index(row)));var unknown=row;unknown["schemaVersion"]="future/1";XCTAssertThrowsError(try NativeFiveResultSearch.validate(index(unknown)))
        var future=comparison();future["schemaVersion"]="future/1";XCTAssertThrowsError(try NativeFiveResultContent.decode(future))
        var bad=decision;bad["state"]="chosen";XCTAssertThrowsError(try NativeFiveResultContent.decode(bad))
        bad=practical;bad["targetLocale"]="en";XCTAssertThrowsError(try NativeFiveResultContent.decode(bad))
    }
    @MainActor func testExactIdentityActorAndHistoricalCurrentnessAreIndependent()async throws{
        let id=UUID().uuidString,scope=NativeDataScope(endpoint:"http://127.0.0.1:63251",subject:UUID().uuidString,mobileEpoch:1,generation:1)
        let bytes=try record(comparison(),id:id,current:false);XCTAssertFalse(try XCTUnwrap(NativeFiveResultRecord.decode(bytes,artifactID:id,revision:1)).current)
        XCTAssertThrowsError(try NativeFiveResultRecord.decode(bytes,artifactID:UUID().uuidString,revision:1))
        let store=NativeFiveResultStore(),key=NativeFiveResultStore.Key(scope:scope,artifactID:id,revision:1)
        await store.load(key:key,current:{key},request:{bytes});XCTAssertNotNil(store.visible(scope));store.clear();XCTAssertNil(store.visible(scope))
    }
    @MainActor func testOwnerChoiceCasExactNextReadAndIdempotentRetry()async throws{
        let id=UUID().uuidString,comparisonID=UUID().uuidString,scope=NativeDataScope(endpoint:"http://127.0.0.1:63251",subject:UUID().uuidString,mobileEpoch:1,generation:1)
        let key=NativeFiveResultStore.Key(scope:scope,artifactID:id,revision:1),store=NativeFiveResultStore()
        let content:[String:Any]=["schemaVersion":"decision/1","title":"Decision","summary":"Choose","comparisonRef":["artifactId":comparisonID,"revision":1],"state":"pending","chosenOptionId":NSNull(),"actions":[]]
        await store.load(key:key,current:{key},request:{try self.record(content,id:id)})
        let source=try XCTUnwrap(NativeFiveResultRecord.decode(record(comparison(),id:comparisonID),artifactID:comparisonID,revision:1))
        var received:[Data]=[]
        await store.choose(option:"a",comparison:source,current:{key},post:{data in received.append(data);throw NativeDataError.server(code:"RESULT_UNAVAILABLE")},read:{_,_ in XCTFail();return Data()})
        XCTAssertEqual(received.count,1);XCTAssertNotNil(store.pendingChoice);XCTAssertNil(store.visible(scope))
        await store.retryChoice(current:{key},post:{data in received.append(data);return try JSONSerialization.data(withJSONObject:["version":2,"data":["kind":"selected","artifactId":id,"revision":2,"reused":true]])},read:{requested,rev in
            XCTAssertEqual(requested,id);XCTAssertEqual(rev,2);var chosen=content;chosen["state"]="chosen";chosen["chosenOptionId"]="a";return try self.record(chosen,id:id,revision:2)
        })
        XCTAssertEqual(received.count,2);XCTAssertEqual(received[0],received[1]);XCTAssertNil(store.pendingChoice);XCTAssertEqual(store.visible(scope)?.revision,2)
    }
    @MainActor func testLateChoiceAfterExactSelectionChangeCannotPublishAndActorDenialClearsRetry()async throws{
        let id=UUID().uuidString,comparisonID=UUID().uuidString
        let scope=NativeDataScope(endpoint:"http://127.0.0.1:63251",subject:UUID().uuidString,mobileEpoch:1,generation:1)
        let key=NativeFiveResultStore.Key(scope:scope,artifactID:id,revision:1),store=NativeFiveResultStore()
        var selected:NativeFiveResultStore.Key?=key
        let content:[String:Any]=["schemaVersion":"decision/1","title":"Decision","summary":"Choose","comparisonRef":["artifactId":comparisonID,"revision":1],"state":"pending","chosenOptionId":NSNull(),"actions":[]]
        let source=try XCTUnwrap(NativeFiveResultRecord.decode(record(comparison(),id:comparisonID),artifactID:comparisonID,revision:1))
        await store.load(key:key,current:{selected},request:{try self.record(content,id:id)})
        await store.choose(option:"a",comparison:source,current:{selected},post:{_ in
            selected = .init(scope:scope,artifactID:UUID().uuidString,revision:1)
            return try JSONSerialization.data(withJSONObject:["version":2,"data":["kind":"selected","artifactId":id,"revision":2,"reused":false]])
        },read:{_,_ in XCTFail("Late response must not read or publish a changed selection");return Data()})
        XCTAssertEqual(store.visible(scope)?.revision,1)
        selected=key
        await store.load(key:key,current:{selected},request:{try self.record(content,id:id)})
        await store.choose(option:"a",comparison:source,current:{selected},post:{_ in throw NativeDataError.server(code:"UNAUTHENTICATED")},read:{_,_ in XCTFail();return Data()})
        XCTAssertNil(store.visible(scope));XCTAssertNil(store.pendingChoice)
    }

    @MainActor func testExactOpenClockIncludesNetworkDelayAndRejectsExpiredRead()async throws{
        let id=UUID().uuidString,scope=NativeDataScope(endpoint:"http://127.0.0.1:63251",subject:UUID().uuidString,mobileEpoch:1,generation:1)
        let key=NativeFiveResultStore.Key(scope:scope,artifactID:id,revision:1)
        var now:TimeInterval=0
        let store=NativeFiveResultStore(uptime:{now}),bytes=try record(comparison(),id:id)
        await store.load(key:key,current:{key},request:{now=20;return bytes})
        XCTAssertNotNil(store.visible(scope));now=30;XCTAssertNil(store.visible(scope))
        now=100
        await store.load(key:key,current:{key},request:{now=131;return bytes})
        XCTAssertNil(store.record);XCTAssertNil(store.visible(scope))
    }

}
