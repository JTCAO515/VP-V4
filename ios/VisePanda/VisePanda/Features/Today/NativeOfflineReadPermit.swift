import CryptoKit
import CoreFoundation
import Foundation
import Darwin

/// Canonical bytes of the closed signed wire, matching the server contract.
enum NativeOfflineCanonicalJSON {
    static func data(_ value:Any)throws->Data {Data(try text(value).utf8)}
    private static func text(_ value:Any)throws->String {
        if let dictionary=value as? [String:Any] {
            guard dictionary.keys.allSatisfy({$0.unicodeScalars.allSatisfy{$0.value<128}}) else{throw NativeOfflineTripError.invalidInput}
            return "{"+(try dictionary.keys.sorted().map{quote($0)+":"+(try text(dictionary[$0]!))}).joined(separator:",")+"}"
        }
        if let array=value as? [Any] {return "["+(try array.map{textValue in try text(textValue)}).joined(separator:",")+"]"}
        if let string=value as? String {return quote(string)}
        if let number=value as? NSNumber {
            guard CFGetTypeID(number) != CFBooleanGetTypeID(),number.doubleValue.isFinite,number.doubleValue.rounded()==number.doubleValue,abs(number.doubleValue)<=9_007_199_254_740_991 else{throw NativeOfflineTripError.invalidInput}
            return String(number.int64Value)
        }
        throw NativeOfflineTripError.invalidInput
    }
    private static func quote(_ value:String)->String {
        var result="\""
        for scalar in value.unicodeScalars {
            switch scalar.value {
            case 34:result+="\\\""
            case 92:result+="\\\\"
            case 8:result+="\\b"
            case 12:result+="\\f"
            case 10:result+="\\n"
            case 13:result+="\\r"
            case 9:result+="\\t"
            case 0...31:result+=String(format:"\\u%04x",scalar.value)
            default:result+=String(scalar)
            }
        }
        return result+"\""
    }
}
struct NativeOfflineTextPayload:Codable,Equatable {
    struct Item:Codable,Identifiable,Equatable {let id:String;let title:String}
    struct Day:Codable,Identifiable,Equatable {let id:String;let date:String;let items:[Item]}
    let days:[Day]
}
struct NativeVerifiedOfflinePermit {
    let wire:Data
    let namespace:NativeOfflineTripNamespace
    let headVersion:Int
    let coverage:String
    let generation:Int
    let policyID:String
    let policyRevision:Int
    let issuedAt:Date
    let expiresAt:Date
    let serverTime:Date
    let requestNonce:String
    let payload:NativeOfflineTextPayload
    fileprivate init(wire:Data,namespace:NativeOfflineTripNamespace,headVersion:Int,coverage:String,generation:Int,policyID:String,policyRevision:Int,issuedAt:Date,expiresAt:Date,serverTime:Date,requestNonce:String,payload:NativeOfflineTextPayload) {
        self.wire=wire;self.namespace=namespace;self.headVersion=headVersion;self.coverage=coverage;self.generation=generation;self.policyID=policyID;self.policyRevision=policyRevision;self.issuedAt=issuedAt;self.expiresAt=expiresAt;self.serverTime=serverTime;self.requestNonce=requestNonce;self.payload=payload
    }
}
/// No key is discovered from the response or installed by this module. Production
/// defaults to no verifier keys and rejects success; test keys are explicit inputs.
struct NativeOfflinePermitVerifier {
    private let keys:[String:Data]
    init(trustedKeys:[String:Data]=[:]) {keys=trustedKeys}
    func verify(_ bytes:Data,namespace:NativeOfflineTripNamespace,headVersion:Int,nonce:String)throws->NativeVerifiedOfflinePermit {
        guard bytes.count<=128_000,let root=try JSONSerialization.jsonObject(with:bytes) as? [String:Any],Set(root.keys)==Set(["kind","subject","sessionEpoch","tripId","headVersion","coverage","sourceSemantics","generation","policyId","policyRevision","issuedAt","expiresAt","serverTime","requestNonce","fieldAllowlist","snapshotDigest","payload","proof"]),root["kind"] as? String=="offline_trip_read/1",
              namespace.valid,root["subject"] as? String==namespace.ownerID,root["tripId"] as? String==namespace.tripID,root["requestNonce"] as? String==nonce,NativeMemoryWire.uuid(nonce),positive(root["sessionEpoch"])==namespace.mobileEpoch,positive(root["headVersion"])==headVersion,
              root["sourceSemantics"] as? String=="controlled_user_text_submission",let generation=NativeFiveResultContent.integer(root["generation"],minimum:0,maximum:9_007_199_254_740_991),let coverage=root["coverage"] as? String,["partial","full"].contains(coverage),let policy=root["policyId"] as? String,!policy.isEmpty,policy.utf16.count<=128,let revision=positive(root["policyRevision"]),let issued=date(root["issuedAt"]),let expires=date(root["expiresAt"]),let server=date(root["serverTime"]),issued<=server,server<expires,
              root["fieldAllowlist"] as? [String]==["days.date","days.items.title"],let digest=root["snapshotDigest"] as? String,digest.range(of:"^[0-9a-f]{64}$",options:.regularExpression) != nil,
              let payload=root["payload"] as? [String:Any],Set(payload.keys)==Set(["days"]),let days=payload["days"] as? [[String:Any]],(1...60).contains(days.count),
              let proof=root["proof"] as? [String:Any],Set(proof.keys)==Set(["algorithm","keyId","signature"]),proof["algorithm"] as? String=="Ed25519",let keyID=proof["keyId"] as? String,!keyID.isEmpty,keyID.utf16.count<=128,
              let publicBytes=keys[keyID],publicBytes.count==32,keyID==Self.keyID(publicBytes),let signature=signature(proof["signature"]) else{throw NativeOfflineTripError.authorityRequired}
        var dayIDs=Set<String>(),itemIDs=Set<String>()
        for day in days {
            guard Set(day.keys)==Set(["id","date","items"]),let id=day["id"] as? String,id.range(of:"^[A-Za-z0-9_-]{1,64}$",options:.regularExpression) != nil,dayIDs.insert(id).inserted,let date=day["date"] as? String,NativeTravelIntake.validDates(.init(startDate:date,endDate:date)),let items=day["items"] as? [[String:Any]],items.count<=100 else{throw NativeOfflineTripError.invalidInput}
            for item in items {guard Set(item.keys)==Set(["id","title"]),let id=item["id"] as? String,id.range(of:"^[A-Za-z0-9_-]{1,64}$",options:.regularExpression) != nil,itemIDs.insert(id).inserted,let title=item["title"] as? String,!title.isEmpty,title.utf16.count<=2000 else{throw NativeOfflineTripError.invalidInput}}
        }
        guard NativeOfflineTripNamespace.digest(try NativeOfflineCanonicalJSON.data(payload))==digest else{throw NativeOfflineTripError.corruptFile}
        var signed=root;signed.removeValue(forKey:"proof")
        guard try Curve25519.Signing.PublicKey(rawRepresentation:publicBytes).isValidSignature(signature,for:NativeOfflineCanonicalJSON.data(signed)) else{throw NativeOfflineTripError.authorityRequired}
        return .init(wire:bytes,namespace:namespace,headVersion:headVersion,coverage:coverage,generation:generation,policyID:policy,policyRevision:revision,issuedAt:issued,expiresAt:expires,serverTime:server,requestNonce:nonce,payload:try JSONDecoder().decode(NativeOfflineTextPayload.self,from:JSONSerialization.data(withJSONObject:payload)))
    }
    static func keyID(_ rawPublicKey:Data)->String {
        let prefix=Data([0x30,0x2a,0x30,0x05,0x06,0x03,0x2b,0x65,0x70,0x03,0x21,0x00])
        return "ed25519:"+NativeOfflineTripNamespace.digest(prefix+rawPublicKey)
    }
    static var installed:Self {
        let configured=Bundle.main.infoDictionary?["VisePandaOfflineTrustedKeys"] as? [String:String] ?? [:]
        var trusted:[String:Data]=[:]
        for (id,value) in configured {if let raw=Data(base64Encoded:value),raw.count==32,id==keyID(raw){trusted[id]=raw}}
        return .init(trustedKeys:trusted)
    }
    private func positive(_ value:Any?)->Int?{NativeFiveResultContent.integer(value,maximum:9_007_199_254_740_991)}
    private func date(_ value:Any?)->Date? {guard let string=value as? String,string.range(of:#"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$"#,options:.regularExpression) != nil else{return nil};return NativeKnowledgeRead.date(string)}
    private func signature(_ value:Any?)->Data? {
        guard let string=value as? String,string.range(of:"^[A-Za-z0-9_-]+$",options:.regularExpression) != nil else{return nil}
        let base=string.replacingOccurrences(of:"-",with:"+").replacingOccurrences(of:"_",with:"/")
        guard let bytes=Data(base64Encoded:base+String(repeating:"=",count:(4-base.count%4)%4)),bytes.count==64,bytes.base64EncodedString().replacingOccurrences(of:"+",with:"-").replacingOccurrences(of:"/",with:"_").replacingOccurrences(of:"=",with:"")==string else{return nil};return bytes
    }
}
struct NativeOfflineCachedText:Codable {
    let namespace:NativeOfflineTripNamespace
    let headVersion:Int
    let bootIdentity:String
    let expiresAt:Date
    let generation:Int
    let policyID:String
    let policyRevision:Int
    let coverage:String
    let payloadDigest:String
    let wire:Data
    let nonce:String
    let savedAt:Date
    var lastObservedAt:Date
    let requestStartedUptime:TimeInterval
    let deadlineUptime:TimeInterval
    var lastObservedUptime:TimeInterval
    init(permit:NativeVerifiedOfflinePermit,requestStarted:TimeInterval,now:Date,uptime:TimeInterval,bootIdentity:String?)throws {
        let elapsed=uptime-requestStarted,remaining=permit.expiresAt.timeIntervalSince(permit.serverTime)-elapsed
        guard elapsed>=0,remaining>0,remaining.isFinite,now>=permit.serverTime,now<permit.expiresAt,let bootIdentity,!bootIdentity.isEmpty else{throw NativeOfflineTripError.authorityRequired}
        namespace=permit.namespace;headVersion=permit.headVersion;self.bootIdentity=bootIdentity;expiresAt=permit.expiresAt;generation=permit.generation;policyID=permit.policyID;policyRevision=permit.policyRevision;coverage=permit.coverage;payloadDigest=NativeOfflineTripNamespace.digest(try NativeOfflineCanonicalJSON.data(JSONSerialization.jsonObject(with:JSONEncoder().encode(permit.payload))));wire=permit.wire;nonce=permit.requestNonce;savedAt=now;lastObservedAt=now;requestStartedUptime=requestStarted;deadlineUptime=uptime+remaining;lastObservedUptime=uptime
    }
    func currentPayload(verifier:NativeOfflinePermitVerifier,scope:NativeDataScope,now:Date,uptime:TimeInterval,bootIdentity:String?)throws->NativeOfflineTextPayload {
        guard self.bootIdentity==bootIdentity,namespace.matches(scope),now>=lastObservedAt,uptime>=lastObservedUptime,uptime>=requestStartedUptime,uptime<deadlineUptime else{throw NativeOfflineTripError.authorityRequired}
        let permit=try verifier.verify(wire,namespace:namespace,headVersion:headVersion,nonce:nonce)
        guard now>=permit.serverTime,now<permit.expiresAt else{throw NativeOfflineTripError.authorityRequired};return permit.payload
    }
}

enum NativeOfflineBootIdentity {
    static func current()->String? {
        var value=timeval();var size=MemoryLayout<timeval>.size
        guard sysctlbyname("kern.boottime",&value,&size,nil,0)==0,size==MemoryLayout<timeval>.size,value.tv_sec>0 else{return nil}
        return "\(value.tv_sec):\(value.tv_usec)"
    }
}
