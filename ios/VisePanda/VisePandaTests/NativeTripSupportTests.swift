import XCTest
@testable import VisePanda

nonisolated final class NativeTripSupportTests: XCTestCase {
    private let actor=NativeDataScope(endpoint:"http://127.0.0.1:63221",subject:"11111111-2222-3333-4444-555555555555",mobileEpoch:1,generation:0)
    private let trip="22222222-2222-3333-4444-555555555555"
    private let proposalID="33333333-2222-3333-4444-555555555555"
    private let receiptID="44444444-2222-3333-4444-555555555555"
    private let digest=String(repeating:"a",count:64)
    @MainActor private var target:NativeTripSupportTarget { .init(actor:actor,tripID:trip,tripVersion:3,dayID:"Day_1",itemID:"Item_A") }
    @MainActor private var proposal:NativeTripPending.Proposal {
        .init(id:proposalID,revision:2,baseTripVersion:3,status:"pending",createdAt:"2026-10-03T00:00:00Z",expiresAt:"2099-01-01T00:00:00Z",titleDiff:.init(before:"Trip",after:"Trip"),dayDiffs:[],patch:.init(expectedVersion:3,operations:[]),digest:digest,stale:false,evidence:"",assumptions:"")
    }
    @MainActor private func bytes(_ object:Any) throws -> Data { try JSONSerialization.data(withJSONObject:object,options:[.sortedKeys]) }
    private var claim:[String:Any] {
        ["claimType":"address","subjectId":"canonical-selected-place","value":["lines":["Synthetic reviewed address"],"countryCode":"CN"],"asOf":"2026-10-03T00:00:00Z","evidence":[["kind":"fact","factId":trip,"version":1,"reviewedAt":"2026-10-03T00:00:00Z","expiresAt":"2099-01-01T00:00:00Z"]]]
    }
    @MainActor private func prepared(item:String="Item_A",id:String?=nil)->[String:Any] {
        ["kind":"prepared","receiptId":id ?? receiptID,"version":1,"tripId":trip,"proposalId":proposalID,"proposalRevision":2,"baseVersion":3,"dayId":"Day_1","itemId":item,"scope":"address_reference","applicability":"unverified","claim":claim,"sourceDigest":digest,"expiresAt":"2099-01-01T00:00:00Z"]
    }
    @MainActor func testReadRejectsWrongExactSelectionAndWithdrawnValues() throws {
        let entry:[String:Any]=["supportId":proposalID,"receiptId":receiptID,"placeReferenceId":trip,"version":1,"scope":"address_reference","applicability":"unverified","status":"reference_current","claimRevision":1,"payloadHash":digest,"sourceDigest":digest,"sourceRefs":[],"claim":claim]
        var read:[String:Any]=["kind":"support","tripId":trip,"tripVersion":3,"dayId":"Day_1","itemId":"Item_A","entries":[entry]]
        XCTAssertEqual(try NativeTripSupportRead.decode(bytes(read),target:target).entries.count,1)
        read["itemId"]="item_a"
        XCTAssertThrowsError(try NativeTripSupportRead.decode(bytes(read),target:target))
        read["itemId"]="Item_A"
        var revoked=entry;revoked["status"]="revoked";read["entries"]=[revoked]
        XCTAssertThrowsError(try NativeTripSupportRead.decode(bytes(read),target:target))
        revoked["claim"]=NSNull();read["entries"]=[revoked]
        XCTAssertNil(try NativeTripSupportRead.decode(bytes(read),target:target).entries.first?.claim)
    }
    @MainActor func testExplicitSelectionAcrossItemsReviewIdentityAndUnknownFence() throws {
        let store=NativeTripSupportStore()
        store.bind(target,proposal:proposal)
        try store.installPrepared([bytes(prepared())],target:target,proposal:proposal)
        XCTAssertThrowsError(try store.freezeConfirmation(reviewedSelection:"not-reviewed",proposal:proposal,current:actor))
        store.select(receiptID,chosen:true)
        let oldReview=try XCTUnwrap(store.selectionReference)
        let other=NativeTripSupportTarget(actor:actor,tripID:trip,tripVersion:3,dayID:"Day_1",itemID:"Item_B")
        let otherID="55555555-2222-3333-4444-555555555555"
        store.bind(other,proposal:proposal)
        try store.installPrepared([bytes(prepared(item:"Item_B",id:otherID))],target:other,proposal:proposal)
        store.select(otherID,chosen:true)
        XCTAssertEqual(store.selectedIDs.count,2)
        XCTAssertThrowsError(try store.freezeConfirmation(reviewedSelection:oldReview,proposal:proposal,current:actor))
        let choices=try store.freezeConfirmation(reviewedSelection:XCTUnwrap(store.selectionReference),proposal:proposal,current:actor)
        XCTAssertEqual(choices.count,2)
        XCTAssertTrue(store.confirmationUnknown)
        store.select(receiptID,chosen:false)
        XCTAssertEqual(store.selectedIDs.count,2)
        XCTAssertThrowsError(try store.freezeConfirmation(reviewedSelection:XCTUnwrap(store.selectionReference),proposal:proposal,current:actor))
        XCTAssertThrowsError(try store.confirmed(key:"wrong",choices:choices))
        try store.confirmed(key:XCTUnwrap(store.confirmationKey),choices:choices)
        XCTAssertFalse(store.confirmationUnknown)
    }
    @MainActor func testConfirmationJournalPreservesBytesAndExactBindingReceipt() throws {
        let request=NativeSupportedTripConfirmRequest(proposalId:proposalID,idempotencyKey:"66666666-2222-3333-4444-555555555555",digest:digest,expectedProposalRevision:2,expectedBaseVersion:3,supportSelection:[.init(receiptId:receiptID,version:1,sourceDigest:digest)])
        let original=try JSONEncoder().encode(request)
        let journal=NativeTripSupportConfirmJournal(endpoint:actor.endpoint,owner:actor.subject,epoch:1,tripID:trip,body:original)
        let restored=try JSONDecoder().decode(NativeTripSupportConfirmJournal.self,from:JSONEncoder().encode(journal))
        XCTAssertEqual(restored.body,original)
        XCTAssertEqual(try restored.request(),request)
        XCTAssertTrue(restored.matches(actor))
        XCTAssertFalse(restored.matches(.init(endpoint:actor.endpoint,subject:actor.subject,mobileEpoch:2,generation:0)))
        var receipt:[String:Any]=["kind":"confirmed","outcome":"applied","tripId":trip,"proposalId":proposalID,"resultingVersion":4,"selectionDigest":digest,"supports":[["supportId":proposalID,"receiptId":receiptID,"version":1,"status":"recheck_required"]]]
        XCTAssertEqual(try NativeSupportedTripConfirmReceipt.decode(bytes(receipt),tripID:trip,request:request).supports.first?.status,.recheck)
        receipt["resultingVersion"]=5
        XCTAssertThrowsError(try NativeSupportedTripConfirmReceipt.decode(bytes(receipt),tripID:trip,request:request))
        receipt["resultingVersion"]=4
        receipt["supports"]=[["supportId":proposalID,"receiptId":trip,"version":1,"status":"reference_current"]]
        XCTAssertThrowsError(try NativeSupportedTripConfirmReceipt.decode(bytes(receipt),tripID:trip,request:request))
        var raw=try XCTUnwrap(JSONSerialization.jsonObject(with:original) as? [String:Any]);raw["ownerId"]=actor.subject
        let altered=NativeTripSupportConfirmJournal(endpoint:actor.endpoint,owner:actor.subject,epoch:1,tripID:trip,body:try bytes(raw))
        XCTAssertThrowsError(try altered.request())
    }

    @MainActor func testNativeContextPrepareExplicitConfirmLostACKRestartReadAndRenew() async throws {
        let suite="vpj65.native-support."+UUID().uuidString
        let defaults=try XCTUnwrap(UserDefaults(suiteName:suite))
        defer{defaults.removePersistentDomain(forName:suite)}
        let vault=SupportFlowVault()
        let configuration=URLSessionConfiguration.ephemeral;configuration.protocolClasses=[SupportFlowProtocol.self]
        let root=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer{try? FileManager.default.removeItem(at:root)}
        let materials=NativeDeviceMaterials(inbox:NativeScreenshotInbox(root:root.appendingPathComponent("inbox")),exportRoot:root.appendingPathComponent("export"))
        let summary:[String:Any]=["id":trip,"title":"Original confirmed Trip","headVersion":3,"updatedAt":"2026-10-03T00:00:00Z"]
        let proposalRow:[String:Any]=["id":proposalID,"revision":2,"baseTripVersion":3,"status":"pending","createdAt":"2026-10-03T00:00:00Z","expiresAt":"2099-01-01T00:00:00Z","titleDiff":["before":"Trip","after":"Trip"],"dayDiffs":[],"patch":["expectedVersion":3,"operations":[]],"digest":digest,"stale":false,"evidence":"not_evaluated","assumptions":"not_evaluated"]
        let supportEntry:[String:Any]=["supportId":proposalID,"receiptId":receiptID,"placeReferenceId":trip,"version":1,"scope":"address_reference","applicability":"unverified","status":"recheck_required","claimRevision":1,"payloadHash":digest,"sourceDigest":digest,"sourceRefs":[],"claim":NSNull()]
        let candidate:[String:Any]=["mappingId":proposalID,"mappingVersion":1,"mappingDigest":digest,"statementId":trip,"claimRevision":1,"payloadHash":digest,"sourceDigest":digest,"scope":"address_reference","claim":claim]
        let context:[String:Any]=["kind":"support_context","tripId":trip,"tripVersion":3,"proposalId":proposalID,"proposalRevision":2,"baseVersion":3,"proposalDigest":digest,"itemDigest":String(repeating:"d",count:64),"dayId":"Day_1","itemId":"Item_A","canonicalPlaceReferences":[["referenceId":trip,"canonicalPoiId":trip,"display":["en":"Owned canonical place","zh":"已拥有的标准地点"]]]]
        let prepared=prepared()
        let confirmation:[String:Any]=["kind":"confirmed","outcome":"applied","tripId":trip,"proposalId":proposalID,"resultingVersion":4,"selectionDigest":digest,"supports":[["supportId":proposalID,"receiptId":receiptID,"version":1,"status":"recheck_required"]]]
        SupportFlowProtocol.configure(owner:actor.subject,trip:trip,documents:[
            "trip":try bytes(["version":2,"trip":summary,"content":["days":[]],"hardLocks":"not_enabled","externalOrderStatus":"not_connected","confirmationState":"confirmed"]),
            "proposal":try bytes(["version":2,"trip":summary,"proposal":proposalRow]),"context":try bytes(context),"prepare":try bytes(prepared),
            "candidates":try bytes(["kind":"candidates","tripId":trip,"tripVersion":3,"placeReferenceId":trip,"contextDigest":digest,"entries":[candidate],"nextCursor":NSNull()]),
            "confirmation":try bytes(confirmation),"support":try bytes(["kind":"support","tripId":trip,"tripVersion":4,"dayId":"Day_1","itemId":"Item_A","entries":[supportEntry]])])
        let session=NativeSession(arguments:["-VisePandaNativeAPI","http://127.0.0.1:63221"],defaults:defaults,configuration:configuration,bundleConfiguration:[:],vault:vault,deviceMaterials:materials)
        await session.login(email:"synthetic",password:"synthetic")
        let scope=try XCTUnwrap(session.dataScope)
        let target=NativeTripSupportTarget(actor:scope,tripID:trip,tripVersion:3,dayID:"Day_1",itemID:"Item_A")
        let tripStore=NativeTripStore();tripStore.reset(for:scope);await tripStore.select(trip,using:session)
        let pending=try XCTUnwrap(tripStore.pending)
        let actualContext=try NativeTripSupportContext.decode(await session.tripSupportContext(target:target,proposal:pending.proposal),target:target,proposal:pending.proposal)
        let ownedReference=try XCTUnwrap(actualContext.canonicalPlaceReferences.first)
        let candidates=try NativeTripSupportCandidates.decode(await session.tripSupportCandidates(target:target,placeReferenceID:ownedReference.referenceId,city:"shanghai",scene:"attraction",locale:"en"),target:target,placeReferenceID:ownedReference.referenceId)
        let chosen=try XCTUnwrap(candidates.entries.first)
        let prepareRequest=NativeTripSupportPrepareRequest(operationId:UUID().uuidString.lowercased(),placeReferenceId:ownedReference.referenceId,dayId:target.dayID,itemId:target.itemID,proposalId:pending.proposal.id,expectedProposalRevision:pending.proposal.revision,expectedBaseVersion:target.tripVersion,expectedProposalDigest:actualContext.proposalDigest,expectedItemDigest:actualContext.itemDigest,mappingId:chosen.mappingId,expectedMappingVersion:chosen.mappingVersion,expectedMappingDigest:chosen.mappingDigest,city:"shanghai",scene:"attraction",locale:"en",scope:chosen.scope,expectedClaimRevision:chosen.claimRevision,expectedPayloadHash:chosen.payloadHash,expectedSourceDigest:chosen.sourceDigest)
        let support=NativeTripSupportStore();support.bind(target,proposal:pending.proposal)
        try support.addPrepared(await session.tripSupportPrepare(prepareRequest,target:target,proposal:pending.proposal),target:target,proposal:pending.proposal)
        XCTAssertTrue(support.selectedIDs.isEmpty,"Preparation cannot select receipts automatically")
        support.select(receiptID,chosen:true)
        let reviewed=try XCTUnwrap(tripStore.confirmationReference)
        let selected=try XCTUnwrap(support.selectionReference)
        await tripStore.confirmSupported(reviewedReference:reviewed,reviewedSelection:selected,support:support,using:session)
        XCTAssertTrue(support.confirmationUnknown)
        XCTAssertEqual(SupportFlowProtocol.confirmPosts,1)
        let original=try XCTUnwrap(session.tripSupportConfirmationRecovery())
        support.bind(nil) // A recreated/background-cleared view cannot bypass the durable unresolved operation.
        await tripStore.confirm(reviewedReference:reviewed,using:session)
        XCTAssertEqual(SupportFlowProtocol.ordinaryPosts,0)
        XCTAssertEqual(tripStore.notice,"SUPPORT_CONFIRM_RECOVERY_REQUIRED")
        let restartConfiguration=URLSessionConfiguration.ephemeral;restartConfiguration.protocolClasses=[SupportFlowProtocol.self]
        let restarted=NativeSession(arguments:["-VisePandaNativeAPI","http://127.0.0.1:63221"],defaults:defaults,configuration:restartConfiguration,bundleConfiguration:[:],vault:vault,deviceMaterials:materials)
        await restarted.restore()
        let restoredActor=try XCTUnwrap(restarted.dataScope)
        let journal=try XCTUnwrap(restarted.tripSupportConfirmationRecovery())
        XCTAssertEqual(journal.body,original.body)
        let historical=try NativeTripSupportHistoricalReceipt.decode(await restarted.tripSupportConfirmationRead(journal,actor:restoredActor),journal:journal)
        XCTAssertEqual(SupportFlowProtocol.confirmPosts,1,"Read-only lost ACK recovery must not confirm again")
        XCTAssertEqual(SupportFlowProtocol.lastReadBody,journal.body)
        try restarted.completeTripSupportConfirmation(journal,receipt:historical,actor:restoredActor)
        XCTAssertNil(try restarted.tripSupportConfirmationRecovery())
        let current=NativeTripSupportTarget(actor:restoredActor,tripID:trip,tripVersion:4,dayID:"Day_1",itemID:"Item_A")
        let live=try NativeTripSupportRead.decode(await restarted.tripSupportRead(current),target:current)
        let entry=try XCTUnwrap(live.entries.first)
        XCTAssertEqual(entry.status,.recheck);XCTAssertNil(entry.claim)
        let replacements=try NativeTripSupportCandidates.decode(await restarted.tripSupportCandidates(target:current,placeReferenceID:entry.placeReferenceId,city:"shanghai",scene:"attraction",locale:"en"),target:current,placeReferenceID:entry.placeReferenceId)
        let replacement=try XCTUnwrap(replacements.entries.first)
        let renewal=NativeTripSupportRenewRequest(operationId:UUID().uuidString.lowercased(),supportId:entry.supportId,expectedVersion:entry.version,tripVersion:4,dayId:current.dayID,itemId:current.itemID,mappingId:replacement.mappingId,expectedMappingVersion:replacement.mappingVersion,expectedMappingDigest:replacement.mappingDigest,expectedClaimRevision:replacement.claimRevision,expectedPayloadHash:replacement.payloadHash,expectedSourceDigest:replacement.sourceDigest)
        let renewed=try NativeTripSupportRenewReceipt.decode(await restarted.tripSupportRenew(renewal,target:current),request:renewal)
        XCTAssertEqual(renewed.version,2)
        XCTAssertEqual(SupportFlowProtocol.confirmPosts,1)
        XCTAssertFalse(SupportFlowProtocol.badHeaders)
    }

    @MainActor func testLateActorReadNeverPublishesAndPreparedRejectsScopeExpiryOrExtraKeys() async throws {
        let store=NativeTripSupportStore();store.bind(target,proposal:proposal)
        var current:NativeDataScope?=actor
        let original=target
        await store.refresh(current:{current},get:{_ in
            current=nil
            return try self.bytes(["kind":"support","tripId":self.trip,"tripVersion":3,"dayId":"Day_1","itemId":"Item_A","entries":[]])
        })
        XCTAssertNil(store.read)
        var value=prepared();value["expiresAt"]="2000-01-01T00:00:00Z"
        XCTAssertThrowsError(try NativePreparedTripSupport.decode(bytes(value),target:original,proposal:proposal))
        value=prepared();value["scope"]="whole_itinerary_verified"
        XCTAssertThrowsError(try NativePreparedTripSupport.decode(bytes(value),target:original,proposal:proposal))
        value=prepared();value["titleVerified"]=true
        XCTAssertThrowsError(try NativePreparedTripSupport.decode(bytes(value),target:original,proposal:proposal))
    }
}

@MainActor private final class SupportFlowVault:NativeCredentialVault {
    private var records:[String:Data]=[:]
    func write(_ data:Data,service:String,owner:String)->OSStatus{records[service+owner]=data;return errSecSuccess}
    func read(service:String,owner:String)->(OSStatus,Data?){let data=records[service+owner];return(data==nil ? errSecItemNotFound:errSecSuccess,data)}
    func remove(service:String,owner:String)->OSStatus{records.removeValue(forKey:service+owner);return errSecSuccess}
}
nonisolated private final class SupportFlowProtocol:URLProtocol,@unchecked Sendable {
    private static let lock=NSLock()
    nonisolated(unsafe) private static var documents:[String:Data]=[:]
    nonisolated(unsafe) private static var owner="",trip="",posts=0,ordinary=0,bad=false,readBody:Data?
    static var confirmPosts:Int{lock.withLock{posts}}
    static var ordinaryPosts:Int{lock.withLock{ordinary}}
    static var badHeaders:Bool{lock.withLock{bad}}
    static var lastReadBody:Data?{lock.withLock{readBody}}
    static func configure(owner:String,trip:String,documents:[String:Data]){lock.withLock{Self.owner=owner;Self.trip=trip;Self.documents=documents;posts=0;ordinary=0;bad=false;readBody=nil}}
    override class func canInit(with request:URLRequest)->Bool{true}
    override class func canonicalRequest(for request:URLRequest)->URLRequest{request}
    override func stopLoading(){}
    override func startLoading(){
        let path=request.url?.path ?? ""
        let body=bodyData()
        let result:(Int,Data)=Self.lock.withLock{
            if request.value(forHTTPHeaderField:"Cookie") != nil || request.value(forHTTPHeaderField:"Origin") != nil{Self.bad=true}
            if path.hasSuffix("/credentials") || path.hasSuffix("/refresh"){return(200,json(["subject":Self.owner,"accessToken":"fixture-access","refreshToken":"fixture-refresh","expiresAt":Date().timeIntervalSince1970+3600,"mobileEpoch":1]))}
            if path.hasSuffix("/login"){return(200,json(["subject":Self.owner,"mobileEpoch":1]))}
            if path.hasSuffix("/profile"){return(200,json(["subject":Self.owner,"displayName":"Fixture"]))}
            if path.hasSuffix("/support/confirmation-receipt"){
                Self.readBody=body
                let receipt=(try? JSONSerialization.jsonObject(with:Self.documents["confirmation"]!)) ?? [:]
                return(200,json(["kind":"confirmation_receipt","receipt":receipt,"historicalOnly":true,"currentEligibilityRequiresRead":true]))
            }
            if path.hasSuffix("/support/confirm"){Self.posts+=1;return(503,json(["error":["code":"SYNTHETIC_ACK_LOSS"]]))}
            if path.hasSuffix("/confirm"){Self.ordinary+=1;return(503,json(["error":["code":"UNEXPECTED_ORDINARY_CONFIRM"]]))}
            if path.hasSuffix("/support/renew"){return(200,json(["kind":"renewed","supportId":"33333333-2222-3333-4444-555555555555","version":2,"receiptId":"88888888-2222-3333-4444-555555555555"]))}
            if path.hasSuffix("/support/context"){return(200,Self.documents["context"]!)}
            if path.hasSuffix("/support/candidates"){
                var candidate=(try? JSONSerialization.jsonObject(with:Self.documents["candidates"]!)) as? [String:Any] ?? [:]
                if Self.posts>0{candidate["tripVersion"]=4}
                return(200,json(candidate))
            }
            if path.hasSuffix("/support/prepare"){return(200,Self.documents["prepare"]!)}
            if path.hasSuffix("/support"){return(200,Self.documents["support"]!)}
            if path.hasSuffix("/archive"){return(200,json(["version":1,"archive":NSNull()]))}
            if path.hasSuffix("/proposal"){return(200,Self.documents["proposal"]!)}
            if path.hasSuffix("/"+Self.trip){return(200,Self.documents["trip"]!)}
            return(404,json(["error":["code":"NOT_FOUND"]]))
        }
        guard let url=request.url,let response=HTTPURLResponse(url:url,statusCode:result.0,httpVersion:"HTTP/1.1",headerFields:["Content-Type":"application/json"]) else{return}
        client?.urlProtocol(self,didReceive:response,cacheStoragePolicy:.notAllowed);client?.urlProtocol(self,didLoad:result.1);client?.urlProtocolDidFinishLoading(self)
    }
    private func json(_ value:Any)->Data{(try? JSONSerialization.data(withJSONObject:value)) ?? Data()}
    private func bodyData()->Data?{
        if let body=request.httpBody{return body}
        guard let stream=request.httpBodyStream else{return nil}
        stream.open();defer{stream.close()};var data=Data();var buffer=[UInt8](repeating:0,count:4096)
        while stream.hasBytesAvailable{let count=stream.read(&buffer,maxLength:buffer.count);if count<=0{break};data.append(contentsOf:buffer.prefix(count))}
        return data
    }
}
