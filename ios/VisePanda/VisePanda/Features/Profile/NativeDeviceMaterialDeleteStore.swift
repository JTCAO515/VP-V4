import CryptoKit
import Foundation
import Observation

struct NativeDeviceMaterialDeleteNamespace: Codable, Equatable {
    let endpoint:String
    let owner:String
    let epoch:Int
    init(_ actor:NativeDataScope) { endpoint=actor.endpoint;owner=actor.subject;epoch=actor.mobileEpoch }
    func matches(_ actor:NativeDataScope)->Bool { endpoint==actor.endpoint && owner==actor.subject && epoch==actor.mobileEpoch }
    var valid:Bool { !endpoint.isEmpty && endpoint.utf8.count<=2048 && NativeMemoryWire.uuid(owner) && (1...9_007_199_254_740_991).contains(epoch) }
}
struct NativeDeviceMaterialDeleteRequest: Codable, Equatable {
    static let maximumBytes=65_536
    let kind:String
    let requestId:String
    let namespace:NativeDeviceMaterialDeleteNamespace
    let scope:String
    let scopeDigest:String
    let files:[NativeScreenshotInbox.FileSelection]
    let requestedAt:Double
    init(actor:NativeDataScope,files:[NativeScreenshotInbox.FileSelection],now:Date=Date()) throws {
        kind="device_material_delete_request/1";requestId=UUID().uuidString.lowercased();namespace = .init(actor)
        scope="device-screenshot-inbox-selected/1";self.files=files.sorted{$0.digest<$1.digest};requestedAt=now.timeIntervalSince1970
        scopeDigest=try Self.digest(namespace:namespace,files:self.files)
        guard valid else{throw InboxError.invalidInput}
    }
    var valid:Bool {
        kind=="device_material_delete_request/1" && NativeMemoryWire.uuid(requestId) && namespace.valid && scope=="device-screenshot-inbox-selected/1" &&
        (1...100).contains(files.count) && files.allSatisfy(\.valid) && Set(files.map(\.digest)).count==files.count && files.map(\.digest)==files.map(\.digest).sorted() &&
        requestedAt.isFinite && requestedAt>0 && (try? Self.digest(namespace:namespace,files:files))==scopeDigest
    }
    static func digest(namespace:NativeDeviceMaterialDeleteNamespace,files:[NativeScreenshotInbox.FileSelection]) throws -> String {
        struct Selection:Encodable{let namespace:NativeDeviceMaterialDeleteNamespace;let files:[NativeScreenshotInbox.FileSelection]}
        let encoder=JSONEncoder();encoder.outputFormatting=[.sortedKeys]
        return SHA256.hash(data:try encoder.encode(Selection(namespace:namespace,files:files))).map{String(format:"%02x",$0)}.joined()
    }
    static func decode(_ bytes:Data) throws -> Self {
        guard bytes.count<=maximumBytes,let root=try JSONSerialization.jsonObject(with:bytes) as? [String:Any],Set(root.keys)==Set(["kind","requestId","namespace","scope","scopeDigest","files","requestedAt"]),
              let namespace=root["namespace"] as? [String:Any],Set(namespace.keys)==Set(["endpoint","owner","epoch"]),let files=root["files"] as? [[String:Any]],files.allSatisfy({Set($0.keys)==Set(["digest","fileIdentity","bytes"])}) else{throw InboxError.invalidInput}
        let value=try JSONDecoder().decode(Self.self,from:bytes);guard value.valid else{throw InboxError.invalidInput};return value
    }
}
struct NativeDeviceMaterialDeleteReceipt: Codable {
    let kind:String
    let requestId:String
    let namespace:NativeDeviceMaterialDeleteNamespace
    let scope:String
    let scopeDigest:String
    let selectedCount:Int
    let state:String
    let requestedAt:Double
    let completedAt:Double
    let allUserDataCompleted:Bool
    init(request:NativeDeviceMaterialDeleteRequest,now:Date=Date()) {
        kind="device_material_delete_receipt/1";requestId=request.requestId;namespace=request.namespace;scope=request.scope;scopeDigest=request.scopeDigest
        selectedCount=request.files.count;state="completed";requestedAt=request.requestedAt;completedAt=max(now.timeIntervalSince1970,request.requestedAt);allUserDataCompleted=false
    }
    func matches(_ request:NativeDeviceMaterialDeleteRequest)->Bool {
        kind=="device_material_delete_receipt/1" && requestId==request.requestId && namespace==request.namespace && scope==request.scope && scopeDigest==request.scopeDigest &&
        selectedCount==request.files.count && state=="completed" && requestedAt==request.requestedAt && completedAt.isFinite && completedAt>=requestedAt && !allUserDataCompleted
    }
    static func decode(_ bytes:Data,actor:NativeDataScope) throws -> Self {
        guard bytes.count<=8192,let root=try JSONSerialization.jsonObject(with:bytes) as? [String:Any],Set(root.keys)==Set(["kind","requestId","namespace","scope","scopeDigest","selectedCount","state","requestedAt","completedAt","allUserDataCompleted"]),let namespace=root["namespace"] as? [String:Any],Set(namespace.keys)==Set(["endpoint","owner","epoch"]) else{throw InboxError.invalidInput}
        let value=try JSONDecoder().decode(Self.self,from:bytes)
        guard value.kind=="device_material_delete_receipt/1",NativeMemoryWire.uuid(value.requestId),value.namespace.valid,value.namespace.matches(actor),value.scope=="device-screenshot-inbox-selected/1",NativeQualifiedDelegationRPC.digest(value.scopeDigest),(1...100).contains(value.selectedCount),value.state=="completed",value.requestedAt.isFinite,value.requestedAt>0,value.completedAt.isFinite,value.completedAt>=value.requestedAt,!value.allUserDataCompleted else{throw InboxError.invalidInput}
        return value
    }
}
@MainActor @Observable final class NativeDeviceMaterialDeleteStore {
    private(set) var actor:NativeDataScope?
    private(set) var available:[NativeScreenshotInbox.FileSelection]=[]
    private(set) var selected:Set<String>=[]
    private(set) var request:NativeDeviceMaterialDeleteRequest?
    private(set) var receipt:NativeDeviceMaterialDeleteReceipt?
    private(set) var busy=false
    private(set) var notice:String?
    var reviewedDigest:String? {
        guard let actor,!selected.isEmpty else{return nil}
        return try? NativeDeviceMaterialDeleteRequest.digest(namespace:.init(actor),files:available.filter{selected.contains($0.digest)}.sorted{$0.digest<$1.digest})
    }
    func bind(_ actor:NativeDataScope?) {
        guard self.actor != actor else{return}
        self.actor=actor;available=[];selected=[];request=nil;receipt=nil;busy=false;notice=nil
    }
    func refresh(using session:NativeSession) {
        bind(session.dataScope)
        guard actor != nil else{notice="unavailable";return}
        do {
            request=try session.pendingDeviceMaterialDeletion()
            receipt=try session.lastDeviceMaterialDeletionReceipt()
            if request==nil{available=try session.previewDeviceMaterialDeletion();selected=[]}
            else{available=[];selected=[];notice="pending"}
        }catch{available=[];selected=[];notice="unavailable"}
    }
    func select(_ digest:String,chosen:Bool) {
        guard !busy,request==nil,available.contains(where:{$0.digest==digest}) else{return}
        if chosen{selected.insert(digest)}else{selected.remove(digest)}
    }
    func confirm(reviewedDigest:String,using session:NativeSession) {
        guard !busy,request==nil,actor==session.dataScope,self.reviewedDigest==reviewedDigest,let actor else{return}
        busy=true;defer{busy=false}
        do {
            let request=try NativeDeviceMaterialDeleteRequest(actor:actor,files:available.filter{selected.contains($0.digest)})
            guard request.scopeDigest==reviewedDigest else{throw InboxError.invalidInput}
            try session.rememberDeviceMaterialDeletion(request)
            self.request=request
            execute(using:session)
        }catch{notice="pendingOrUnavailable";self.request=try? session.pendingDeviceMaterialDeletion()}
    }
    func resume(using session:NativeSession) {
        guard !busy,actor==session.dataScope,request != nil else{return}
        busy=true;defer{busy=false};execute(using:session)
    }
    private func execute(using session:NativeSession) {
        guard let request,actor==session.dataScope else{return}
        do {
            receipt=try session.executeDeviceMaterialDeletion(request)
            self.request=nil;available=[];selected=[];notice="completed"
        }catch{notice="pending"}
    }
}
