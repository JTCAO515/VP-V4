import Foundation

struct NativeMemoryDeleteSelection:Codable,Equatable {
    struct Memory:Codable,Equatable {let memoryId:String;let revision:Int;let sourceReceiptId:String}
    let memories:[Memory]
    let consumerReferenceIds:[String]
    let artifactIds:[String]
    let generatedTurnIds:[String]
    let exportRequestIds:[String]
    var groups:[(String,[String],Int)] {[("consumerReferences",consumerReferenceIds,1000),("artifacts",artifactIds,1000),("generatedTurns",generatedTurnIds,1000),("exports",exportRequestIds,100)]}
    var valid:Bool {
        memories.count<=100 && memories.allSatisfy{NativeMemoryWire.uuid($0.memoryId) && NativeMemoryWire.uuid($0.sourceReceiptId) && (1...9_007_199_254_740_990).contains($0.revision)} &&
        memories.map(\.memoryId)==memories.map(\.memoryId).sorted() && Set(memories.map(\.memoryId)).count==memories.count &&
        groups.reduce(0){$0+$1.1.count}<=3100 && groups.allSatisfy{$0.1.count<=$0.2 && $0.1.allSatisfy(NativeMemoryWire.uuid) && $0.1==$0.1.sorted() && Set($0.1).count==$0.1.count}
    }
    static func shape(_ raw:Any?) -> Bool {
        guard let raw=raw as? [String:Any],Set(raw.keys)==Set(["memories","consumerReferenceIds","artifactIds","generatedTurnIds","exportRequestIds"]),let rows=raw["memories"] as? [[String:Any]],rows.allSatisfy({Set($0.keys)==Set(["memoryId","revision","sourceReceiptId"])}) else{return false};return true
    }
}
struct NativeMemoryDeletePlan:Decodable {
    static let conflicts=["SCOPE_TOO_LARGE","TERMINAL_MEMORY","FOREIGN_REFERENCE","ACTIVE_WORK","CROSS_SCOPE_REFERENCE"]
    static let retained=["FINANCIAL_RECORDS","USER_TRIP_INTENT","ORIGINAL_CHAT_INPUT","EXTERNAL_COPIES","PROVIDER_ERASURE_UNKNOWN","BACKUP_ERASURE_NOT_VERIFIED"]
    let kind:String;let planId:String;let sourceRevision:Int;let scopeDigest:String;let expiresAt:String
    let selection:NativeMemoryDeleteSelection;let counts:[String:Int];let conflicts:[String];let retained:[String]
    var reviewIdentity:String {planId+"|"+scopeDigest+"|"+String(sourceRevision)}
    static func decode(_ bytes:Data,selected:[NativeMemoryProfile],now:Date=Date()) throws -> Self {
        guard bytes.count<=512_000,let raw=try JSONSerialization.jsonObject(with:bytes) as? [String:Any],Set(raw.keys)==Set(["kind","planId","sourceRevision","scopeDigest","expiresAt","selection","counts","conflicts","retained"]),NativeMemoryDeleteSelection.shape(raw["selection"]) else{throw NativeDataError.invalidResponse}
        let result=try JSONDecoder().decode(Self.self,from:bytes)
        guard result.kind=="memory_delete_plan/1",NativeMemoryWire.uuid(result.planId),(1...9_007_199_254_740_990).contains(result.sourceRevision),NativeQualifiedDelegationRPC.digest(result.scopeDigest),let expires=NativeCoreDate.utc(result.expiresAt),expires>now,expires.timeIntervalSince(now)<=300,result.selection.valid,result.retained==Self.retained,
              Set(result.conflicts).count==result.conflicts.count,result.conflicts.allSatisfy(Self.conflicts.contains),Set(result.counts.keys)==Set(["memories","consumerReferences","artifacts","generatedTurns","exports"]),result.counts["memories"]==result.selection.memories.count,result.selection.groups.allSatisfy({result.counts[$0.0]==$0.1.count}) else{throw NativeDataError.invalidResponse}
        if result.conflicts.contains("SCOPE_TOO_LARGE") {
            guard result.conflicts==["SCOPE_TOO_LARGE"],result.selection.memories.isEmpty,result.selection.groups.allSatisfy({$0.1.isEmpty}) else{throw NativeDataError.invalidResponse}
        }else {
            guard (1...100).contains(selected.count),Set(result.selection.memories.map(\.memoryId))==Set(selected.map(\.id)),result.selection.memories.allSatisfy({m in selected.contains(where:{$0.id==m.memoryId && $0.revision==m.revision && $0.sourceReceiptId==m.sourceReceiptId})}) else{throw NativeDataError.invalidResponse}
        }
        return result
    }
}
struct NativeMemoryDeleteCommand:Codable,Equatable {
    let action:String
    let requestId:String
    let planId:String
    let scopeDigest:String
    let confirmed:Bool
    let selection:NativeMemoryDeleteSelection
    init(_ plan:NativeMemoryDeletePlan){action="confirm";requestId=UUID().uuidString.lowercased();planId=plan.planId;scopeDigest=plan.scopeDigest;confirmed=true;selection=plan.selection}
    var valid:Bool {action=="confirm" && NativeMemoryWire.uuid(requestId) && NativeMemoryWire.uuid(planId) && NativeQualifiedDelegationRPC.digest(scopeDigest) && confirmed && selection.valid && (1...100).contains(selection.memories.count)}
    static func decode(_ bytes:Data) throws -> Self {
        guard bytes.count<=192_000,let raw=try JSONSerialization.jsonObject(with:bytes) as? [String:Any],Set(raw.keys)==Set(["action","requestId","planId","scopeDigest","confirmed","selection"]),NativeMemoryDeleteSelection.shape(raw["selection"]) else{throw NativeDataError.invalidResponse}
        let result=try JSONDecoder().decode(Self.self,from:bytes);guard result.valid else{throw NativeDataError.invalidResponse};return result
    }
}
struct NativeMemoryDeleteReceipt:Decodable {
    struct Deleted:Decodable {let memoryId:String;let revision:Int}
    let kind:String;let requestId:String;let planId:String;let scope:String;let scopeDigest:String;let state:String
    let sourceTombstoned:Bool;let cleanupPending:Bool;let requestedAt:String;let completedAt:String?
    let selection:NativeMemoryDeleteSelection;let deletedRevisions:[Deleted];let erasedCounts:[String:Int]?
    let allUserDataCompleted:Bool;let retained:[String]
    static func decode(_ bytes:Data,command:NativeMemoryDeleteCommand) throws -> Self {
        guard command.valid,bytes.count<=512_000,let raw=try JSONSerialization.jsonObject(with:bytes) as? [String:Any],Set(raw.keys)==Set(["kind","requestId","planId","scope","scopeDigest","state","sourceTombstoned","cleanupPending","requestedAt","completedAt","selection","deletedRevisions","erasedCounts","allUserDataCompleted","retained"]),NativeMemoryDeleteSelection.shape(raw["selection"]),let deleted=raw["deletedRevisions"] as? [[String:Any]],deleted.allSatisfy({Set($0.keys)==Set(["memoryId","revision"])}) else{throw NativeDataError.invalidResponse}
        let result=try JSONDecoder().decode(Self.self,from:bytes)
        guard result.kind=="memory_delete_receipt/1",result.requestId==command.requestId,result.planId==command.planId,result.scope=="memory-bulk-delete-d4/1",result.scopeDigest==command.scopeDigest,result.selection==command.selection,result.sourceTombstoned,!result.allUserDataCompleted,result.retained==NativeMemoryDeletePlan.retained,NativeCoreDate.utc(result.requestedAt) != nil,
              result.deletedRevisions.map(\.memoryId)==command.selection.memories.map(\.memoryId),result.deletedRevisions.allSatisfy({d in command.selection.memories.contains(where:{$0.memoryId==d.memoryId && $0.revision+1==d.revision})}) else{throw NativeDataError.invalidResponse}
        if result.state=="queued"{guard result.cleanupPending,result.completedAt==nil,result.erasedCounts==nil else{throw NativeDataError.invalidResponse}}
        else{guard result.state=="completed",!result.cleanupPending,result.completedAt.flatMap(NativeCoreDate.utc) != nil,let counts=result.erasedCounts,Set(counts.keys)==Set(["consumerReferences","artifacts","generatedOutputs","exports","tickets"]),counts.values.allSatisfy({(0...9_007_199_254_740_991).contains($0)}),counts["consumerReferences"]==command.selection.consumerReferenceIds.count,counts["artifacts"]==command.selection.artifactIds.count,counts["generatedOutputs"]==command.selection.generatedTurnIds.count,counts["exports"]==command.selection.exportRequestIds.count else{throw NativeDataError.invalidResponse}}
        return result
    }
}
struct NativeMemoryDeleteJournal:Codable {
    let endpoint:String;let owner:String;let epoch:Int;let body:Data
    func matches(_ scope:NativeDataScope)->Bool{endpoint==scope.endpoint && owner==scope.subject && epoch==scope.mobileEpoch}
    func command() throws -> NativeMemoryDeleteCommand {try NativeMemoryDeleteCommand.decode(body)}
}
