import XCTest
@testable import VisePanda

nonisolated final class NativeLinkedTripDeletionTests:XCTestCase {
    private let trip="12345678-1234-4234-8234-123456789abc"
    private let planID="22345678-1234-4234-8234-123456789abc"
    private let exportID="32345678-1234-4234-8234-123456789abc"
    @MainActor private var target:NativeLinkedTripDeleteSelection{.init(scope:.init(endpoint:"http://127.0.0.1:63251",subject:exportID,mobileEpoch:1,generation:1),tripID:trip,headVersion:2)}
    @MainActor private func bytes(_ root:[String:Any])throws->Data{try JSONSerialization.data(withJSONObject:root)}
    @MainActor private func plan(exports:Bool=true)throws->NativeLinkedTripDeletePlan {
        try NativeLinkedTripDeletePlan.decode(bytes(["kind":"linked_trip_delete_plan/1","planId":planID,"tripId":trip,"title":"Owned Trip","expectedVersion":2,"scopeDigest":String(repeating:"a",count:64),"expiresAt":utc(Date().addingTimeInterval(120)),"selection":["threadIds":[],"turnIds":[],"taskIds":[],"goalIds":[],"messageIds":[],"artifactIds":[],"exportRequestIds":exports ? [exportID]:[]],"counts":["threads":0,"turns":0,"tasks":0,"goals":0,"messages":0,"artifacts":0,"exports":exports ? 1:0],"conflicts":[],"retained":NativeLinkedTripDeletePlan.retainedCodes]),target:target)
    }
    @MainActor private func utc(_ date:Date)->String{let f=ISO8601DateFormatter();f.formatOptions=[.withInternetDateTime,.withFractionalSeconds];return f.string(from:date)}
    @MainActor private func receipt(_ request:NativeLinkedTripDeleteRequest,state:String="queued")throws->Data {
        let selection=try JSONSerialization.jsonObject(with:JSONEncoder().encode(request.selection))
        return try bytes(["kind":"linked_trip_delete_receipt/1","requestId":request.requestId,"planId":request.planId,"tripId":trip,"scope":"trip-linked-chat-d3/1","scopeDigest":request.scopeDigest,"state":state,"requestedAt":utc(Date()),"completedAt":NSNull(),"selection":selection,"erasedCounts":NSNull(),"allUserDataCompleted":false,"retained":NativeLinkedTripDeletePlan.retainedCodes])
    }
    @MainActor func testClosedSevenScopeRejectsWrongTripAndQueuedIsNotCompletion()throws {
        let p=try plan(),request=NativeLinkedTripDeleteRequest(plan:p)
        XCTAssertEqual(p.selection.exportRequestIds,[exportID]);XCTAssertEqual(p.selection.groups.count,7)
        let queued=try NativeLinkedTripDeleteReceipt.decode(receipt(request),request:request,tripID:trip);XCTAssertEqual(queued.state,"queued");XCTAssertNil(queued.completedAt)
        XCTAssertThrowsError(try NativeLinkedTripDeleteReceipt.decode(receipt(request,state:"completed"),request:request,tripID:trip))
        XCTAssertThrowsError(try NativeLinkedTripDeleteReceipt.decode(receipt(request),request:request,tripID:exportID))
        let wire=try XCTUnwrap(JSONSerialization.jsonObject(with:JSONEncoder().encode(request)) as? [String:Any]);XCTAssertEqual(Set(wire.keys),Set(["action","requestId","planId","scopeDigest","expectedVersion","confirmed","selection"]));XCTAssertNil(wire["owner"])
    }
    @MainActor func testExportCopiesNeedSeparateAcknowledgementAndRetryUsesSameBody()async throws {
        let store=NativeLinkedTripDeletionStore(),selected=target,p=try plan()
        store.bind(selected)
        let raw=try bytes(["kind":p.kind,"planId":p.planId,"tripId":p.tripId,"title":p.title,"expectedVersion":p.expectedVersion,"scopeDigest":p.scopeDigest,"expiresAt":p.expiresAt,"selection":JSONSerialization.jsonObject(with:JSONEncoder().encode(p.selection)),"counts":p.counts,"conflicts":p.conflicts,"retained":p.retained])
        await store.preview(current:{selected},read:{_ in raw})
        var sent:[Data]=[],persisted=0
        await store.confirm(reviewed:true,exportsReviewed:false,reviewIdentity:p.reviewIdentity,persist:{_,_ in persisted+=1},current:{selected},post:{body in sent.append(body);return Data()})
        XCTAssertTrue(sent.isEmpty);XCTAssertEqual(persisted,0)
        await store.confirm(reviewed:true,exportsReviewed:true,reviewIdentity:p.reviewIdentity,persist:{_,_ in persisted+=1},current:{selected},post:{body in sent.append(body);throw NativeDataError.server(code:"UNAVAILABLE")})
        XCTAssertEqual(sent.count,1);XCTAssertEqual(persisted,1)
        await store.confirm(reviewed:true,exportsReviewed:true,reviewIdentity:p.reviewIdentity,persist:{_,_ in XCTFail("No second journal/new request")},current:{selected},post:{body in sent.append(body);return try self.receipt(JSONDecoder().decode(NativeLinkedTripDeleteRequest.self,from:body))})
        XCTAssertEqual(sent[0],sent[1]);XCTAssertEqual(store.receipt?.state,"queued")
    }
    @MainActor func testLatePreviewAndChangedSelectionCannotRestorePrivatePlan()async throws {
        let store=NativeLinkedTripDeletionStore(),selected=target;store.bind(selected);var current:NativeLinkedTripDeleteSelection?=selected
        await store.preview(current:{current},read:{_ in current=nil;store.bind(nil);return Data()})
        XCTAssertNil(store.plan);XCTAssertNil(store.requestID);XCTAssertNil(store.visiblePlan(selected))
    }
    @MainActor func testCombinedCapAndIdentityOrderingRejectOversizedOrDuplicateSets() {
        let duplicate=NativeLinkedTripDeleteSets(threadIds:[trip,trip],turnIds:[],taskIds:[],goalIds:[],messageIds:[],artifactIds:[],exportRequestIds:[]);XCTAssertFalse(duplicate.valid)
        let unsorted=NativeLinkedTripDeleteSets(threadIds:[exportID,trip],turnIds:[],taskIds:[],goalIds:[],messageIds:[],artifactIds:[],exportRequestIds:[]);XCTAssertFalse(unsorted.valid)
    }
    @MainActor func testNewPreviewRequiresNewExactAcknowledgement()async throws {
        let store=NativeLinkedTripDeletionStore(),selected=target,p=try plan()
        store.bind(selected)
        func raw(_ p:NativeLinkedTripDeletePlan)throws->Data{try bytes(["kind":p.kind,"planId":p.planId,"tripId":p.tripId,"title":p.title,"expectedVersion":p.expectedVersion,"scopeDigest":p.scopeDigest,"expiresAt":p.expiresAt,"selection":JSONSerialization.jsonObject(with:JSONEncoder().encode(p.selection)),"counts":p.counts,"conflicts":p.conflicts,"retained":p.retained])}
        await store.preview(current:{selected},read:{_ in try raw(p)})
        var modified=try XCTUnwrap(JSONSerialization.jsonObject(with:raw(p)) as? [String:Any]);modified["planId"]=trip;modified["scopeDigest"]=String(repeating:"b",count:64)
        await store.preview(current:{selected},read:{_ in try self.bytes(modified)})
        var sent=0
        await store.confirm(reviewed:true,exportsReviewed:true,reviewIdentity:p.reviewIdentity,persist:{_,_ in XCTFail()},current:{selected},post:{_ in sent+=1;return Data()})
        XCTAssertEqual(sent,0);XCTAssertNil(store.requestID)
    }
    @MainActor func testRestartPreservesFirstBodyBytesAndSecondTripCannotReplaceUnknownJournal()async throws {
        let selected=target,p=try plan(),request=NativeLinkedTripDeleteRequest(plan:p)
        let first=try JSONEncoder().encode(request),journal=NativeLinkedTripDeleteJournal(endpoint:selected.scope.endpoint,owner:selected.scope.subject,epoch:selected.scope.mobileEpoch,tripID:trip,body:first)
        let restored=try JSONDecoder().decode(NativeLinkedTripDeleteJournal.self,from:JSONEncoder().encode(journal)),store=NativeLinkedTripDeletionStore();store.bind(selected);try store.restore(restored,target:selected)
        var received:Data?
        await store.confirm(reviewed:true,exportsReviewed:true,reviewIdentity:nil,persist:{_,_ in XCTFail()},current:{selected},post:{body in received=body;throw NativeDataError.server(code:"UNAVAILABLE")})
        XCTAssertEqual(received,first)
        let foreign=NativeLinkedTripDeleteJournal(endpoint:journal.endpoint,owner:journal.owner,epoch:journal.epoch,tripID:exportID,body:first)
        XCTAssertThrowsError(try NativeLinkedTripDeleteJournal.validateReplacement(existing:journal,incoming:foreign))
        let different=NativeLinkedTripDeleteJournal(endpoint:journal.endpoint,owner:journal.owner,epoch:journal.epoch,tripID:trip,body:try JSONEncoder().encode(NativeLinkedTripDeleteRequest(plan:p)))
        XCTAssertThrowsError(try NativeLinkedTripDeleteJournal.validateReplacement(existing:journal,incoming:different))
        XCTAssertNoThrow(try NativeLinkedTripDeleteJournal.validateReplacement(existing:journal,incoming:restored))
    }

}
