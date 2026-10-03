import CryptoKit
import Darwin
import Foundation
import Observation

struct NativeCoreExportReceipt:Decodable {
    struct Module:Decodable,Equatable {
        let module:String;let status:String;let reason:String;let pages:Int;let rows:Int;let digest:String?
    }
    static let modules=["trip","conversations","results","profile","memory","turn","user_artifact","brief","entitlements"]
    let kind:String;let requestId:String;let scope:String;let state:String;let generation:Int;let createdAt:String
    let completedAt:String?;let artifactDigest:String?;let artifactBytes:Int?;let artifactExpiresAt:String?;let modules:[Module];let allUserDataCompleted:Bool
    var ready:Bool{["ready_partial","ready_complete"].contains(state)}
    static func decode(_ bytes:Data,requestID:String)throws->Self {
        guard bytes.count<=64_000,let root=try JSONSerialization.jsonObject(with:bytes) as? [String:Any],Set(root.keys)==Set(["kind","requestId","scope","state","generation","createdAt","completedAt","artifactDigest","artifactBytes","artifactExpiresAt","modules","allUserDataCompleted"]),let rawModules=root["modules"] as? [[String:Any]],rawModules.allSatisfy({Set($0.keys)==Set(["module","status","reason","pages","rows","digest"])}) else{throw NativeDataError.invalidResponse}
        let value=try JSONDecoder().decode(Self.self,from:bytes)
        guard value.kind=="privacy_export_job/1",value.requestId==requestID,NativeMemoryWire.uuid(requestID),value.scope=="core-export-d2/1",!value.allUserDataCompleted,(1...9_007_199_254_740_991).contains(value.generation),utc(value.createdAt) != nil,["queued","running","ready_partial","ready_complete","failed","expired"].contains(value.state) else{throw NativeDataError.invalidResponse}
        if value.ready {
            guard value.completedAt.flatMap(utc) != nil,value.artifactDigest.map(digest)==true,value.artifactExpiresAt.flatMap(utc) != nil,value.artifactBytes.map{(1...8_388_608).contains($0)}==true,value.modules.count==Self.modules.count else{throw NativeDataError.invalidResponse}
        }else if value.state=="expired" {
            guard value.completedAt==nil || value.completedAt.flatMap(utc) != nil,value.artifactDigest==nil || value.artifactDigest.map(digest)==true,value.artifactExpiresAt==nil || value.artifactExpiresAt.flatMap(utc) != nil,value.artifactBytes==nil || value.artifactBytes.map{(1...8_388_608).contains($0)}==true,[0,Self.modules.count].contains(value.modules.count) else{throw NativeDataError.invalidResponse}
        }else {
            guard value.state=="failed" ? value.completedAt.flatMap(utc) != nil:value.completedAt==nil,value.artifactDigest==nil,value.artifactBytes==nil,value.artifactExpiresAt==nil,value.modules.isEmpty else{throw NativeDataError.invalidResponse}
        }
        for (index,module) in value.modules.enumerated() {
            guard module.module==Self.modules[index],["complete","partial","unavailable","failed"].contains(module.status),["NONE","HANDLER_MISSING","BOUNDED_LIMIT","LIVE_TRAVERSAL","SOURCE_UNAVAILABLE"].contains(module.reason),(0...1000).contains(module.pages),(0...100000).contains(module.rows),module.rows<=module.pages*100,module.digest==nil || module.digest.map(digest)==true else{throw NativeDataError.invalidResponse}
            if value.ready {
                guard module.status != "complete" || module.pages>=1,module.status != "failed" || module.pages==0 && module.rows==0,module.reason != "SOURCE_UNAVAILABLE" || (module.status=="partial" ? module.pages>0:module.status=="failed" && module.pages==0 && module.rows==0) else{throw NativeDataError.invalidResponse}
                guard module.status=="complete" ? module.reason=="NONE" && module.digest != nil:module.reason != "NONE" else{throw NativeDataError.invalidResponse}
                if module.status=="unavailable" {guard module.reason=="HANDLER_MISSING",module.pages==0,module.rows==0,module.digest==nil else{throw NativeDataError.invalidResponse}}
            }
        }
        if value.ready {guard value.modules.allSatisfy{$0.status=="complete"} == (value.state=="ready_complete") else{throw NativeDataError.invalidResponse}}
        return value
    }
    static func digest(_ s:String)->Bool{s.range(of:"^[0-9a-f]{64}$",options:.regularExpression) != nil}
    static func utc(_ s:String)->Date?{guard s.range(of:#"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$"#,options:.regularExpression) != nil else{return nil};return NativeKnowledgeRead.date(s)}
}
struct NativeCoreExportTicket:Decodable {
    let kind:String;let requestId:String;let operationId:String;let generation:Int;let artifactDigest:String;let expiresAt:String;let token:String
    static func decode(_ bytes:Data,receipt:NativeCoreExportReceipt,now:Date=Date())throws->Self {
        guard bytes.count<=4096,let root=try JSONSerialization.jsonObject(with:bytes) as? [String:Any],Set(root.keys)==Set(["kind","requestId","operationId","generation","artifactDigest","expiresAt","token"]) else{throw NativeDataError.invalidResponse}
        let value=try JSONDecoder().decode(Self.self,from:bytes)
        guard value.kind=="privacy_export_ticket/1",receipt.ready,value.requestId==receipt.requestId,NativeMemoryWire.uuid(value.operationId),value.generation==receipt.generation,value.artifactDigest==receipt.artifactDigest,
              let expiry=NativeCoreExportReceipt.utc(value.expiresAt),let artifact=receipt.artifactExpiresAt.flatMap(NativeCoreExportReceipt.utc),now<expiry,expiry<=artifact,value.token.range(of:"^[A-Za-z0-9_-]{43}$",options:.regularExpression) != nil else{throw NativeDataError.invalidResponse}
        let base=value.token.replacingOccurrences(of:"-",with:"+").replacingOccurrences(of:"_",with:"/")
        guard let token=Data(base64Encoded:base+"="),token.count==32,token.base64EncodedString().replacingOccurrences(of:"+",with:"-").replacingOccurrences(of:"/",with:"_").replacingOccurrences(of:"=",with:"")==value.token else{throw NativeDataError.invalidResponse}
        return value
    }
}
struct NativeCoreExportDownload {
    let bytes:Data
    let status:Int
    let contentType:String?
    let disposition:String?
    let cacheControl:String?
    func validate(ticket:NativeCoreExportTicket,receipt:NativeCoreExportReceipt)throws {
        guard status==200,receipt.requestId==ticket.requestId,receipt.generation==ticket.generation,receipt.artifactDigest==ticket.artifactDigest,bytes.count==receipt.artifactBytes,bytes.count<=8_388_608,
              contentType?.lowercased().replacingOccurrences(of:" ",with:"")=="application/json;charset=utf-8",disposition=="attachment; filename=\"visepanda-export-"+ticket.requestId+".json\"",cacheControl?.lowercased().contains("private")==true,cacheControl?.lowercased().contains("no-store")==true,
              SHA256.hash(data:bytes).map{String(format:"%02x",$0)}.joined()==ticket.artifactDigest else{throw NativeDataError.invalidResponse}
        guard let root=try JSONSerialization.jsonObject(with:bytes) as? [String:Any],Set(root.keys)==Set(["schemaVersion","requestId","generatedAt","coverage","allUserDataCompleted","modules","data","notices"]),root["schemaVersion"] as? String=="privacy-core-export/1",root["requestId"] as? String==ticket.requestId,root["allUserDataCompleted"] as? Bool==false,root["coverage"] as? String==(receipt.state=="ready_complete" ? "complete":"partial"),let generated=root["generatedAt"] as? String,NativeCoreExportReceipt.utc(generated) != nil,let modules=root["modules"] as? [[String:Any]],let data=root["data"] as? [String:Any],Set(data.keys).isSubset(of:Set(NativeCoreExportReceipt.modules)),let notices=root["notices"] as? [String:Any],Set(notices.keys)==Set(["downloadedFilesRecallable","providerCopies","financialRetention"]),notices["downloadedFilesRecallable"] as? Bool==false,notices["providerCopies"] as? String=="not_exported",notices["financialRetention"] as? String=="unchanged" else{throw NativeDataError.invalidResponse}
        let echoed=try JSONDecoder().decode([NativeCoreExportReceipt.Module].self,from:JSONSerialization.data(withJSONObject:modules))
        guard echoed==receipt.modules else{throw NativeDataError.invalidResponse}
    }
}
@MainActor @Observable final class NativeCoreExportStore {
    private(set) var scope:NativeDataScope?
    private(set) var requestID:String?
    private(set) var receipt:NativeCoreExportReceipt?
    private var ticket:NativeCoreExportTicket?
    private(set) var fileURL:URL?
    private var fileDeadline:Date?
    private var generation=UUID()
    private(set) var busy=false
    private(set) var notice:String?
    private let root:URL
    private let removeOwnedItem:(URL)throws->Void
    private let beforeMarkerWrite:((URL)throws->Void)?
    private(set) var storageReady=false
    init(root:URL?=nil,removeOwnedItem:((URL)throws->Void)?=nil,beforeMarkerWrite:((URL)throws->Void)?=nil){
        self.root=(root ?? FileManager.default.temporaryDirectory.appendingPathComponent("NativeCoreExport",isDirectory:true)).standardizedFileURL
        self.removeOwnedItem=removeOwnedItem ?? {try FileManager.default.removeItem(at:$0)}
        self.beforeMarkerWrite=beforeMarkerWrite
        // This feature declares no persisted owner/resume mapping: every prior UUID entry is abandoned.
        do{try purgeOwnedFolders();storageReady=true}catch{notice="unconfirmed"}
    }
    private func checkedRoot()throws {
        guard root.isFileURL else{throw NativeDataError.invalidResponse}
        var info=stat()
        if lstat(root.path,&info)==0 {
            guard info.st_mode & S_IFMT == S_IFDIR else{throw NativeDataError.invalidResponse}
        }else if errno==ENOENT {
            try FileManager.default.createDirectory(at:root,withIntermediateDirectories:true,attributes:[.protectionKey:FileProtectionType.complete,.posixPermissions:0o700])
            guard lstat(root.path,&info)==0,info.st_mode & S_IFMT == S_IFDIR else{throw NativeDataError.invalidResponse}
        }else{throw NativeDataError.invalidResponse}
    }
    private func purgeOwnedFolders()throws {
        try checkedRoot()
        let folders=try FileManager.default.contentsOfDirectory(at:root,includingPropertiesForKeys:nil)
        for folder in folders where UUID(uuidString:folder.lastPathComponent) != nil {
            guard folder.standardizedFileURL.deletingLastPathComponent().path==root.path else{throw NativeDataError.invalidResponse}
            // removeItem unlinks a symlink itself; never resolve its target or read an expiry marker.
            try removeOwnedItem(folder)
        }
        guard !(try FileManager.default.contentsOfDirectory(at:root,includingPropertiesForKeys:nil)).contains(where:{UUID(uuidString:$0.lastPathComponent) != nil}) else{throw NativeDataError.invalidResponse}
    }
    private func removePendingFolder(_ folder:URL)throws {
        try checkedRoot()
        guard folder.standardizedFileURL.deletingLastPathComponent().path==root.path,UUID(uuidString:folder.lastPathComponent) != nil else{throw NativeDataError.invalidResponse}
        var info=stat()
        if lstat(folder.path,&info)==0{try removeOwnedItem(folder)}else if errno != ENOENT{throw NativeDataError.invalidResponse}
    }
    func bind(_ next:NativeDataScope?){if next != scope{clear();scope=next}}
    func clear(){generation=UUID();requestID=nil;receipt=nil;ticket=nil;notice=nil;busy=false;removeFile()}
    private func removeFile(){
        fileURL=nil;fileDeadline=nil;storageReady=false
        do{try purgeOwnedFolders();storageReady=true}catch{notice="unconfirmed"}
    }
    func selectedFile(_ current:NativeDataScope?,now:Date=Date())->URL?{guard storageReady else{return nil};guard current != nil,current==scope,let fileDeadline,now<fileDeadline else{removeFile();return nil};return fileURL}
    func hasTicket(_ current:NativeDataScope?,now:Date=Date())->Bool{guard storageReady,current==scope,let ticket,let expires=NativeCoreExportReceipt.utc(ticket.expiresAt),now<expires else{self.ticket=nil;return false};return true}
    func request(confirmed:Bool,current:@escaping()->NativeDataScope?,post:(Data)async throws->Data)async {
        guard storageReady,confirmed,!busy,let scope,current()==scope else{return};if requestID==nil{requestID=UUID().uuidString.lowercased()}
        guard let requestID else{return};let body=try? JSONSerialization.data(withJSONObject:["requestId":requestID,"confirmed":true])
        guard let body else{return};await readOrRequest(requestID,current:current){try await post(body)}
    }
    func refresh(current:@escaping()->NativeDataScope?,get:(String)async throws->Data)async{guard let requestID else{return};await readOrRequest(requestID,current:current){try await get(requestID)}}
    private func readOrRequest(_ requested:String,current:@escaping()->NativeDataScope?,request:()async throws->Data)async {
        guard storageReady,!busy,let scope,current()==scope else{return};let own=generation;busy=true;defer{if generation==own{busy=false}}
        do {
            let bytes=try await request();guard generation==own,current()==scope,!Task.isCancelled,requestID==requested else{return}
            let value=try NativeCoreExportReceipt.decode(bytes,requestID:requested)
            if value.artifactDigest != receipt?.artifactDigest || value.generation != receipt?.generation || !value.ready{ticket=nil;removeFile()}
            guard storageReady else{return};receipt=value;notice=nil
        }catch{if generation==own,current()==scope{failed(error)}}
    }
    func getTicket(current:@escaping()->NativeDataScope?,post:(String)async throws->Data)async {
        guard storageReady,!busy,let scope,current()==scope,let receipt,receipt.ready,let expires=receipt.artifactExpiresAt.flatMap(NativeCoreExportReceipt.utc),Date()<expires else{return}
        let own=generation;ticket=nil;removeFile();guard storageReady else{return};busy=true;defer{if generation==own{busy=false}}
        do{let bytes=try await post(receipt.requestId);guard generation==own,current()==scope,!Task.isCancelled else{return};ticket=try .decode(bytes,receipt:receipt);notice=nil}
        catch{if generation==own,current()==scope{ticket=nil;failed(error)}}
    }
    func download(current:@escaping()->NativeDataScope?,get:(String,String,String)async throws->NativeCoreExportDownload)async {
        guard storageReady,!busy,let scope,current()==scope,let receipt,let ticket,hasTicket(scope) else{return}
        let own=generation;self.ticket=nil;removeFile();guard storageReady else{return};busy=true;defer{if generation==own{busy=false}}
        var pendingFolder:URL?
        defer{if let pendingFolder{do{try removePendingFolder(pendingFolder)}catch{storageReady=false;fileURL=nil;fileDeadline=nil;notice="unconfirmed"}}}
        do {
            let data=try await get(ticket.requestId,ticket.operationId,ticket.token)
            guard generation==own,current()==scope,!Task.isCancelled else{return};try data.validate(ticket:ticket,receipt:receipt)
            guard let deadline=NativeCoreExportReceipt.utc(ticket.expiresAt),Date()<deadline else{throw NativeDataError.invalidResponse}
            try checkedRoot()
            let folder=root.appendingPathComponent(UUID().uuidString,isDirectory:true)
            pendingFolder=folder
            try FileManager.default.createDirectory(at:folder,withIntermediateDirectories:true,attributes:[.protectionKey:FileProtectionType.complete,.posixPermissions:0o700])
            var excluded=URLResourceValues();excluded.isExcludedFromBackup=true;var directory=folder;try directory.setResourceValues(excluded)
            let file=folder.appendingPathComponent("visepanda-export-"+receipt.requestId+".json")
            try data.bytes.write(to:file,options:[.atomic,.completeFileProtection]);try FileManager.default.setAttributes([.posixPermissions:0o600],ofItemAtPath:file.path);var target=file;try target.setResourceValues(excluded)
            try beforeMarkerWrite?(folder)
            let marker=folder.appendingPathComponent("expires.txt")
            try Data(String(deadline.timeIntervalSince1970).utf8).write(to:marker,options:[.atomic,.completeFileProtection]);try FileManager.default.setAttributes([.posixPermissions:0o600],ofItemAtPath:marker.path);var expiryMarker=marker;try expiryMarker.setResourceValues(excluded)
            guard generation==own,current()==scope,!Task.isCancelled,Date()<deadline else{throw NativeDataError.staleSessionResponse}
            fileURL=file;fileDeadline=deadline;notice="downloaded";pendingFolder=nil
        }catch{if generation==own,current()==scope{failed(error)}}
    }
    func discardSelected(){clear()}
    private func failed(_ error:Error){ticket=nil;removeFile();if case NativeDataError.server(let code)=error{notice=code=="REAUTHENTICATION_REQUIRED" ? "reauth":["UNAUTHENTICATED","SESSION_REPLACED","FORBIDDEN"].contains(code) ? "actor":"unconfirmed";if notice=="actor"{receipt=nil;requestID=nil}}else{notice="unconfirmed"}}
}
