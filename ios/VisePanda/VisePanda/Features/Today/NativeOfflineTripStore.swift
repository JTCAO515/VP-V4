import CryptoKit
import Foundation
import Security

/// Local namespace identity, not an offline authorization or server lease.
struct NativeOfflineTripNamespace:Codable,Equatable {
    let endpoint:String
    let ownerID:String
    let mobileEpoch:Int
    let tripID:String
    init(scope:NativeDataScope,tripID:String)throws {
        guard UUID(uuidString:scope.subject) != nil,UUID(uuidString:tripID) != nil,scope.mobileEpoch>0 else{throw NativeOfflineTripError.invalidInput}
        endpoint=scope.endpoint;ownerID=scope.subject.lowercased();mobileEpoch=scope.mobileEpoch;self.tripID=tripID.lowercased()
    }
    func matches(_ scope:NativeDataScope)->Bool{endpoint==scope.endpoint && ownerID==scope.subject.lowercased() && mobileEpoch==scope.mobileEpoch}
    var valid:Bool{UUID(uuidString:ownerID) != nil && UUID(uuidString:tripID) != nil && mobileEpoch>0 && !endpoint.isEmpty}
    var accountKey:String{Self.digest(Data("\(endpoint)\n\(ownerID)\n\(mobileEpoch)".utf8))}
    var tripKey:String{Self.digest(Data(tripID.utf8))}
    static func digest(_ data:Data)->String{SHA256.hash(data:data).map{String(format:"%02x",$0)}.joined()}
}
enum NativeOfflineTripError:Error {
    case invalidInput,storageUnavailable,wrongNamespace,corruptFile,authorityRequired,versionConflict
}
/// Only explicit user-edit operations are stored here. No confirmed snapshot,
/// address/provider/fact/media cache or lease duration is inferred from this draft.
struct NativeOfflineTripDraft:Codable,Equatable {
    let schemaVersion:String
    let namespace:NativeOfflineTripNamespace
    let draftID:String
    let baseVersion:Int
    let createdAt:Date
    var updatedAt:Date
    var operations:[NativeTripOperation]
    init(namespace:NativeOfflineTripNamespace,baseVersion:Int,operations:[NativeTripOperation],now:Date=Date())throws {
        guard baseVersion>=0,Self.validOperations(operations) else{throw NativeOfflineTripError.invalidInput}
        schemaVersion="native-offline-user-draft/1";self.namespace=namespace;draftID=UUID().uuidString.lowercased();self.baseVersion=baseVersion;createdAt=now;updatedAt=now;self.operations=operations
    }
    var valid:Bool{schemaVersion=="native-offline-user-draft/1" && namespace.valid && UUID(uuidString:draftID) != nil && baseVersion>=0 && updatedAt>=createdAt && Self.validOperations(operations)}
    static func validOperations(_ operations:[NativeTripOperation])->Bool {
        guard !operations.isEmpty,operations.count<=100 else{return false}
        func identifier(_ value:String?)->Bool{value?.range(of:"^[A-Za-z0-9_-]{1,64}$",options:.regularExpression) != nil}
        func title(_ value:String?)->Bool{value.map{!$0.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty && $0.utf16.count<=160}==true}
        for op in operations {
            switch op.kind {
            case .setTitle:guard title(op.title),op.dayId==nil,op.date==nil,op.timeZone==nil,op.itemId==nil,op.startsAt==nil,op.endsAt==nil else{return false}
            case .deleteDay:guard identifier(op.dayId),op.title==nil,op.date==nil,op.timeZone==nil,op.itemId==nil,op.startsAt==nil,op.endsAt==nil else{return false}
            case .upsertDay:
                guard identifier(op.dayId),op.title==nil,op.itemId==nil,op.startsAt==nil,op.endsAt==nil,let date=op.date,NativeTravelIntake.validDates(.init(startDate:date,endDate:date)),op.timeZone==nil || (op.timeZone?.utf16.count ?? 0)<=64 && op.timeZone?.range(of:"^[A-Za-z_+-]+(/[A-Za-z_+-]+)+$",options:.regularExpression) != nil else{return false}
            case .deleteItem:guard identifier(op.dayId),identifier(op.itemId),op.title==nil,op.date==nil,op.timeZone==nil,op.startsAt==nil,op.endsAt==nil else{return false}
            case .upsertItem:
                guard identifier(op.dayId),identifier(op.itemId),title(op.title),op.date==nil,op.timeZone==nil else{return false}
                for stamp in [op.startsAt,op.endsAt].compactMap({$0}) {guard stamp.range(of:#"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$"#,options:.regularExpression) != nil,NativeKnowledgeRead.date(stamp) != nil else{return false}}
                if let start=op.startsAt,let end=op.endsAt,NativeKnowledgeRead.date(end)!<=NativeKnowledgeRead.date(start)!{return false}
            }
        }
        return true
    }
}
/// Encrypted, ThisDeviceOnly-key storage for user-authored edits. It deliberately
/// exposes no snapshot-cache write until the server's permit contract is frozen.
@MainActor final class NativeOfflineTripStore {
    private let root:URL
    private let vault:any NativeCredentialVault
    private let defaults:UserDefaults
    private let purgeKey:String
    private let service="com.visepanda.native.offline-user-drafts.v1"
    init(root:URL?=nil,vault:any NativeCredentialVault=NativeKeychainVault(),defaults:UserDefaults = .standard) {
        self.root=root ?? FileManager.default.urls(for:.applicationSupportDirectory,in:.userDomainMask)[0].appendingPathComponent("NativeOfflineTrip",isDirectory:true)
        self.vault=vault;self.defaults=defaults
        purgeKey="native.offline.purgeRequired."+NativeOfflineTripNamespace.digest(Data(self.root.path.utf8))
    }
    func saveUserDraft(_ draft:NativeOfflineTripDraft,scope:NativeDataScope)throws {
        guard !defaults.bool(forKey:purgeKey),draft.valid,draft.namespace.matches(scope) else{throw NativeOfflineTripError.wrongNamespace}
        let bytes=try JSONEncoder().encode(draft);guard bytes.count<=128_000 else{throw NativeOfflineTripError.invalidInput}
        try prepare(draft.namespace)
        let key=try key(draft.namespace,create:true)
        let sealed=try AES.GCM.seal(bytes,using:key,authenticating:binding(draft.namespace))
        guard let ciphertext=sealed.combined else{throw NativeOfflineTripError.storageUnavailable}
        let target=file(draft.namespace)
        try ciphertext.write(to:target,options:[.atomic,.completeFileProtection])
        try FileManager.default.setAttributes([.posixPermissions:0o600],ofItemAtPath:target.path)
        try exclude(target)
        try register(draft.namespace)
    }
    func readUserDraft(_ namespace:NativeOfflineTripNamespace,scope:NativeDataScope)throws->NativeOfflineTripDraft? {
        guard !defaults.bool(forKey:purgeKey),namespace.valid,namespace.matches(scope) else{throw NativeOfflineTripError.wrongNamespace}
        let target=file(namespace)
        guard FileManager.default.fileExists(atPath:target.path) else{return nil}
        guard try target.resourceValues(forKeys:[.isSymbolicLinkKey]).isSymbolicLink != true,
              let size=try target.resourceValues(forKeys:[.fileSizeKey]).fileSize,size>0,size<=129_000 else{throw NativeOfflineTripError.corruptFile}
        do {
            let sealed=try AES.GCM.SealedBox(combined:Data(contentsOf:target))
            let bytes=try AES.GCM.open(sealed,using:key(namespace,create:false),authenticating:binding(namespace))
            let value=try JSONDecoder().decode(NativeOfflineTripDraft.self,from:bytes)
            guard value.valid,value.namespace==namespace else{throw NativeOfflineTripError.corruptFile};return value
        }catch{throw NativeOfflineTripError.corruptFile}
    }
    func saveConfirmedText(_ permit:NativeVerifiedOfflinePermit,scope:NativeDataScope,requestStarted:TimeInterval,now:Date=Date(),uptime:TimeInterval=ProcessInfo.processInfo.systemUptime,bootIdentity:String?=NativeOfflineBootIdentity.current())throws {
        guard !defaults.bool(forKey:purgeKey),permit.namespace.matches(scope) else{throw NativeOfflineTripError.wrongNamespace}
        var record=try NativeOfflineCachedText(permit:permit,requestStarted:requestStarted,now:now,uptime:uptime,bootIdentity:bootIdentity)
        if let prior=try readCachedRecord(permit.namespace),prior.wire==permit.wire {
            guard prior.bootIdentity==record.bootIdentity,now>=prior.lastObservedAt,uptime>=prior.lastObservedUptime else{throw NativeOfflineTripError.authorityRequired}
            record=try NativeOfflineCachedText(permit:permit,requestStarted:requestStarted,now:now,uptime:uptime,bootIdentity:bootIdentity)
            guard record.deadlineUptime<=prior.deadlineUptime else{throw NativeOfflineTripError.authorityRequired}
        }
        try prepare(permit.namespace)
        try writeEncrypted(JSONEncoder().encode(record),namespace:permit.namespace,suffix:".confirmed.aesgcm",tag:"native-offline-confirmed-text/1")
        try register(permit.namespace)
    }
    func readConfirmedText(_ namespace:NativeOfflineTripNamespace,scope:NativeDataScope,verifier:NativeOfflinePermitVerifier,now:Date=Date(),uptime:TimeInterval=ProcessInfo.processInfo.systemUptime,bootIdentity:String?=NativeOfflineBootIdentity.current())throws->(NativeOfflineCachedText,NativeOfflineTextPayload)? {
        guard !defaults.bool(forKey:purgeKey),namespace.matches(scope),let record=try readCachedRecord(namespace) else{return nil}
        let payload=try record.currentPayload(verifier:verifier,scope:scope,now:now,uptime:uptime,bootIdentity:bootIdentity)
        var updated=record;updated.lastObservedAt=now;updated.lastObservedUptime=uptime
        try writeEncrypted(JSONEncoder().encode(updated),namespace:namespace,suffix:".confirmed.aesgcm",tag:"native-offline-confirmed-text/1")
        return (updated,payload)
    }
    func cachedMetadata(_ namespace:NativeOfflineTripNamespace,scope:NativeDataScope)throws->(headVersion:Int,savedAt:Date,generation:Int,policyID:String,policyRevision:Int,coverage:String,payloadDigest:String)? {
        guard !defaults.bool(forKey:purgeKey),namespace.matches(scope) else{throw NativeOfflineTripError.wrongNamespace}
        return try readCachedRecord(namespace).map{($0.headVersion,$0.savedAt,$0.generation,$0.policyID,$0.policyRevision,$0.coverage,$0.payloadDigest)}
    }
    private func readCachedRecord(_ namespace:NativeOfflineTripNamespace)throws->NativeOfflineCachedText? {
        guard let data=try readEncrypted(namespace:namespace,suffix:".confirmed.aesgcm",tag:"native-offline-confirmed-text/1") else{return nil}
        let value=try JSONDecoder().decode(NativeOfflineCachedText.self,from:data)
        guard value.namespace==namespace else{throw NativeOfflineTripError.wrongNamespace};return value
    }
    private func writeEncrypted(_ bytes:Data,namespace:NativeOfflineTripNamespace,suffix:String,tag:String)throws {
        guard bytes.count<=200_000 else{throw NativeOfflineTripError.invalidInput}
        let sealed=try AES.GCM.seal(bytes,using:key(namespace,create:true),authenticating:Data((namespace.accountKey+"/"+namespace.tripKey+"/"+tag).utf8))
        guard let data=sealed.combined else{throw NativeOfflineTripError.storageUnavailable}
        let target=root.appendingPathComponent(namespace.accountKey,isDirectory:true).appendingPathComponent(namespace.tripKey+suffix)
        try data.write(to:target,options:[.atomic,.completeFileProtection]);try FileManager.default.setAttributes([.posixPermissions:0o600],ofItemAtPath:target.path);try exclude(target)
    }
    private func readEncrypted(namespace:NativeOfflineTripNamespace,suffix:String,tag:String)throws->Data? {
        let target=root.appendingPathComponent(namespace.accountKey,isDirectory:true).appendingPathComponent(namespace.tripKey+suffix)
        guard FileManager.default.fileExists(atPath:target.path) else{return nil}
        guard try target.resourceValues(forKeys:[.isSymbolicLinkKey]).isSymbolicLink != true,let size=try target.resourceValues(forKeys:[.fileSizeKey]).fileSize,size>0,size<=200_100 else{throw NativeOfflineTripError.corruptFile}
        return try AES.GCM.open(AES.GCM.SealedBox(combined:Data(contentsOf:target)),using:key(namespace,create:false),authenticating:Data((namespace.accountKey+"/"+namespace.tripKey+"/"+tag).utf8))
    }

    func removeConfirmedText(_ namespace:NativeOfflineTripNamespace,scope:NativeDataScope)throws {
        guard namespace.valid,namespace.matches(scope) else{throw NativeOfflineTripError.wrongNamespace}
        let cache=root.appendingPathComponent(namespace.accountKey,isDirectory:true).appendingPathComponent(namespace.tripKey+".confirmed.aesgcm")
        if FileManager.default.fileExists(atPath:cache.path){try FileManager.default.removeItem(at:cache)}
        if !FileManager.default.fileExists(atPath:file(namespace).path){let ids=try index(namespace);if ids.contains(namespace.tripID){try writeIndex(ids.filter{$0 != namespace.tripID},namespace:namespace)}}
    }

    func removeTrip(_ namespace:NativeOfflineTripNamespace,scope:NativeDataScope)throws {
        guard namespace.valid,namespace.matches(scope) else{throw NativeOfflineTripError.wrongNamespace}
        let target=file(namespace)
        if FileManager.default.fileExists(atPath:target.path){try FileManager.default.removeItem(at:target)}
        let cache=root.appendingPathComponent(namespace.accountKey,isDirectory:true).appendingPathComponent(namespace.tripKey+".confirmed.aesgcm")
        if FileManager.default.fileExists(atPath:cache.path){try FileManager.default.removeItem(at:cache)}
        let ids=try index(namespace)
        if ids.contains(namespace.tripID){try writeIndex(ids.filter{$0 != namespace.tripID},namespace:namespace)}
    }
    func eraseAll()throws {
        defaults.set(true,forKey:purgeKey)
        guard FileManager.default.fileExists(atPath:root.path) else{defaults.removeObject(forKey:purgeKey);return}
        guard try root.resourceValues(forKeys:[.isSymbolicLinkKey]).isSymbolicLink != true else{throw NativeOfflineTripError.storageUnavailable}
        for folder in try FileManager.default.contentsOfDirectory(at:root,includingPropertiesForKeys:[.isSymbolicLinkKey]) {
            guard Self.hashName(folder.lastPathComponent),try folder.resourceValues(forKeys:[.isSymbolicLinkKey]).isSymbolicLink != true else{throw NativeOfflineTripError.storageUnavailable}
            let status=vault.remove(service:service,owner:folder.lastPathComponent)
            guard status==errSecSuccess || status==errSecItemNotFound else{throw NativeOfflineTripError.storageUnavailable}
            try FileManager.default.removeItem(at:folder)
        }
        try FileManager.default.removeItem(at:root)
        defaults.removeObject(forKey:purgeKey)
    }
    func savedTripIDs(scope:NativeDataScope)throws->[String] {
        guard !defaults.bool(forKey:purgeKey) else{throw NativeOfflineTripError.storageUnavailable}
        let placeholder=try NativeOfflineTripNamespace(scope:scope,tripID:"00000000-0000-4000-8000-000000000000")
        return try index(placeholder)
    }
    private func index(_ namespace:NativeOfflineTripNamespace)throws->[String] {
        let url=root.appendingPathComponent(namespace.accountKey,isDirectory:true).appendingPathComponent("index.aesgcm")
        guard FileManager.default.fileExists(atPath:url.path) else{return []}
        guard try url.resourceValues(forKeys:[.isSymbolicLinkKey]).isSymbolicLink != true,let size=try url.resourceValues(forKeys:[.fileSizeKey]).fileSize,size<=10_000 else{throw NativeOfflineTripError.corruptFile}
        let data=try AES.GCM.open(AES.GCM.SealedBox(combined:Data(contentsOf:url)),using:key(namespace,create:false),authenticating:Data((namespace.accountKey+"/offline-index/1").utf8))
        let ids=try JSONDecoder().decode([String].self,from:data)
        guard ids.count<=100,Set(ids).count==ids.count,ids.allSatisfy(NativeMemoryWire.uuid) else{throw NativeOfflineTripError.corruptFile};return ids
    }
    private func register(_ namespace:NativeOfflineTripNamespace)throws {
        var ids=try index(namespace)
        if !ids.contains(namespace.tripID){ids.append(namespace.tripID)}
        guard ids.count<=100 else{throw NativeOfflineTripError.storageUnavailable}
        try writeIndex(ids,namespace:namespace)
    }
    private func writeIndex(_ ids:[String],namespace:NativeOfflineTripNamespace)throws {
        let sealed=try AES.GCM.seal(JSONEncoder().encode(ids.sorted()),using:key(namespace,create:false),authenticating:Data((namespace.accountKey+"/offline-index/1").utf8))
        guard let data=sealed.combined else{throw NativeOfflineTripError.storageUnavailable}
        let url=root.appendingPathComponent(namespace.accountKey,isDirectory:true).appendingPathComponent("index.aesgcm")
        try data.write(to:url,options:[.atomic,.completeFileProtection]);try FileManager.default.setAttributes([.posixPermissions:0o600],ofItemAtPath:url.path);try exclude(url)
    }

    private func prepare(_ namespace:NativeOfflineTripNamespace)throws {
        try FileManager.default.createDirectory(at:root,withIntermediateDirectories:true,attributes:[.protectionKey:FileProtectionType.complete,.posixPermissions:0o700])
        guard try root.resourceValues(forKeys:[.isSymbolicLinkKey]).isSymbolicLink != true else{throw NativeOfflineTripError.storageUnavailable}
        let folder=root.appendingPathComponent(namespace.accountKey,isDirectory:true)
        try FileManager.default.createDirectory(at:folder,withIntermediateDirectories:true,attributes:[.protectionKey:FileProtectionType.complete,.posixPermissions:0o700])
        guard try folder.resourceValues(forKeys:[.isSymbolicLinkKey]).isSymbolicLink != true else{throw NativeOfflineTripError.storageUnavailable}
        try exclude(root);try exclude(folder)
    }
    private func key(_ namespace:NativeOfflineTripNamespace,create:Bool)throws->SymmetricKey {
        let (status,data)=vault.read(service:service,owner:namespace.accountKey)
        if status==errSecSuccess,let data,data.count==32{return SymmetricKey(data:data)}
        guard status==errSecItemNotFound,create else{throw NativeOfflineTripError.storageUnavailable}
        let key=SymmetricKey(size:.bits256),bytes=key.withUnsafeBytes{Data($0)}
        guard vault.write(bytes,service:service,owner:namespace.accountKey)==errSecSuccess else{throw NativeOfflineTripError.storageUnavailable};return key
    }
    private func file(_ namespace:NativeOfflineTripNamespace)->URL{root.appendingPathComponent(namespace.accountKey,isDirectory:true).appendingPathComponent(namespace.tripKey+".draft.aesgcm")}
    private func binding(_ namespace:NativeOfflineTripNamespace)->Data{Data((namespace.accountKey+"/"+namespace.tripKey+"/native-offline-user-draft/1").utf8)}
    private func exclude(_ url:URL)throws{var value=URLResourceValues();value.isExcludedFromBackup=true;var target=url;try target.setResourceValues(value)}
    private static func hashName(_ value:String)->Bool{value.range(of:"^[0-9a-f]{64}$",options:.regularExpression) != nil}
}

/// Converts explicit user operations into the existing editable Trip draft only
/// after a fresh, same-account, exact-version online read. Never rebases silently.
enum NativeOfflineDraftRecovery {
    static func restore(_ local:NativeOfflineTripDraft,scope:NativeDataScope,detail:NativeTripDetail)throws->NativeTripDraft {
        guard local.valid,local.namespace.matches(scope),local.namespace.tripID==detail.trip.id.lowercased(),detail.confirmationState=="confirmed" else{throw NativeOfflineTripError.authorityRequired}
        guard detail.trip.headVersion==local.baseVersion else{throw NativeOfflineTripError.versionConflict}
        var draft=NativeTripDraft(detail)
        for op in local.operations {
            switch op.kind {
            case .setTitle:draft.title=op.title!
            case .deleteDay:draft.days.removeAll{$0.id==op.dayId}
            case .upsertDay:
                if let index=draft.days.firstIndex(where:{$0.id==op.dayId}){draft.days[index].date=op.date!;draft.days[index].timeZone=op.timeZone}
                else{draft.days.append(.init(id:op.dayId!,date:op.date!,timeZone:op.timeZone,items:[]))}
            case .deleteItem:
                guard let index=draft.days.firstIndex(where:{$0.id==op.dayId}) else{throw NativeOfflineTripError.invalidInput}
                draft.days[index].items.removeAll{$0.id==op.itemId}
            case .upsertItem:
                guard let index=draft.days.firstIndex(where:{$0.id==op.dayId}) else{throw NativeOfflineTripError.invalidInput}
                let item=NativeTripItem(id:op.itemId!,dayId:op.dayId!,title:op.title!,startsAt:op.startsAt,endsAt:op.endsAt)
                if let i=draft.days[index].items.firstIndex(where:{$0.id==op.itemId}){draft.days[index].items[i]=item}else{draft.days[index].items.append(item)}
            }
        }
        guard NativeOfflineTripDraft.validOperations(draft.patch.operations) else{throw NativeOfflineTripError.invalidInput};return draft
    }
}

struct NativeOfflineTextSubmission:Encodable {
    let operationId:String
    let expectedHeadVersion:Int
    let date:String
    let title:String
    let saveOffline=true
    init(headVersion:Int,date:String,title:String)throws {
        let trimmed=title.trimmingCharacters(in:.whitespacesAndNewlines)
        guard (0...999_999_999).contains(headVersion),NativeTravelIntake.validDates(.init(startDate:date,endDate:date)),!trimmed.isEmpty,trimmed.utf16.count<=160,title.utf16.count<=2048 else{throw NativeOfflineTripError.invalidInput}
        operationId=UUID().uuidString.lowercased();expectedHeadVersion=headVersion;self.date=date;self.title=trimmed
    }
}
