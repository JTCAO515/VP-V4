import XCTest
@testable import VisePanda

nonisolated final class NativeMemoryDeletionTests:XCTestCase {
    private let owner="11111111-2222-3333-4444-555555555555",memory="22222222-2222-3333-4444-555555555555",source="33333333-2222-3333-4444-555555555555",planID="44444444-2222-3333-4444-555555555555"
    private let digest=String(repeating:"a",count:64)
    @MainActor private var row:NativeMemoryProfile{.init(id:memory,revision:1,state:"explicit",constraintKind:"preference",summary:"Synthetic private preference",sourceReceiptId:source,consentId:planID,consentStatus:"granted",createdAt:"2026-10-03T00:00:00Z",updatedAt:"2026-10-03T00:00:00Z")}
    @MainActor private func bytes(_ object:Any)throws->Data{try JSONSerialization.data(withJSONObject:object)}
    @MainActor private var selection:[String:Any]{["memories":[["memoryId":memory,"revision":1,"sourceReceiptId":source]],"consumerReferenceIds":[source],"artifactIds":[source],"generatedTurnIds":[source],"exportRequestIds":[source]]}
    @MainActor private func plan(id:String?=nil)throws->Data {
        let f=ISO8601DateFormatter();f.formatOptions=[.withInternetDateTime,.withFractionalSeconds]
        return try bytes(["kind":"memory_delete_plan/1","planId":id ?? planID,"sourceRevision":4,"scopeDigest":digest,"expiresAt":f.string(from:Date().addingTimeInterval(240)),"selection":selection,"counts":["memories":1,"consumerReferences":1,"artifacts":1,"generatedTurns":1,"exports":1],"conflicts":[],"retained":NativeMemoryDeletePlan.retained])
    }
    @MainActor private var profiles:Data {
        try! bytes(["version":1,"ownerId":owner,"profiles":[["id":memory,"revision":1,"state":"explicit","constraintKind":"preference","summary":"Synthetic private preference","sourceReceiptId":source,"consentId":planID,"consentStatus":"granted","createdAt":"2026-10-03T00:00:00Z","updatedAt":"2026-10-03T00:00:00Z"]]])
    }
    @MainActor private func receipt(_ command:NativeMemoryDeleteCommand,completed:Bool=false)throws->Data {
        try bytes(["kind":"memory_delete_receipt/1","requestId":command.requestId,"planId":command.planId,"scope":"memory-bulk-delete-d4/1","scopeDigest":command.scopeDigest,"state":completed ? "completed":"queued","sourceTombstoned":true,"cleanupPending":!completed,"requestedAt":"2026-10-03T00:00:00.000Z","completedAt":completed ? "2026-10-03T00:01:00.000Z":NSNull(),"selection":selection,"deletedRevisions":[["memoryId":memory,"revision":2]],"erasedCounts":completed ? ["consumerReferences":1,"artifacts":1,"generatedOutputs":1,"exports":1,"tickets":0]:NSNull(),"allUserDataCompleted":false,"retained":NativeMemoryDeletePlan.retained])
    }
    @MainActor func testPreviewReviewIdentityAndExactReceiptNegativeBoundaries()async throws {
        let actor=NativeDataScope(endpoint:"http://127.0.0.1:63221",subject:owner,mobileEpoch:1,generation:0),store=NativeMemoryDeletionStore()
        store.bind(actor);await store.load(current:{actor},get:{self.profiles});store.select(memory,chosen:true,current:actor)
        await store.preview(current:{actor},post:{_ in try self.plan()})
        let old=try XCTUnwrap(store.plan?.reviewIdentity)
        await store.preview(current:{actor},post:{_ in try self.plan(id:self.source)})
        var sent=0
        await store.confirm(reviewedIdentity:old,exportsReviewed:true,current:{actor},persist:{_,_ in XCTFail("Old plan cannot persist")},post:{_ in sent+=1;throw InboxError.invalidInput})
        XCTAssertEqual(sent,0)
        let plan=try NativeMemoryDeletePlan.decode(self.plan(),selected:[row]),command=NativeMemoryDeleteCommand(plan)
        let queued=try NativeMemoryDeleteReceipt.decode(receipt(command),command:command);XCTAssertEqual(queued.state,"queued");XCTAssertTrue(queued.cleanupPending)
        var bad=try XCTUnwrap(JSONSerialization.jsonObject(with:receipt(command,completed:true)) as? [String:Any]);bad["erasedCounts"]=["consumerReferences":0,"artifacts":1,"generatedOutputs":1,"exports":1,"tickets":0]
        XCTAssertThrowsError(try NativeMemoryDeleteReceipt.decode(bytes(bad),command:command))
        bad=try XCTUnwrap(JSONSerialization.jsonObject(with:receipt(command)) as? [String:Any]);bad["sourceTombstoned"]=false
        XCTAssertThrowsError(try NativeMemoryDeleteReceipt.decode(bytes(bad),command:command))
    }
    @MainActor func testUnknownACKRestoreRetriesOriginalBytesAndLateActorSuppressed()async throws {
        let actor=NativeDataScope(endpoint:"http://127.0.0.1:63221",subject:owner,mobileEpoch:1,generation:0),store=NativeMemoryDeletionStore()
        store.bind(actor);await store.load(current:{actor},get:{self.profiles});store.select(memory,chosen:true,current:actor)
        await store.preview(current:{actor},post:{_ in try self.plan()})
        let review=try XCTUnwrap(store.plan?.reviewIdentity);var persisted:Data?
        await store.confirm(reviewedIdentity:review,exportsReviewed:true,current:{actor},persist:{_,body in persisted=body},post:{body in XCTAssertEqual(body,persisted);throw URLError(.networkConnectionLost)})
        let body=try XCTUnwrap(persisted);let journal=NativeMemoryDeleteJournal(endpoint:actor.endpoint,owner:owner,epoch:1,body:body)
        let restored=NativeMemoryDeletionStore();restored.bind(actor);try restored.restore(journal,current:actor)
        await restored.retry(current:{actor},post:{body in XCTAssertEqual(body,persisted);return try self.receipt(journal.command())})
        XCTAssertEqual(restored.receipt?.state,"queued");XCTAssertTrue(restored.profiles.isEmpty)
        var current:NativeDataScope?=actor
        await restored.read(current:{current},get:{_ in current=nil;return try self.receipt(journal.command(),completed:true)})
        XCTAssertEqual(restored.receipt?.state,"queued","Late actor cannot publish completed")
    }
    @MainActor func testRealSessionJournalQueuedReadCompletedAndDifferentScopeDenied()async throws {
        let suite="vpj36.memory-delete."+UUID().uuidString,defaults=try XCTUnwrap(UserDefaults(suiteName:suite));defer{defaults.removePersistentDomain(forName:suite)}
        let vault=MemoryDeleteFixtureVault();let configuration=URLSessionConfiguration.ephemeral;configuration.protocolClasses=[MemoryDeleteFixtureProtocol.self]
        let root=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString);defer{try? FileManager.default.removeItem(at:root)}
        let materials=NativeDeviceMaterials(inbox:NativeScreenshotInbox(root:root.appendingPathComponent("inbox")),exportRoot:root.appendingPathComponent("exports"))
        let session=NativeSession(arguments:["-VisePandaNativeAPI","http://127.0.0.1:63221"],defaults:defaults,configuration:configuration,bundleConfiguration:[:],vault:vault,deviceMaterials:materials)
        await session.login(email:"synthetic",password:"synthetic")
        let actor=try XCTUnwrap(session.dataScope),command=NativeMemoryDeleteCommand(try NativeMemoryDeletePlan.decode(plan(),selected:[row])),body=try JSONEncoder().encode(command)
        try session.rememberMemoryDeletion(command,body:body)
        let other=NativeMemoryDeleteCommand(try NativeMemoryDeletePlan.decode(plan(id:source),selected:[row]))
        XCTAssertThrowsError(try session.rememberMemoryDeletion(other,body:JSONEncoder().encode(other)))
        MemoryDeleteFixtureProtocol.configureMemory(post:try receipt(command),get:try receipt(command,completed:true))
        let queued=try NativeMemoryDeleteReceipt.decode(await session.memoryDeletionRequest(body:body),command:command)
        XCTAssertEqual(MemoryDeleteFixtureProtocol.lastPost,body)
        MemoryDeleteFixtureProtocol.requireReauth(true)
        do{_=try await session.memoryDeletionRequest(body:body);XCTFail("Requires fresh sign-in")}
        catch NativeDataError.server(let code){XCTAssertEqual(code,"REAUTHENTICATION_REQUIRED")}
        XCTAssertEqual(session.dataScope,actor,"Fresh auth rejection does not fabricate replacement/logout")
        MemoryDeleteFixtureProtocol.requireReauth(false)
        XCTAssertThrowsError(try session.completeMemoryDeletion(queued));XCTAssertEqual(try session.memoryDeletionRecovery()?.body,body)
        let restartConfig=URLSessionConfiguration.ephemeral;restartConfig.protocolClasses=[MemoryDeleteFixtureProtocol.self]
        let restored=NativeSession(arguments:["-VisePandaNativeAPI","http://127.0.0.1:63221"],defaults:defaults,configuration:restartConfig,bundleConfiguration:[:],vault:vault,deviceMaterials:materials)
        await restored.restore();XCTAssertNotNil(restored.dataScope)
        let recovered=try XCTUnwrap(restored.memoryDeletionRecovery());XCTAssertTrue(recovered.matches(try XCTUnwrap(restored.dataScope)));XCTAssertEqual(recovered.body,body)
        let completed=try NativeMemoryDeleteReceipt.decode(await restored.memoryDeletionRequest(requestID:command.requestId),command:command)
        XCTAssertEqual(MemoryDeleteFixtureProtocol.lastReadID,command.requestId)
        try restored.completeMemoryDeletion(completed)
        XCTAssertNil(try restored.memoryDeletionRecovery());XCTAssertTrue(recovered.matches(actor))
    }
}
@MainActor private final class MemoryDeleteFixtureVault:NativeCredentialVault {
    private var records:[String:Data]=[:]
    func write(_ data:Data,service:String,owner:String)->OSStatus{records[service+owner]=data;return errSecSuccess}
    func read(service:String,owner:String)->(OSStatus,Data?){let data=records[service+owner];return(data==nil ? errSecItemNotFound:errSecSuccess,data)}
    func remove(service:String,owner:String)->OSStatus{records.removeValue(forKey:service+owner);return errSecSuccess}
}
nonisolated private final class MemoryDeleteFixtureProtocol:URLProtocol,@unchecked Sendable {
    private static let lock=NSLock()
    nonisolated(unsafe) private static var post:Data?,get:Data?,sent:Data?,readID:String?,reauth=false
    static var lastPost:Data?{lock.withLock{sent}}
    static var lastReadID:String?{lock.withLock{readID}}
    static func configureMemory(post:Data,get:Data){lock.withLock{Self.post=post;Self.get=get;sent=nil;readID=nil;reauth=false}}
    static func requireReauth(_ value:Bool){lock.withLock{reauth=value}}

    override class func canInit(with request:URLRequest)->Bool{true}
    override class func canonicalRequest(for request:URLRequest)->URLRequest{request}
    override func stopLoading(){}
    override func startLoading(){
        let owner="11111111-2222-3333-4444-555555555555",action=request.url?.lastPathComponent
        if request.url?.path=="/api/privacy/native/v1/memories/delete" {
            let reply:(Int,Data)=Self.lock.withLock {
                if request.httpMethod=="POST" {
                    if let body=request.httpBody{Self.sent=body}else if let stream=request.httpBodyStream{
                        stream.open();defer{stream.close()};var bytes=Data();var buffer=[UInt8](repeating:0,count:4096)
                        while stream.hasBytesAvailable{let n=stream.read(&buffer,maxLength:buffer.count);if n<=0{break};bytes.append(contentsOf:buffer.prefix(n))};Self.sent=bytes
                    }
                    if Self.reauth{return(401,Data(#"{"error":{"code":"REAUTHENTICATION_REQUIRED"}}"#.utf8))}
                    return(202,Self.post ?? Data())
                }
                Self.readID=URLComponents(url:request.url!,resolvingAgainstBaseURL:false)?.queryItems?.first?.value
                return(200,Self.get ?? Data())
            }
            respond(reply.0,reply.1);return
        }
        let body:[String:Any]
        if action=="credentials" || action=="refresh"{body=["subject":owner,"accessToken":"fixture-access","refreshToken":"fixture-refresh","expiresAt":Date().timeIntervalSince1970+3600,"mobileEpoch":1]}
        else if action=="profile"{body=["subject":owner,"displayName":"Fixture"]}
        else{body=["subject":owner,"mobileEpoch":1]}
        guard let data=try? JSONSerialization.data(withJSONObject:body) else{return};respond(200,data)
    }
    private func respond(_ status:Int,_ data:Data){
        guard let url=request.url,let response=HTTPURLResponse(url:url,statusCode:status,httpVersion:"HTTP/1.1",headerFields:["Content-Type":"application/json"]) else{return}
        client?.urlProtocol(self,didReceive:response,cacheStoragePolicy:.notAllowed);client?.urlProtocol(self,didLoad:data);client?.urlProtocolDidFinishLoading(self)
    }
}
