import Foundation

struct NativeLinkedTripDeleteSets:Codable,Equatable {
    let threadIds:[String];let turnIds:[String];let taskIds:[String];let goalIds:[String];let messageIds:[String];let artifactIds:[String];let exportRequestIds:[String]
    var groups:[(key:String,ids:[String],cap:Int)]{[("threads",threadIds,100),("turns",turnIds,1000),("tasks",taskIds,1000),("goals",goalIds,1000),("messages",messageIds,1000),("artifacts",artifactIds,1000),("exports",exportRequestIds,100)]}
    var valid:Bool{groups.reduce(0){$0+$1.ids.count}<=4100 && groups.allSatisfy{group in group.ids.count<=group.cap && group.ids.allSatisfy(NativeMemoryWire.uuid) && Set(group.ids).count==group.ids.count && group.ids==group.ids.sorted()}}
    static let keys:Set<String>=["threadIds","turnIds","taskIds","goalIds","messageIds","artifactIds","exportRequestIds"]
}
struct NativeLinkedTripDeletePlan:Decodable {
    let kind:String;let planId:String;let tripId:String;let title:String;let expectedVersion:Int;let scopeDigest:String;let expiresAt:String;let selection:NativeLinkedTripDeleteSets;let counts:[String:Int];let conflicts:[String];let retained:[String]
    static let conflictCodes=["SCOPE_TOO_LARGE","SHARED_OR_FOREIGN_CHAT","SHARED_TASK","SHARED_GOAL","SHARED_MESSAGE","SHARED_ARTIFACT","ACTIVE_WORK","CROSS_SCOPE_REFERENCE"]
    static let retainedCodes=["FINANCIAL_LEDGER_MINIMUM","TASK_CAPACITY_MINIMUM","EXTERNAL_DOWNLOADED_COPIES","PROVIDER_COPIES_NOT_ERASED","BACKUP_ERASURE_NOT_VERIFIED"]
    var reviewIdentity:String {planId+"|"+scopeDigest+"|"+String(expectedVersion)+"|"+selection.groups.map{$0.key+":"+$0.ids.joined(separator:",")}.joined(separator:";")}
    static func decode(_ bytes:Data,target:NativeLinkedTripDeleteSelection,now:Date=Date())throws->Self {
        guard bytes.count<=512_000,let root=try JSONSerialization.jsonObject(with:bytes) as? [String:Any],Set(root.keys)==Set(["kind","planId","tripId","title","expectedVersion","scopeDigest","expiresAt","selection","counts","conflicts","retained"]),let ids=root["selection"] as? [String:Any],Set(ids.keys)==NativeLinkedTripDeleteSets.keys else{throw NativeDataError.invalidResponse}
        let value=try JSONDecoder().decode(Self.self,from:bytes)
        guard value.kind=="linked_trip_delete_plan/1",NativeMemoryWire.uuid(value.planId),value.tripId==target.tripID,value.expectedVersion==target.headVersion,!value.title.isEmpty,value.title.utf16.count<=2000,NativeQualifiedDelegationRPC.digest(value.scopeDigest),let expiry=NativeCoreDate.utc(value.expiresAt),expiry>now,expiry.timeIntervalSince(now)<=300,value.selection.valid,
              Set(value.counts.keys)==Set(value.selection.groups.map(\.key)),value.selection.groups.allSatisfy({value.counts[$0.key]==$0.ids.count}),Set(value.conflicts).count==value.conflicts.count,value.conflicts.allSatisfy(Self.conflictCodes.contains),value.retained==Self.retainedCodes else{throw NativeDataError.invalidResponse}
        if value.conflicts.contains("SCOPE_TOO_LARGE"){guard value.conflicts==["SCOPE_TOO_LARGE"],value.selection.groups.allSatisfy({$0.ids.isEmpty}) else{throw NativeDataError.invalidResponse}}
        return value
    }
}
struct NativeLinkedTripDeleteRequest:Codable,Equatable {
    let action="confirm"
    let requestId:String;let planId:String;let scopeDigest:String;let expectedVersion:Int;let confirmed=true;let selection:NativeLinkedTripDeleteSets
    enum CodingKeys:String,CodingKey{case action,requestId,planId,scopeDigest,expectedVersion,confirmed,selection}
    init(plan:NativeLinkedTripDeletePlan,requestID:String=UUID().uuidString.lowercased()){requestId=requestID;planId=plan.planId;scopeDigest=plan.scopeDigest;expectedVersion=plan.expectedVersion;selection=plan.selection}
    func encode(to encoder:Encoder)throws{var c=encoder.container(keyedBy:CodingKeys.self);try c.encode(action,forKey:.action);try c.encode(requestId,forKey:.requestId);try c.encode(planId,forKey:.planId);try c.encode(scopeDigest,forKey:.scopeDigest);try c.encode(expectedVersion,forKey:.expectedVersion);try c.encode(confirmed,forKey:.confirmed);try c.encode(selection,forKey:.selection)}
}
struct NativeLinkedTripDeleteReceipt:Decodable {
    let kind:String;let requestId:String;let planId:String;let tripId:String;let scope:String;let scopeDigest:String;let state:String;let requestedAt:String;let completedAt:String?;let selection:NativeLinkedTripDeleteSets;let erasedCounts:[String:Int]?;let allUserDataCompleted:Bool;let retained:[String]
    static func decode(_ bytes:Data,request:NativeLinkedTripDeleteRequest,tripID:String)throws->Self {
        guard bytes.count<=512_000,let root=try JSONSerialization.jsonObject(with:bytes) as? [String:Any],Set(root.keys)==Set(["kind","requestId","planId","tripId","scope","scopeDigest","state","requestedAt","completedAt","selection","erasedCounts","allUserDataCompleted","retained"]),let ids=root["selection"] as? [String:Any],Set(ids.keys)==NativeLinkedTripDeleteSets.keys else{throw NativeDataError.invalidResponse}
        let value=try JSONDecoder().decode(Self.self,from:bytes)
        guard value.kind=="linked_trip_delete_receipt/1",value.requestId==request.requestId,value.planId==request.planId,value.tripId==tripID,value.scope=="trip-linked-chat-d3/1",value.scopeDigest==request.scopeDigest,value.selection==request.selection,value.selection.valid,!value.allUserDataCompleted,value.retained==NativeLinkedTripDeletePlan.retainedCodes,NativeCoreDate.utc(value.requestedAt) != nil else{throw NativeDataError.invalidResponse}
        if value.state=="queued"{guard value.completedAt==nil,value.erasedCounts==nil else{throw NativeDataError.invalidResponse}}
        else{guard value.state=="completed",value.completedAt.flatMap(NativeCoreDate.utc) != nil,let counts=value.erasedCounts,Set(counts.keys)==Set(["threads","turns","goals","messages","artifacts","textBodies","groundedRows","planningRows","consumerReferences","exports","tickets"]),counts.values.allSatisfy({(0...9_007_199_254_740_991).contains($0)}) else{throw NativeDataError.invalidResponse}}
        return value
    }
}
enum NativeCoreDate {
    static func utc(_ s:String)->Date?{guard s.range(of:#"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$"#,options:.regularExpression) != nil else{return nil};return NativeKnowledgeRead.date(s)}
}

struct NativeLinkedTripDeleteJournal:Codable {
    static let maximumBytes=262_144 // 192000 raw-body bytes encode to256000 base64 plus bounded namespace fields.
    let endpoint:String;let owner:String;let epoch:Int;let tripID:String;let body:Data
    func decodedRequest()throws->NativeLinkedTripDeleteRequest {
        guard body.count<=192_000,let raw=try JSONSerialization.jsonObject(with:body) as? [String:Any],Set(raw.keys)==Set(["action","requestId","planId","scopeDigest","expectedVersion","confirmed","selection"]),raw["action"] as? String=="confirm",raw["confirmed"] as? Bool==true,let sets=raw["selection"] as? [String:Any],Set(sets.keys)==NativeLinkedTripDeleteSets.keys else{throw NativeDataError.invalidResponse}
        let request=try JSONDecoder().decode(NativeLinkedTripDeleteRequest.self,from:body)
        guard NativeMemoryWire.uuid(request.requestId),NativeMemoryWire.uuid(request.planId),NativeQualifiedDelegationRPC.digest(request.scopeDigest),(0...999_999_999).contains(request.expectedVersion),request.selection.valid else{throw NativeDataError.invalidResponse};return request
    }
    func matches(_ selected:NativeLinkedTripDeleteSelection)throws->Bool{let request=try decodedRequest();return endpoint==selected.scope.endpoint && owner==selected.scope.subject && epoch==selected.scope.mobileEpoch && tripID==selected.tripID && request.expectedVersion==selected.headVersion}
    static func validateReplacement(existing:Self?,incoming:Self)throws {
        _=try incoming.decodedRequest()
        guard let existing else{return}
        let previous=try existing.decodedRequest(),next=try incoming.decodedRequest()
        guard existing.endpoint==incoming.endpoint,existing.owner==incoming.owner,existing.epoch==incoming.epoch,existing.tripID==incoming.tripID,previous==next,existing.body==incoming.body else{throw NativeDataError.server(code:"LINKED_DELETION_RECOVERY_REQUIRED")}
    }
}
