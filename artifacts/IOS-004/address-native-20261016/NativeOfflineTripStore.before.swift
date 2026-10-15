import CryptoKit
import Darwin
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
            case .reorderItems: return false
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
    private let removeOfflineFile:(URL)throws->Void
    init(root:URL?=nil,vault:any NativeCredentialVault=NativeKeychainVault(),defaults:UserDefaults = .standard,removeOfflineFile:((URL)throws->Void)?=nil) {
        self.root=root ?? FileManager.default.urls(for:.applicationSupportDirectory,in:.userDomainMask)[0].appendingPathComponent("NativeOfflineTrip",isDirectory:true)
        self.vault=vault;self.defaults=defaults
        self.removeOfflineFile=removeOfflineFile ?? {try FileManager.default.removeItem(at:$0)}
        purgeKey="native.offline.purgeRequired."+NativeOfflineTripNamespace.digest(Data(self.root.path.utf8))
    }
    func saveUserDraft(_ draft:NativeOfflineTripDraft,scope:NativeDataScope,ticket:NativeOfflineDataWriteTicket)throws {
        try checkOfflineDataWrite(ticket,namespace:draft.namespace,scope:scope)
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
        try checkOfflineDataAccess(namespace,scope:scope)
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

    /// Only explicit, bounded lodging input. The key and associated data use
    /// the same owner/endpoint/mobile-epoch/Trip namespace as offline edits.
    func saveLodging(_ record:NativeLodgingLocalRecord,expectedRevision:Int?,scope:NativeDataScope,ticket:NativeOfflineDataWriteTicket)throws {
        try checkOfflineDataWrite(ticket,namespace:record.namespace,scope:scope)
        let namespace=record.namespace
        guard !defaults.bool(forKey:purgeKey),record.valid,namespace.matches(scope),
              record.revision==(expectedRevision ?? 0)+1 else{throw NativeOfflineTripError.wrongNamespace}
        let prior=try readLodging(namespace,scope:scope)
        guard prior?.revision==expectedRevision else{throw NativeOfflineTripError.versionConflict}
        let bytes=try JSONEncoder().encode(record)
        guard bytes.count<=16_000 else{throw NativeOfflineTripError.invalidInput}
        try prepare(namespace)
        try writeEncrypted(bytes,namespace:namespace,suffix:".lodging.aesgcm",tag:"native-lodging-local/1")
        try register(namespace)
    }

    func readLodging(_ namespace:NativeOfflineTripNamespace,scope:NativeDataScope)throws->NativeLodgingLocalRecord? {
        try checkOfflineDataAccess(namespace,scope:scope)
        guard !defaults.bool(forKey:purgeKey),namespace.valid,namespace.matches(scope) else{throw NativeOfflineTripError.wrongNamespace}
        guard let bytes=try readEncrypted(namespace:namespace,suffix:".lodging.aesgcm",tag:"native-lodging-local/1") else{return nil}
        guard bytes.count<=16_000 else{throw NativeOfflineTripError.corruptFile}
        do {
            let record=try JSONDecoder().decode(NativeLodgingLocalRecord.self,from:bytes)
            guard record.valid,record.namespace==namespace else{throw NativeOfflineTripError.corruptFile}
            return record
        }catch{throw NativeOfflineTripError.corruptFile}
    }

    func removeLodging(_ namespace:NativeOfflineTripNamespace,scope:NativeDataScope)throws {
        guard namespace.valid,namespace.matches(scope) else{throw NativeOfflineTripError.wrongNamespace}
        try invalidateOfflineDataWrites(namespace,scope:scope)
        let target=root.appendingPathComponent(namespace.accountKey,isDirectory:true).appendingPathComponent(namespace.tripKey+".lodging.aesgcm")
        if FileManager.default.fileExists(atPath:target.path){try FileManager.default.removeItem(at:target)}
        guard !FileManager.default.fileExists(atPath:target.path) else{throw NativeOfflineTripError.storageUnavailable}
        if !FileManager.default.fileExists(atPath:file(namespace).path) &&
           !FileManager.default.fileExists(atPath:root.appendingPathComponent(namespace.accountKey).appendingPathComponent(namespace.tripKey+".confirmed.aesgcm").path) {
            let ids=try index(namespace)
            if ids.contains(namespace.tripID){try writeIndex(ids.filter{$0 != namespace.tripID},namespace:namespace)}
        }
    }
    func saveConfirmedText(_ permit:NativeVerifiedOfflinePermit,scope:NativeDataScope,ticket:NativeOfflineDataWriteTicket,now:Date=Date(),uptime:TimeInterval=ProcessInfo.processInfo.systemUptime,bootIdentity:String?=NativeOfflineBootIdentity.current())throws {
        try checkOfflineDataWrite(ticket,namespace:permit.namespace,scope:scope)
        guard !defaults.bool(forKey:purgeKey),permit.namespace.matches(scope) else{throw NativeOfflineTripError.wrongNamespace}
        guard permit.requestNonce==ticket.nonce else{throw NativeOfflineTripError.authorityRequired}
        var record=try NativeOfflineCachedText(permit:permit,requestStarted:ticket.startedUptime,now:now,uptime:uptime,bootIdentity:bootIdentity)
        if let prior=try readCachedRecord(permit.namespace),prior.wire==permit.wire {
            guard prior.bootIdentity==record.bootIdentity,now>=prior.lastObservedAt,uptime>=prior.lastObservedUptime else{throw NativeOfflineTripError.authorityRequired}
            record=try NativeOfflineCachedText(permit:permit,requestStarted:ticket.startedUptime,now:now,uptime:uptime,bootIdentity:bootIdentity)
            guard record.deadlineUptime<=prior.deadlineUptime else{throw NativeOfflineTripError.authorityRequired}
        }
        try prepare(permit.namespace)
        try writeEncrypted(JSONEncoder().encode(record),namespace:permit.namespace,suffix:".confirmed.aesgcm",tag:"native-offline-confirmed-text/1")
        try register(permit.namespace)
    }
    func readConfirmedText(_ namespace:NativeOfflineTripNamespace,scope:NativeDataScope,verifier:NativeOfflinePermitVerifier,now:Date=Date(),uptime:TimeInterval=ProcessInfo.processInfo.systemUptime,bootIdentity:String?=NativeOfflineBootIdentity.current())throws->(NativeOfflineCachedText,NativeOfflineTextPayload)? {
        try checkOfflineDataAccess(namespace,scope:scope)
        guard !defaults.bool(forKey:purgeKey),namespace.matches(scope),let record=try readCachedRecord(namespace) else{return nil}
        let payload=try record.currentPayload(verifier:verifier,scope:scope,now:now,uptime:uptime,bootIdentity:bootIdentity)
        var updated=record;updated.lastObservedAt=now;updated.lastObservedUptime=uptime
        try writeEncrypted(JSONEncoder().encode(updated),namespace:namespace,suffix:".confirmed.aesgcm",tag:"native-offline-confirmed-text/1")
        return (updated,payload)
    }
    func cachedMetadata(_ namespace:NativeOfflineTripNamespace,scope:NativeDataScope)throws->(headVersion:Int,savedAt:Date,generation:Int,policyID:String,policyRevision:Int,coverage:String,payloadDigest:String)? {
        try checkOfflineDataAccess(namespace,scope:scope)
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
        try invalidateOfflineDataWrites(namespace,scope:scope)
        let cache=root.appendingPathComponent(namespace.accountKey,isDirectory:true).appendingPathComponent(namespace.tripKey+".confirmed.aesgcm")
        if FileManager.default.fileExists(atPath:cache.path){try FileManager.default.removeItem(at:cache)}
        let lodging=root.appendingPathComponent(namespace.accountKey,isDirectory:true).appendingPathComponent(namespace.tripKey+".lodging.aesgcm")
        if !FileManager.default.fileExists(atPath:file(namespace).path) && !FileManager.default.fileExists(atPath:lodging.path){let ids=try index(namespace);if ids.contains(namespace.tripID){try writeIndex(ids.filter{$0 != namespace.tripID},namespace:namespace)}}
    }

    func removeTrip(_ namespace:NativeOfflineTripNamespace,scope:NativeDataScope)throws {
        let inventory=try offlineDataInventory(namespace,scope:scope)
        let pending=try offlineDataPendingCleanup(namespace,scope:scope)
        _ = try cleanupOfflineData(namespace,scope:scope,expectedFingerprint:inventory.fingerprint,
            operationID:pending?.operationID ?? UUID().uuidString.lowercased())
    }
    private func removeTripFiles(_ namespace:NativeOfflineTripNamespace,scope:NativeDataScope)throws {
        guard namespace.valid,namespace.matches(scope) else{throw NativeOfflineTripError.wrongNamespace}
        let target=file(namespace)
        if FileManager.default.fileExists(atPath:target.path){try removeOfflineFile(target)}
        let cache=root.appendingPathComponent(namespace.accountKey,isDirectory:true).appendingPathComponent(namespace.tripKey+".confirmed.aesgcm")
        if FileManager.default.fileExists(atPath:cache.path){try removeOfflineFile(cache)}
        let lodging=root.appendingPathComponent(namespace.accountKey,isDirectory:true).appendingPathComponent(namespace.tripKey+".lodging.aesgcm")
        if FileManager.default.fileExists(atPath:lodging.path){try removeOfflineFile(lodging)}
        let ids=try index(namespace)
        if ids.contains(namespace.tripID){try writeIndex(ids.filter{$0 != namespace.tripID},namespace:namespace)}
        try verifyOfflineDataAbsence(namespace,scope:scope)
    }

    func offlineDataGeneration(_ namespace:NativeOfflineTripNamespace,scope:NativeDataScope)throws->Int {
        try checkOfflineDataAccess(namespace,scope:scope)
        return try offlineDataFence(namespace)?.generation ?? 0
    }
    func beginOfflineDataWrite(_ namespace:NativeOfflineTripNamespace,scope:NativeDataScope,uptime:TimeInterval=ProcessInfo.processInfo.systemUptime)throws->NativeOfflineDataWriteTicket {
        let generation=try offlineDataGeneration(namespace,scope:scope)
        let ids=try offlineDataSelectionIDs(scope:scope)
        guard ids.count<100 || ids.contains(namespace.tripID) else{throw NativeOfflineTripError.storageUnavailable}
        guard uptime.isFinite,uptime>=0 else{throw NativeOfflineTripError.invalidInput}
        return .init(namespace:namespace,generation:generation,nonce:UUID().uuidString.lowercased(),startedUptime:uptime)
    }
    private func invalidateOfflineDataWrites(_ namespace:NativeOfflineTripNamespace,scope:NativeDataScope)throws {
        let generation=try offlineDataGeneration(namespace,scope:scope)
        guard generation<1_000_000 else{throw NativeOfflineTripError.storageUnavailable}
        try prepare(namespace)
        let fence=NativeOfflineDataFence(schemaVersion:"native-offline-cleanup-fence/1",namespace:namespace,
            operationID:UUID().uuidString.lowercased(),generation:generation+1,cleanup:false,startedAt:Date())
        try writeEncrypted(JSONEncoder().encode(fence),namespace:namespace,suffix:".cleanup-fence.aesgcm",tag:"native-offline-cleanup-fence/1")
        guard try offlineDataFence(namespace)==fence else{throw NativeOfflineTripError.storageUnavailable}
    }

    private func checkOfflineDataWrite(_ ticket:NativeOfflineDataWriteTicket,namespace:NativeOfflineTripNamespace,scope:NativeDataScope)throws {
        guard ticket.namespace==namespace,try offlineDataGeneration(namespace,scope:scope)==ticket.generation else{throw NativeOfflineTripError.versionConflict}
    }
    /// Includes original index plus exact unfinished cleanup admissions for recovery.
    /// No guessed hash-to-Trip mapping or user-entered identifiers.
    func offlineDataSelectionIDs(scope:NativeDataScope)throws->[String] {
        var ids=Set(try savedTripIDs(scope:scope))
        let placeholder=try NativeOfflineTripNamespace(scope:scope,tripID:"00000000-0000-4000-8000-000000000000")
        let folder=root.appendingPathComponent(placeholder.accountKey,isDirectory:true)
        if try offlinePathExists(folder,directory:true) {
            let files=try FileManager.default.contentsOfDirectory(at:folder,includingPropertiesForKeys:nil)
            guard files.count<=502 else{throw NativeOfflineTripError.storageUnavailable}
            for url in files where url.lastPathComponent.hasSuffix(".cleanup-fence.aesgcm") {
                let name=String(url.lastPathComponent.dropLast(".cleanup-fence.aesgcm".count))
                guard Self.hashName(name),try offlinePathExists(url),let size=try url.resourceValues(forKeys:[.fileSizeKey]).fileSize,size>0,size<=4_196 else{throw NativeOfflineTripError.corruptFile}
                let bytes=try AES.GCM.open(AES.GCM.SealedBox(combined:Data(contentsOf:url)),using:key(placeholder,create:false),
                    authenticating:Data((placeholder.accountKey+"/"+name+"/native-offline-cleanup-fence/1").utf8))
                let fence=try JSONDecoder().decode(NativeOfflineDataFence.self,from:bytes)
                guard fence.valid,fence.namespace.matches(scope),fence.namespace.tripKey==name else{throw NativeOfflineTripError.corruptFile}
                if fence.cleanup {ids.insert(fence.namespace.tripID)}
            }
        }
        guard ids.count<=100 else{throw NativeOfflineTripError.storageUnavailable}
        return ids.sorted()
    }

    /// Physical inventory is closed over actual managed sources, with no cached payload read.
    func offlineDataInventory(_ namespace:NativeOfflineTripNamespace,scope:NativeDataScope)throws->NativeOfflineDataInventory {
        guard !defaults.bool(forKey:purgeKey),namespace.valid,namespace.matches(scope) else{throw NativeOfflineTripError.wrongNamespace}
        try checkOfflineDataDirectories(namespace)
        let folder=root.appendingPathComponent(namespace.accountKey,isDirectory:true)
        if try offlinePathExists(folder,directory:true) {
            for url in try FileManager.default.contentsOfDirectory(at:folder,includingPropertiesForKeys:nil)
                where url.lastPathComponent.hasPrefix(namespace.tripKey) {
                let allowed=NativeOfflineDataSource.allCases.map{namespace.tripKey+$0.suffix}+[
                    namespace.tripKey+".cleanup-fence.aesgcm",namespace.tripKey+".cleanup-receipt.aesgcm"]
                guard allowed.contains(url.lastPathComponent) else{throw NativeOfflineTripError.corruptFile}
                _ = try offlinePathExists(url)
            }
        }
        let indexed=try savedTripIDs(scope:scope).contains(namespace.tripID)
        var sources=Set<NativeOfflineDataSource>(),fingerprints=[indexed ? "indexed":"not-indexed"]
        for source in NativeOfflineDataSource.allCases {
            let url=folder.appendingPathComponent(namespace.tripKey+source.suffix)
            if try offlinePathExists(url) {
                let values=try url.resourceValues(forKeys:[.fileSizeKey])
                guard let size=values.fileSize,size>0,size<=200_100 else{throw NativeOfflineTripError.corruptFile}
                let bytes=try Data(contentsOf:url)
                guard bytes.count==size else{throw NativeOfflineTripError.storageUnavailable}
                sources.insert(source);fingerprints.append(source.rawValue+":"+NativeOfflineTripNamespace.digest(bytes))
            }
        }
        let fence=try offlineDataFence(namespace)
        let pending = try fence.map { value in
            if !value.cleanup {return false}
            return try readOfflineDataReceipt(namespace)?.operationID != value.operationID
        } ?? false
        fingerprints.append(fence?.operationID ?? "open")
        return .init(namespace:namespace,indexed:indexed,sources:sources,
            fingerprint:NativeOfflineTripNamespace.digest(Data(fingerprints.joined(separator:"\n").utf8)),fenced:pending)
    }
    /// The same MainActor transaction writes a durable fence BEFORE the original cleaner.
    /// A retry resumes this exact operation, rather than generating replacement consent.
    func cleanupOfflineData(_ namespace:NativeOfflineTripNamespace,scope:NativeDataScope,expectedFingerprint:String,operationID:String,now:Date=Date())throws->NativeOfflineDataCleanupReceipt {
        let inventory=try offlineDataInventory(namespace,scope:scope)
        let original=try offlineDataFence(namespace)
        if let original,original.operationID==operationID {
            if let receipt=try readOfflineDataReceipt(namespace),receipt.operationID==operationID {
                try verifyOfflineDataAbsence(namespace,scope:scope);return receipt
            }
        } else {
            guard !inventory.fenced,inventory.fingerprint==expectedFingerprint,
                  UUID(uuidString:operationID) != nil,(original?.generation ?? 0)<1_000_000 else{throw NativeOfflineTripError.versionConflict}
            let ids=try offlineDataSelectionIDs(scope:scope)
            guard ids.count<100 || ids.contains(namespace.tripID) else{throw NativeOfflineTripError.storageUnavailable}
            try prepare(namespace)
            let fence=NativeOfflineDataFence(schemaVersion:"native-offline-cleanup-fence/1",namespace:namespace,operationID:operationID,
                generation:(original?.generation ?? 0)+1,cleanup:true,startedAt:now)
            try writeEncrypted(JSONEncoder().encode(fence),namespace:namespace,suffix:".cleanup-fence.aesgcm",tag:"native-offline-cleanup-fence/1")
            guard try offlineDataFence(namespace)==fence else{throw NativeOfflineTripError.storageUnavailable}
        }
        try removeTripFiles(namespace,scope:scope)
        try verifyOfflineDataAbsence(namespace,scope:scope)
        let receipt=NativeOfflineDataCleanupReceipt(schemaVersion:"native-offline-cleanup-receipt/1",namespace:namespace,operationID:operationID,verifiedAt:now,absentSources:NativeOfflineDataSource.allCases)
        try writeEncrypted(JSONEncoder().encode(receipt),namespace:namespace,suffix:".cleanup-receipt.aesgcm",tag:"native-offline-cleanup-receipt/1")
        guard try offlineDataCleanupReceipt(namespace,scope:scope)==receipt else{throw NativeOfflineTripError.storageUnavailable}
        return receipt
    }
    func offlineDataCleanupReceipt(_ namespace:NativeOfflineTripNamespace,scope:NativeDataScope)throws->NativeOfflineDataCleanupReceipt? {
        guard namespace.valid,namespace.matches(scope),!defaults.bool(forKey:purgeKey) else{throw NativeOfflineTripError.wrongNamespace}
        try checkOfflineDataDirectories(namespace)
        guard let fence=try offlineDataFence(namespace),fence.cleanup,let receipt=try readOfflineDataReceipt(namespace),receipt.operationID==fence.operationID else{return nil}
        return receipt
    }
    private func readOfflineDataReceipt(_ namespace:NativeOfflineTripNamespace)throws->NativeOfflineDataCleanupReceipt? {
        guard let bytes=try readEncrypted(namespace:namespace,suffix:".cleanup-receipt.aesgcm",tag:"native-offline-cleanup-receipt/1") else{return nil}
        guard bytes.count<=4_096 else{throw NativeOfflineTripError.corruptFile}
        let receipt=try JSONDecoder().decode(NativeOfflineDataCleanupReceipt.self,from:bytes)
        guard receipt.valid,receipt.namespace==namespace else{throw NativeOfflineTripError.corruptFile}
        return receipt
    }
    func offlineDataPendingCleanup(_ namespace:NativeOfflineTripNamespace,scope:NativeDataScope)throws->NativeOfflineDataFence? {
        guard namespace.valid,namespace.matches(scope),!defaults.bool(forKey:purgeKey) else{throw NativeOfflineTripError.wrongNamespace}
        try checkOfflineDataDirectories(namespace)
        guard let fence=try offlineDataFence(namespace),fence.cleanup,try readOfflineDataReceipt(namespace)?.operationID != fence.operationID else{return nil}
        return fence
    }
    private func offlineDataFence(_ namespace:NativeOfflineTripNamespace)throws->NativeOfflineDataFence? {
        let url=root.appendingPathComponent(namespace.accountKey).appendingPathComponent(namespace.tripKey+".cleanup-fence.aesgcm")
        guard try offlinePathExists(url) else{return nil}
        guard let bytes=try readEncrypted(namespace:namespace,suffix:".cleanup-fence.aesgcm",tag:"native-offline-cleanup-fence/1"),bytes.count<=4_096 else{throw NativeOfflineTripError.corruptFile}
        let fence=try JSONDecoder().decode(NativeOfflineDataFence.self,from:bytes)
        guard fence.valid,fence.namespace==namespace else{throw NativeOfflineTripError.corruptFile}
        return fence
    }
    private func verifyOfflineDataAbsence(_ namespace:NativeOfflineTripNamespace,scope:NativeDataScope)throws {
        try checkOfflineDataDirectories(namespace)
        for source in NativeOfflineDataSource.allCases {
            guard try !offlinePathExists(root.appendingPathComponent(namespace.accountKey).appendingPathComponent(namespace.tripKey+source.suffix)) else{throw NativeOfflineTripError.storageUnavailable}
        }
        guard try !savedTripIDs(scope:scope).contains(namespace.tripID) else{throw NativeOfflineTripError.storageUnavailable}
    }
    private func checkOfflineDataAccess(_ namespace:NativeOfflineTripNamespace,scope:NativeDataScope)throws {
        guard !defaults.bool(forKey:purgeKey),namespace.valid,namespace.matches(scope) else{throw NativeOfflineTripError.wrongNamespace}
        try checkOfflineDataDirectories(namespace)
        if let fence=try offlineDataFence(namespace),fence.cleanup {
            guard try readOfflineDataReceipt(namespace)?.operationID==fence.operationID else{throw NativeOfflineTripError.authorityRequired}
        }
        for source in NativeOfflineDataSource.allCases {
            _ = try offlinePathExists(root.appendingPathComponent(namespace.accountKey).appendingPathComponent(namespace.tripKey+source.suffix))
        }
    }
    private func checkOfflineDataDirectories(_ namespace:NativeOfflineTripNamespace)throws {
        if try offlinePathExists(root,directory:true) {
            _ = try offlinePathExists(root.appendingPathComponent(namespace.accountKey),directory:true)
        }
    }
    /// ENOENT alone means absent. Permission failures and symlinks never become empty.
    private func offlinePathExists(_ url:URL,directory:Bool=false)throws->Bool {
        var info=stat()
        if lstat(url.path,&info)==0 {
            guard info.st_mode & S_IFMT == (directory ? S_IFDIR:S_IFREG) else{throw NativeOfflineTripError.storageUnavailable}
            return true
        }
        guard errno==ENOENT else{throw NativeOfflineTripError.storageUnavailable}
        return false
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
        try checkOfflineDataDirectories(placeholder)
        _ = try offlinePathExists(root.appendingPathComponent(placeholder.accountKey).appendingPathComponent("index.aesgcm"))
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
            case .reorderItems: throw NativeOfflineTripError.invalidInput
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
