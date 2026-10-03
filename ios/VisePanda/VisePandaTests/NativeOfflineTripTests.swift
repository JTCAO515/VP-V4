import XCTest
import CryptoKit
import Security
@testable import VisePanda

@MainActor private final class OfflineTestVault:NativeCredentialVault {
    var values:[String:Data]=[:]
    var denyDelete=false
    func write(_ data:Data,service:String,owner:String)->OSStatus{values[service+owner]=data;return errSecSuccess}
    func read(service:String,owner:String)->(OSStatus,Data?){values[service+owner].map{(errSecSuccess,$0)} ?? (errSecItemNotFound,nil)}
    func remove(service:String,owner:String)->OSStatus{if denyDelete{return errSecInteractionNotAllowed};values.removeValue(forKey:service+owner);return errSecSuccess}
}
nonisolated final class NativeOfflineTripTests:XCTestCase {
    @MainActor private var scope:NativeDataScope{.init(endpoint:"http://127.0.0.1:63251",subject:"12345678-1234-4234-8234-123456789abc",mobileEpoch:1,generation:1)}
    private let trip="22345678-1234-4234-8234-123456789abc"
    private let nonce="32345678-1234-4234-8234-123456789abc"
    @MainActor private func fixture()throws->(Data,NativeOfflinePermitVerifier,NativeOfflineTripNamespace,Date) {
        let namespace=try NativeOfflineTripNamespace(scope:scope,tripID:trip),signer=Curve25519.Signing.PrivateKey()
        let now=try XCTUnwrap(NativeKnowledgeRead.date("2026-10-03T00:00:00.000Z")),keyID=NativeOfflinePermitVerifier.keyID(signer.publicKey.rawRepresentation)
        let payload:[String:Any]=["days":[["id":"Day_A","date":"2026-10-04","items":[["id":"Item_1","title":"仅用户受控文字 / 🌿"]]]]]
        var root:[String:Any]=["kind":"offline_trip_read/1","subject":scope.subject,"sessionEpoch":1,"tripId":trip,"headVersion":2,"policyId":"test-policy","policyRevision":1,"issuedAt":"2026-10-02T23:59:00.000Z","expiresAt":"2026-10-03T00:02:00.000Z","serverTime":"2026-10-03T00:00:00.000Z","requestNonce":nonce,"coverage":"partial","sourceSemantics":"controlled_user_text_submission","generation":0,"fieldAllowlist":["days.date","days.items.title"],"snapshotDigest":NativeOfflineTripNamespace.digest(try NativeOfflineCanonicalJSON.data(payload)),"payload":payload]
        let signature=try signer.signature(for:NativeOfflineCanonicalJSON.data(root)).base64EncodedString().replacingOccurrences(of:"+",with:"-").replacingOccurrences(of:"/",with:"_").replacingOccurrences(of:"=",with:"")
        root["proof"]=["algorithm":"Ed25519","keyId":keyID,"signature":signature]
        return (try JSONSerialization.data(withJSONObject:root),.init(trustedKeys:[keyID:signer.publicKey.rawRepresentation]),namespace,now)
    }
    @MainActor func testTrustedSignatureOpaqueIDsAndNonceRejectDigestAsGrant()throws {
        let (wire,verifier,namespace,_)=try fixture()
        let permit=try verifier.verify(wire,namespace:namespace,headVersion:2,nonce:nonce)
        XCTAssertEqual(permit.payload.days.first?.id,"Day_A");XCTAssertEqual(permit.payload.days.first?.items.first?.id,"Item_1");XCTAssertEqual(permit.coverage,"partial")
        XCTAssertThrowsError(try NativeOfflinePermitVerifier().verify(wire,namespace:namespace,headVersion:2,nonce:nonce))
        XCTAssertThrowsError(try verifier.verify(wire,namespace:namespace,headVersion:2,nonce:trip))
        var changed=try XCTUnwrap(JSONSerialization.jsonObject(with:wire) as? [String:Any]);changed["coverage"]="full"
        XCTAssertThrowsError(try verifier.verify(JSONSerialization.data(withJSONObject:changed),namespace:namespace,headVersion:2,nonce:nonce))
        changed=try XCTUnwrap(JSONSerialization.jsonObject(with:wire) as? [String:Any]);changed.removeValue(forKey:"generation")
        XCTAssertThrowsError(try verifier.verify(JSONSerialization.data(withJSONObject:changed),namespace:namespace,headVersion:2,nonce:nonce))
    }
    @MainActor func testNetworkTimeExpiryWallRollbackAndRebootCannotRenewLease()throws {
        let (wire,verifier,namespace,now)=try fixture(),permit=try verifier.verify(wire,namespace:namespace,headVersion:2,nonce:nonce)
        let cached=try NativeOfflineCachedText(permit:permit,requestStarted:10,now:now.addingTimeInterval(20),uptime:30,bootIdentity:"boot-A")
        XCTAssertEqual(cached.deadlineUptime,130)
        XCTAssertNoThrow(try cached.currentPayload(verifier:verifier,scope:scope,now:now.addingTimeInterval(21),uptime:31,bootIdentity:"boot-A"))
        XCTAssertThrowsError(try cached.currentPayload(verifier:verifier,scope:scope,now:now.addingTimeInterval(119),uptime:130,bootIdentity:"boot-A"))
        XCTAssertThrowsError(try cached.currentPayload(verifier:verifier,scope:scope,now:now.addingTimeInterval(19),uptime:31,bootIdentity:"boot-A"))
        XCTAssertThrowsError(try cached.currentPayload(verifier:verifier,scope:scope,now:now.addingTimeInterval(21),uptime:31,bootIdentity:"boot-B"))
        XCTAssertThrowsError(try NativeOfflineCachedText(permit:permit,requestStarted:0,now:now.addingTimeInterval(119),uptime:121,bootIdentity:"boot-A"))
    }
    @MainActor func testEncryptedDraftIsTripBoundAndFailedPurgeBlocksReads()throws {
        let root=FileManager.default.temporaryDirectory.appendingPathComponent("offline-test-"+UUID().uuidString),vault=OfflineTestVault(),defaults=try XCTUnwrap(UserDefaults(suiteName:"offline-test-"+UUID().uuidString))
        defer{try? FileManager.default.removeItem(at:root)}
        let store=NativeOfflineTripStore(root:root,vault:vault,defaults:defaults),namespace=try NativeOfflineTripNamespace(scope:scope,tripID:trip)
        let draft=try NativeOfflineTripDraft(namespace:namespace,baseVersion:2,operations:[.init(kind:.setTitle,title:"PRIVATE USER EDIT")])
        try store.saveUserDraft(draft,scope:scope);XCTAssertEqual(try store.readUserDraft(namespace,scope:scope),draft)
        let folder=root.appendingPathComponent(namespace.accountKey),file=folder.appendingPathComponent(namespace.tripKey+".draft.aesgcm")
        XCTAssertFalse(String(data:try Data(contentsOf:file),encoding:.utf8)?.contains("PRIVATE USER EDIT") ?? false)
        let other=try NativeOfflineTripNamespace(scope:scope,tripID:nonce)
        try FileManager.default.copyItem(at:file,to:folder.appendingPathComponent(other.tripKey+".draft.aesgcm"))
        XCTAssertThrowsError(try store.readUserDraft(other,scope:scope))
        vault.denyDelete=true;XCTAssertThrowsError(try store.eraseAll());XCTAssertThrowsError(try store.readUserDraft(namespace,scope:scope))
        vault.denyDelete=false;try store.eraseAll();XCTAssertFalse(FileManager.default.fileExists(atPath:root.path));XCTAssertTrue(vault.values.isEmpty)
    }
    @MainActor func testOrdinaryDraftRecoveryNeedsExactVersionAndDoesNotCreateOfflineSource()throws {
        let namespace=try NativeOfflineTripNamespace(scope:scope,tripID:trip)
        let local=try NativeOfflineTripDraft(namespace:namespace,baseVersion:2,operations:[.init(kind:.setTitle,title:"User change")])
        let detail=NativeTripDetail(version:2,trip:.init(id:trip,title:"Original",headVersion:2,updatedAt:"2026-10-03T00:00:00Z"),content:.init(days:[]),hardLocks:.notEnabled,externalOrderStatus:.notConnected,confirmationState:"confirmed")
        let result=try NativeOfflineDraftRecovery.restore(local,scope:scope,detail:detail);XCTAssertEqual(result.patch.expectedVersion,2);XCTAssertEqual(result.title,"User change")
        let stale=NativeTripDetail(version:2,trip:.init(id:trip,title:"Newer",headVersion:3,updatedAt:"2026-10-03T00:00:00Z"),content:.init(days:[]),hardLocks:.notEnabled,externalOrderStatus:.notConnected,confirmationState:"confirmed")
        XCTAssertThrowsError(try NativeOfflineDraftRecovery.restore(local,scope:scope,detail:stale))
        let command=try NativeOfflineTextSubmission(headVersion:2,date:"2026-10-04",title:" New entry ")
        let body=try XCTUnwrap(JSONSerialization.jsonObject(with:JSONEncoder().encode(command)) as? [String:Any]);XCTAssertEqual(Set(body.keys),Set(["operationId","expectedHeadVersion","date","title","saveOffline"]));XCTAssertNil(body["author"]);XCTAssertNil(body["patch"])
    }
}
