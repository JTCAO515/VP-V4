import XCTest
import UIKit
@testable import VisePanda

nonisolated final class NativeDeviceMaterialDeleteTests:XCTestCase {
    @MainActor private func session(defaults:UserDefaults,vault:DeleteTestVault,materials:NativeDeviceMaterials)->NativeSession {
        let configuration=URLSessionConfiguration.ephemeral;configuration.protocolClasses=[DeleteTestProtocol.self]
        return NativeSession(arguments:["-VisePandaNativeAPI","http://127.0.0.1:63221"],defaults:defaults,configuration:configuration,bundleConfiguration:[:],vault:vault,deviceMaterials:materials)
    }
    @MainActor private func image(_ black:Bool=false)->Data {
        UIGraphicsImageRenderer(size:CGSize(width:24,height:24)).image{context in
            (black ? UIColor.black:UIColor.white).setFill();context.fill(CGRect(x:0,y:0,width:24,height:24))
        }.pngData()!
    }
    @MainActor func testPersistBeforeDeleteCrashRestartSameRequestScopeAndCompletedReplay() async throws {
        let root=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString);defer{try? FileManager.default.removeItem(at:root)}
        let suite="vpj36.delete."+UUID().uuidString;let defaults=try XCTUnwrap(UserDefaults(suiteName:suite));defer{defaults.removePersistentDomain(forName:suite)}
        let inbox=NativeScreenshotInbox(root:root.appendingPathComponent("inbox"));let vault=DeleteTestVault()
        var crash=true;var observedPersist=false
        let materials=NativeDeviceMaterials(inbox:inbox,exportRoot:root.appendingPathComponent("exports"),deleteFile:{file,owner in
            observedPersist=vault.hasPending
            try inbox.deleteSelected(file,owner:owner)
            if crash{throw InboxError.invalidInput}
        })
        let first=session(defaults:defaults,vault:vault,materials:materials);await first.login(email:"synthetic",password:"synthetic")
        let actor=try XCTUnwrap(first.dataScope),white=image(),black=image(true)
        let whiteReceipt=try first.receiveDeviceScreenshot(white,owner:actor.subject)
        let folder=try XCTUnwrap(FileManager.default.contentsOfDirectory(at:root.appendingPathComponent("inbox"),includingPropertiesForKeys:nil).first)
        let whitePath=folder.appendingPathComponent(whiteReceipt.digest+".image")
        let blackReceipt=try inbox.receive(black,owner:actor.subject)
        try white.write(to:whitePath,options:[.atomic,.completeFileProtection]) // Synthetic second retained copy for subset isolation.
        let foreign=UUID().uuidString;let foreignReceipt=try inbox.receive(black,owner:foreign)
        let files=try first.previewDeviceMaterialDeletion()
        let chosen=try XCTUnwrap(files.first(where:{$0.digest==whiteReceipt.digest}))
        let request=try NativeDeviceMaterialDeleteRequest(actor:actor,files:[chosen])
        try first.rememberDeviceMaterialDeletion(request)
        XCTAssertThrowsError(try first.executeDeviceMaterialDeletion(request));XCTAssertTrue(observedPersist)
        XCTAssertEqual(try first.pendingDeviceMaterialDeletion(),request)
        XCTAssertNil(try first.lastDeviceMaterialDeletionReceipt())
        XCTAssertThrowsError(try first.receiveDeviceScreenshot(white,owner:actor.subject))
        let other=try NativeDeviceMaterialDeleteRequest(actor:actor,files:[try XCTUnwrap(files.first(where:{$0.digest==blackReceipt.digest}))])
        XCTAssertThrowsError(try first.rememberDeviceMaterialDeletion(other))
        crash=false
        let restartedMaterials=NativeDeviceMaterials(inbox:inbox,exportRoot:root.appendingPathComponent("exports"))
        let restarted=session(defaults:defaults,vault:vault,materials:restartedMaterials);await restarted.restore()
        let restored=try XCTUnwrap(restarted.pendingDeviceMaterialDeletion());XCTAssertEqual(restored,request)
        let receipt=try restarted.executeDeviceMaterialDeletion(restored);XCTAssertTrue(receipt.matches(request));XCTAssertFalse(receipt.allUserDataCompleted)
        XCTAssertNil(try restarted.pendingDeviceMaterialDeletion())
        XCTAssertEqual(try inbox.read(blackReceipt.digest,owner:actor.subject),black)
        XCTAssertEqual(try inbox.read(foreignReceipt.digest,owner:foreign),black)
        let newCopy=try restarted.receiveDeviceScreenshot(white,owner:actor.subject)
        _=try restarted.executeDeviceMaterialDeletion(request)
        XCTAssertEqual(try inbox.read(newCopy.digest,owner:actor.subject),white,"Completed replay must not delete newly imported same-digest bytes")
    }
    @MainActor func testChangedFileWrongOwnerAndJournalWriteFailureNeverDelete() async throws {
        let root=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString);defer{try? FileManager.default.removeItem(at:root)}
        let suite="vpj36.delete."+UUID().uuidString;let defaults=try XCTUnwrap(UserDefaults(suiteName:suite));defer{defaults.removePersistentDomain(forName:suite)}
        let inbox=NativeScreenshotInbox(root:root.appendingPathComponent("inbox")),vault=DeleteTestVault()
        let materials=NativeDeviceMaterials(inbox:inbox,exportRoot:root.appendingPathComponent("exports"))
        let first=session(defaults:defaults,vault:vault,materials:materials);await first.login(email:"synthetic",password:"synthetic")
        let actor=try XCTUnwrap(first.dataScope),data=image();let imported=try first.receiveDeviceScreenshot(data,owner:actor.subject)
        let file=try XCTUnwrap(first.previewDeviceMaterialDeletion().first)
        let foreignActor=NativeDataScope(endpoint:actor.endpoint,subject:UUID().uuidString.lowercased(),mobileEpoch:actor.mobileEpoch,generation:actor.generation)
        let wrong=try NativeDeviceMaterialDeleteRequest(actor:foreignActor,files:[file]);XCTAssertThrowsError(try first.rememberDeviceMaterialDeletion(wrong))
        vault.failPendingWrites=true
        let request=try NativeDeviceMaterialDeleteRequest(actor:actor,files:[file]);XCTAssertThrowsError(try first.rememberDeviceMaterialDeletion(request))
        XCTAssertEqual(try inbox.read(imported.digest,owner:actor.subject),data)
        vault.failPendingWrites=false
        let folder=try XCTUnwrap(FileManager.default.contentsOfDirectory(at:root.appendingPathComponent("inbox"),includingPropertiesForKeys:nil).first)
        try data.write(to:folder.appendingPathComponent(imported.digest+".image"),options:[.atomic,.completeFileProtection])
        XCTAssertThrowsError(try first.rememberDeviceMaterialDeletion(request),"Preview file identity changed; cannot adopt replacement")
        XCTAssertEqual(try inbox.read(imported.digest,owner:actor.subject),data)
    }
    @MainActor func testCleanupFailureAndReceiptPersistenceFailureRemainPending() async throws {
        let root=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString);defer{try? FileManager.default.removeItem(at:root)}
        let suite="vpj36.delete."+UUID().uuidString;let defaults=try XCTUnwrap(UserDefaults(suiteName:suite));defer{defaults.removePersistentDomain(forName:suite)}
        let inbox=NativeScreenshotInbox(root:root.appendingPathComponent("inbox")),vault=DeleteTestVault();var fail=true
        let materials=NativeDeviceMaterials(inbox:inbox,exportRoot:root.appendingPathComponent("exports"),deleteFile:{file,owner in
            if fail{throw InboxError.invalidInput};try inbox.deleteSelected(file,owner:owner)
        })
        let first=session(defaults:defaults,vault:vault,materials:materials);await first.login(email:"synthetic",password:"synthetic")
        let actor=try XCTUnwrap(first.dataScope),data=image();let imported=try first.receiveDeviceScreenshot(data,owner:actor.subject)
        let request=try NativeDeviceMaterialDeleteRequest(actor:actor,files:first.previewDeviceMaterialDeletion())
        try first.rememberDeviceMaterialDeletion(request);XCTAssertThrowsError(try first.executeDeviceMaterialDeletion(request))
        XCTAssertEqual(try inbox.read(imported.digest,owner:actor.subject),data);XCTAssertNil(try first.lastDeviceMaterialDeletionReceipt())
        fail=false;vault.failReceiptWrites=true;XCTAssertThrowsError(try first.executeDeviceMaterialDeletion(request))
        XCTAssertEqual(try first.pendingDeviceMaterialDeletion(),request);XCTAssertNil(try first.lastDeviceMaterialDeletionReceipt())
        vault.failReceiptWrites=false
        XCTAssertTrue(try first.executeDeviceMaterialDeletion(request).matches(request))
        XCTAssertNil(try first.pendingDeviceMaterialDeletion())
    }
}
@MainActor private final class DeleteTestVault:NativeCredentialVault {
    private var records:[String:Data]=[:]
    var failPendingWrites=false,failReceiptWrites=false
    var hasPending:Bool{records.keys.contains{$0.contains("device-delete-request")}}
    func write(_ data:Data,service:String,owner:String)->OSStatus{
        if failPendingWrites && service.contains("device-delete-request") || failReceiptWrites && service.contains("device-delete-receipt"){return errSecInteractionNotAllowed}
        records[service+owner]=data;return errSecSuccess
    }
    func read(service:String,owner:String)->(OSStatus,Data?){let data=records[service+owner];return(data==nil ? errSecItemNotFound:errSecSuccess,data)}
    func remove(service:String,owner:String)->OSStatus{records.removeValue(forKey:service+owner);return errSecSuccess}
}
nonisolated private final class DeleteTestProtocol:URLProtocol,@unchecked Sendable {
    override class func canInit(with request:URLRequest)->Bool{true}
    override class func canonicalRequest(for request:URLRequest)->URLRequest{request}
    override func stopLoading(){}
    override func startLoading(){
        let owner="11111111-2222-3333-4444-555555555555",action=request.url?.lastPathComponent
        let body:[String:Any]
        if action=="credentials" || action=="refresh"{body=["subject":owner,"accessToken":"fixture-access","refreshToken":"fixture-refresh","expiresAt":Date().timeIntervalSince1970+3600,"mobileEpoch":1]}
        else if action=="profile"{body=["subject":owner,"displayName":"Fixture"]}
        else{body=["subject":owner,"mobileEpoch":1]}
        guard let url=request.url,let response=HTTPURLResponse(url:url,statusCode:200,httpVersion:"HTTP/1.1",headerFields:["Content-Type":"application/json"]),let data=try? JSONSerialization.data(withJSONObject:body) else{return}
        client?.urlProtocol(self,didReceive:response,cacheStoragePolicy:.notAllowed);client?.urlProtocol(self,didLoad:data);client?.urlProtocolDidFinishLoading(self)
    }
}
