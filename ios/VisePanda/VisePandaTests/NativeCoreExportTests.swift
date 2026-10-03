import XCTest
import CryptoKit
@testable import VisePanda

nonisolated final class NativeCoreExportTests:XCTestCase {
    private let id="12345678-1234-4234-8234-123456789abc"
    private let op="22345678-1234-4234-8234-123456789abc"
    @MainActor private var scope:NativeDataScope{.init(endpoint:"http://127.0.0.1:63251",subject:"32345678-1234-4234-8234-123456789abc",mobileEpoch:1,generation:1)}
    @MainActor private func bytes(_ value:[String:Any])throws->Data{try JSONSerialization.data(withJSONObject:value)}
    @MainActor private func utc(_ date:Date)->String{let f=ISO8601DateFormatter();f.formatOptions=[.withInternetDateTime,.withFractionalSeconds];return f.string(from:date)}
    @MainActor private func modules()->[[String:Any]]{NativeCoreExportReceipt.modules.map{["module":$0,"status":"unavailable","reason":"HANDLER_MISSING","pages":0,"rows":0,"digest":NSNull()]}}
    @MainActor private func bundle(request:String)throws->Data{try bytes(["schemaVersion":"privacy-core-export/1","requestId":request,"generatedAt":utc(Date()),"coverage":"partial","allUserDataCompleted":false,"modules":modules(),"data":[:],"notices":["downloadedFilesRecallable":false,"providerCopies":"not_exported","financialRetention":"unchanged"]])}
    @MainActor private func ready(request:String,body:Data)throws->Data{try bytes(["kind":"privacy_export_job/1","requestId":request,"scope":"core-export-d2/1","state":"ready_partial","generation":1,"createdAt":utc(Date()),"completedAt":utc(Date()),"artifactDigest":SHA256.hash(data:body).map{String(format:"%02x",$0)}.joined(),"artifactBytes":body.count,"artifactExpiresAt":utc(Date().addingTimeInterval(120)),"modules":modules(),"allUserDataCompleted":false])}
    @MainActor private func ticket(_ receipt:NativeCoreExportReceipt)throws->Data{try bytes(["kind":"privacy_export_ticket/1","requestId":receipt.requestId,"operationId":op,"generation":receipt.generation,"artifactDigest":receipt.artifactDigest!,"expiresAt":utc(Date().addingTimeInterval(60)),"token":Data(repeating:7,count:32).base64EncodedString().replacingOccurrences(of:"+",with:"-").replacingOccurrences(of:"/",with:"_").replacingOccurrences(of:"=",with:"")])}
    @MainActor func testQueuedAndFailedCannotBecomeExportSuccessOrAllDataCompletion()throws {
        var value:[String:Any]=["kind":"privacy_export_job/1","requestId":id,"scope":"core-export-d2/1","state":"queued","generation":1,"createdAt":utc(Date()),"completedAt":NSNull(),"artifactDigest":NSNull(),"artifactBytes":NSNull(),"artifactExpiresAt":NSNull(),"modules":[],"allUserDataCompleted":false]
        XCTAssertFalse(try NativeCoreExportReceipt.decode(bytes(value),requestID:id).ready)
        value["state"]="failed";value["completedAt"]=utc(Date());XCTAssertFalse(try NativeCoreExportReceipt.decode(bytes(value),requestID:id).ready)
        value["allUserDataCompleted"]=true;XCTAssertThrowsError(try NativeCoreExportReceipt.decode(bytes(value),requestID:id))
        value["allUserDataCompleted"]=false;value["artifactBytes"]=1;XCTAssertThrowsError(try NativeCoreExportReceipt.decode(bytes(value),requestID:id))
    }
    @MainActor func testTicketAndRawDownloadAreExactBoundedAndRejectTamperedBytesHeaders()throws {
        let body=try bundle(request:id),receipt=try NativeCoreExportReceipt.decode(ready(request:id,body:body),requestID:id),ticket=try NativeCoreExportTicket.decode(self.ticket(receipt),receipt:receipt)
        let valid=NativeCoreExportDownload(bytes:body,status:200,contentType:"application/json; charset=utf-8",disposition:"attachment; filename=\"visepanda-export-"+id+".json\"",cacheControl:"private, no-store")
        XCTAssertNoThrow(try valid.validate(ticket:ticket,receipt:receipt))
        XCTAssertThrowsError(try NativeCoreExportDownload(bytes:body+Data([32]),status:200,contentType:valid.contentType,disposition:valid.disposition,cacheControl:valid.cacheControl).validate(ticket:ticket,receipt:receipt))
        XCTAssertThrowsError(try NativeCoreExportDownload(bytes:body,status:206,contentType:valid.contentType,disposition:valid.disposition,cacheControl:valid.cacheControl).validate(ticket:ticket,receipt:receipt))
        XCTAssertThrowsError(try NativeCoreExportDownload(bytes:body,status:200,contentType:valid.contentType,disposition:"attachment; filename=other.json",cacheControl:valid.cacheControl).validate(ticket:ticket,receipt:receipt))
        var wrong=try XCTUnwrap(JSONSerialization.jsonObject(with:self.ticket(receipt)) as? [String:Any]);wrong["generation"]=2;XCTAssertThrowsError(try NativeCoreExportTicket.decode(bytes(wrong),receipt:receipt))
    }
    @MainActor func testUnknownDownloadDoesNotReplayOrIssueAnotherTicket()async throws {
        let store=NativeCoreExportStore(),selected=scope;store.bind(selected)
        await store.request(confirmed:true,current:{selected},post:{raw in let request=try XCTUnwrap((try JSONSerialization.jsonObject(with:raw) as? [String:Any])?["requestId"] as? String);return try self.ready(request:request,body:self.bundle(request:request))})
        let receipt=try XCTUnwrap(store.receipt);var issued=0,downloaded=0
        await store.getTicket(current:{selected},post:{_ in issued+=1;return try self.ticket(receipt)})
        await store.download(current:{selected},get:{_,operation,_ in downloaded+=1;XCTAssertEqual(operation,self.op);throw NativeDataError.server(code:"UNAVAILABLE")})
        await store.download(current:{selected},get:{_,_,_ in downloaded+=1;throw NativeDataError.invalidResponse})
        XCTAssertEqual(issued,1);XCTAssertEqual(downloaded,1);XCTAssertFalse(store.hasTicket(selected));XCTAssertNil(store.fileURL);XCTAssertEqual(store.notice,"unconfirmed")
    }
    @MainActor func testLateActorResponseClearsPrivateReceiptAndFiles()async throws {
        let store=NativeCoreExportStore(),selected=scope;store.bind(selected);var current:NativeDataScope?=selected
        await store.request(confirmed:true,current:{current},post:{raw in
            let request=try XCTUnwrap((try JSONSerialization.jsonObject(with:raw) as? [String:Any])?["requestId"] as? String)
            current=nil;store.bind(nil);return try self.ready(request:request,body:self.bundle(request:request))
        })
        XCTAssertNil(store.receipt);XCTAssertNil(store.requestID);XCTAssertNil(store.fileURL)
    }
    @MainActor func testVerifiedFileExpiresAndActorSwitchRemovesTemporaryBytes()async throws {
        let root=FileManager.default.temporaryDirectory.appendingPathComponent("export-test-"+UUID().uuidString);defer{try? FileManager.default.removeItem(at:root)}
        let store=NativeCoreExportStore(root:root),selected=scope;store.bind(selected)
        await store.request(confirmed:true,current:{selected},post:{raw in let request=try XCTUnwrap((try JSONSerialization.jsonObject(with:raw) as? [String:Any])?["requestId"] as? String);return try self.ready(request:request,body:self.bundle(request:request))})
        let receipt=try XCTUnwrap(store.receipt),body=try bundle(request:receipt.requestId)
        // Preserve exact bytes from one generated bundle, never reserialize for its digest.
        await store.refresh(current:{selected},get:{_ in try self.ready(request:receipt.requestId,body:body)})
        let actual=try XCTUnwrap(store.receipt)
        await store.getTicket(current:{selected},post:{_ in try self.ticket(actual)})
        await store.download(current:{selected},get:{request,_,_ in .init(bytes:body,status:200,contentType:"application/json; charset=utf-8",disposition:"attachment; filename=\"visepanda-export-"+request+".json\"",cacheControl:"private, no-store")})
        let file=try XCTUnwrap(store.selectedFile(selected));XCTAssertTrue(FileManager.default.fileExists(atPath:file.path))
        XCTAssertNil(store.selectedFile(selected,now:Date().addingTimeInterval(121)));XCTAssertFalse(FileManager.default.fileExists(atPath:file.path))
        store.bind(nil);XCTAssertNil(store.requestID);XCTAssertNil(store.receipt);XCTAssertNil(store.fileURL)
    }

}
