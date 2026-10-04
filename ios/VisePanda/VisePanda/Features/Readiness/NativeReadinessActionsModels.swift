import Foundation

enum NativeReadinessScenario:String,Codable,CaseIterable,Identifiable {
    case connectivity,payment,admission,address,transport
    var id:String{rawValue}
    func label(chinese:Bool)->String {
        switch self {
        case .connectivity:chinese ? "网络与手机":"Phone and connectivity"
        case .payment:chinese ? "支付准备":"Payment preparation"
        case .admission:chinese ? "入场准备":"Admission preparation"
        case .address:chinese ? "地址核对":"Address check"
        case .transport:chinese ? "交通准备":"Transport preparation"
        }
    }
}
enum NativeReadinessKnowledgeState:String,Decodable {case available,unknown}
enum NativeReadinessUserState:String,Decodable {case unknown,satisfied,notSatisfied="not_satisfied",notApplicable="not_applicable"}
enum NativeReadinessTimingState:String,Decodable {case now,notYet="not_yet",unknown,notApplicable="not_applicable"}
struct NativeReadinessTaskBasis:Codable,Equatable {
    let taskId:String;let taskTurnId:String;let conversationId:String;let goalId:String;let goalVersion:Int;let tripId:String;let tripVersion:Int;let dateBasis:String;let taskBasisDigest:String
    static let keys:Set<String>=["taskId","taskTurnId","conversationId","goalId","goalVersion","tripId","tripVersion","dateBasis","taskBasisDigest"]
    var valid:Bool{[taskId,taskTurnId,conversationId,goalId,tripId].allSatisfy(NativeMemoryWire.uuid) && goalVersion>0 && tripVersion>=0 && [dateBasis,taskBasisDigest].allSatisfy(NativeQualifiedDelegationRPC.digest)}
}
struct NativeReadinessActionBasis:Codable,Equatable {
    let taskId:String;let taskTurnId:String;let conversationId:String;let goalId:String;let goalVersion:Int;let tripId:String;let tripVersion:Int;let dateBasis:String;let taskBasisDigest:String
    let declarationRevision:Int;let ruleVersion:String;let ontologyVersion:String;let evidenceDigest:String
    var valid:Bool{[taskId,taskTurnId,conversationId,goalId,tripId].allSatisfy(NativeMemoryWire.uuid) && goalVersion>0 && tripVersion>=0 && declarationRevision>=0 && ruleVersion=="readiness-actions/1" && !ontologyVersion.isEmpty && ontologyVersion.utf8.count<=256 && [dateBasis,taskBasisDigest,evidenceDigest].allSatisfy(NativeQualifiedDelegationRPC.digest)}
    static let keys=NativeReadinessTaskBasis.keys.union(["declarationRevision","ruleVersion","ontologyVersion","evidenceDigest"])
}
struct NativeReadinessDeclaration:Codable,Equatable {
    let scenario:NativeReadinessScenario;let city:String;let locale:String;let subjectId:String?;let applies:String;let resourcesReady:String;let conditionsChecked:String;let checkAt:String
    var valid:Bool{NativeKnowledgeSelection.cities.contains(city) && ["zh","en"].contains(locale) && (subjectId==nil || subjectId?.range(of:#"^[a-z][a-z0-9_-]{0,127}$"#,options:.regularExpression) != nil) && [applies,resourcesReady,conditionsChecked].allSatisfy{["unknown","yes","no"].contains($0)} && (["now","unknown"].contains(checkAt) || NativeKnowledgeRead.date(checkAt) != nil)}
    static let keys:Set<String>=["scenario","city","locale","subjectId","applies","resourcesReady","conditionsChecked","checkAt"]
    enum CodingKeys:String,CodingKey{case scenario,city,locale,subjectId,applies,resourcesReady,conditionsChecked,checkAt}
    func encode(to encoder:Encoder)throws{var c=encoder.container(keyedBy:CodingKeys.self);try c.encode(scenario,forKey:.scenario);try c.encode(city,forKey:.city);try c.encode(locale,forKey:.locale);if let subjectId{try c.encode(subjectId,forKey:.subjectId)}else{try c.encodeNil(forKey:.subjectId)};try c.encode(applies,forKey:.applies);try c.encode(resourcesReady,forKey:.resourcesReady);try c.encode(conditionsChecked,forKey:.conditionsChecked);try c.encode(checkAt,forKey:.checkAt)}
}
struct NativeReadinessEvidence:Decodable {
    let factId:String;let publicationVersion:Int;let assertionId:String;let assertionRevision:Int;let text:String;let conditions:[String];let exclusions:[String];let sources:[Source];let expiresAt:String
    struct Source:Decodable {let sourceRevisionId:String;let publisher:String;let uri:String;let locator:String;var url:URL?{guard let url=URL(string:uri),["https","http"].contains(url.scheme),url.host != nil,url.user==nil,url.password==nil else{return nil};return url}}
    var valid:Bool{NativeMemoryWire.uuid(factId) && NativeMemoryWire.uuid(assertionId) && publicationVersion>0 && assertionRevision>0 && !text.isEmpty && text.utf8.count<=16000 && conditions.count<=100 && exclusions.count<=100 && sources.count<=100 && sources.allSatisfy{NativeMemoryWire.uuid($0.sourceRevisionId) && $0.url != nil} && NativeKnowledgeRead.date(expiresAt).map{$0>Date()}==true}
}
struct NativeReadinessAction:Decodable,Identifiable {
    enum Kind:String,Decodable{case readMaterial="read_material",verifyEntry="verify_entry",conditionalCandidate="conditional_candidate",tripProposal="trip_proposal"}
    var id:String{actionId};let kind:Kind;let actionId:String;let basis:NativeReadinessActionBasis
    let target:String?;let factId:String?;let publicationVersion:Int?;let sourceRevisionId:String?;let subjectId:String?;let proposalId:String?;let proposalRevision:Int?;let proposalDigest:String?
    static func decode(_ raw:Any,basis:NativeReadinessActionBasis)throws->Self {
        guard basis.valid,let row=raw as? [String:Any],let kind=row["kind"] as? String,let b=row["basis"] as? [String:Any],Set(b.keys)==NativeReadinessActionBasis.keys else{throw NativeDataError.invalidResponse}
        let extra:Set<String>
        switch kind{case "read_material":extra=["factId","publicationVersion","sourceRevisionId"];case "verify_entry":extra=["target","factId","publicationVersion","sourceRevisionId"];case "conditional_candidate":extra=["subjectId","factId","publicationVersion"];case "trip_proposal":extra=["proposalId","proposalRevision","proposalDigest"];default:throw NativeDataError.invalidResponse}
        guard Set(row.keys)==Set(["kind","actionId","basis"]).union(extra) else{throw NativeDataError.invalidResponse}
        let result=try JSONDecoder().decode(Self.self,from:JSONSerialization.data(withJSONObject:row));guard result.basis==basis,NativeQualifiedDelegationRPC.digest(result.actionId) else{throw NativeDataError.invalidResponse}
        switch result.kind {
        case .readMaterial:guard result.factId.map(NativeMemoryWire.uuid)==true,(result.publicationVersion ?? 0)>0,result.sourceRevisionId.map(NativeMemoryWire.uuid)==true else{throw NativeDataError.invalidResponse}
        case .verifyEntry:guard ["declaration","sources"].contains(result.target ?? ""),result.factId==nil ? result.publicationVersion==nil && result.sourceRevisionId==nil : result.factId.map(NativeMemoryWire.uuid)==true && (result.publicationVersion ?? 0)>0 && result.sourceRevisionId.map(NativeMemoryWire.uuid)==true else{throw NativeDataError.invalidResponse}
        case .conditionalCandidate:guard result.subjectId?.range(of:#"^[a-z][a-z0-9_-]{0,127}$"#,options:.regularExpression) != nil,result.factId.map(NativeMemoryWire.uuid)==true,(result.publicationVersion ?? 0)>0 else{throw NativeDataError.invalidResponse}
        case .tripProposal:guard result.proposalId.map(NativeMemoryWire.uuid)==true,(result.proposalRevision ?? 0)>0,result.proposalDigest.map(NativeQualifiedDelegationRPC.digest)==true else{throw NativeDataError.invalidResponse}
        };return result
    }
}
struct NativeReadinessAssessment:Decodable {
    let schemaVersion:String;let basis:NativeReadinessTaskBasis;let scenario:NativeReadinessScenario;let ruleVersion:String;let ontologyVersion:String;let declarationRevision:Int;let assessmentDigest:String;let evaluatedAt:String;let expiresAt:String
    let knowledgeAvailability:NativeReadinessKnowledgeState;let userReadiness:NativeReadinessUserState;let actionTiming:NativeReadinessTimingState;let declaration:NativeReadinessDeclaration;let declarationBasis:String;let declarationState:String;let evidence:[NativeReadinessEvidence];let actions:[NativeReadinessAction]
    var actionBasis:NativeReadinessActionBasis?{actions.first?.basis}
    static func decode(_ bytes:Data,taskId:String,tripId:String,tripVersion:Int,selection:NativeReadinessDeclaration)throws->Self {
        guard bytes.count<=256000,let root=try JSONSerialization.jsonObject(with:bytes) as? [String:Any],Set(root.keys)==Set(["data"]),let r=root["data"] as? [String:Any],Set(r.keys)==Set(["schemaVersion","basis","scenario","ruleVersion","ontologyVersion","declarationRevision","assessmentDigest","evaluatedAt","expiresAt","knowledgeAvailability","userReadiness","actionTiming","declaration","declarationBasis","declarationState","evidence","actions"]),let b=r["basis"] as? [String:Any],Set(b.keys)==NativeReadinessTaskBasis.keys,let d=r["declaration"] as? [String:Any],Set(d.keys)==NativeReadinessDeclaration.keys,let actions=r["actions"] as? [Any],actions.count<=4 else{throw NativeDataError.invalidResponse}
        let value=try JSONDecoder().decode(Self.self,from:JSONSerialization.data(withJSONObject:r))
        guard value.schemaVersion=="readiness/2",value.basis.valid,value.basis.taskId==taskId,value.basis.tripId==tripId,value.basis.tripVersion==tripVersion,value.ruleVersion=="readiness-actions/1",!value.ontologyVersion.isEmpty,value.ontologyVersion.utf8.count<=256,value.declarationRevision>=0,value.declaration.valid,value.scenario==selection.scenario,value.declaration.scenario==selection.scenario,value.declaration.city==selection.city,value.declaration.locale==selection.locale,value.declaration.subjectId==selection.subjectId,value.declarationBasis=="explicit_user_report",["empty","current","stale"].contains(value.declarationState),NativeQualifiedDelegationRPC.digest(value.assessmentDigest),let evaluated=NativeKnowledgeRead.date(value.evaluatedAt),let expires=NativeKnowledgeRead.date(value.expiresAt),expires>evaluated,expires.timeIntervalSince(evaluated)<=30,expires>Date(),value.evidence.count<=50,value.evidence.allSatisfy(\.valid),(value.knowledgeAvailability == .available ? !value.evidence.isEmpty:value.evidence.isEmpty) else{throw NativeDataError.invalidResponse}
        if value.declarationState != "current" {guard [value.declaration.applies,value.declaration.resourcesReady,value.declaration.conditionsChecked].allSatisfy({$0=="unknown"}),value.declaration.checkAt=="unknown" else{throw NativeDataError.invalidResponse}}
        if value.userReadiness == .notApplicable{guard value.actionTiming == .notApplicable,value.actions.isEmpty else{throw NativeDataError.invalidResponse}}
        if value.knowledgeAvailability == .unknown,value.userReadiness != .notApplicable{guard value.userReadiness == .unknown else{throw NativeDataError.invalidResponse}}
        if let actionBasis=value.actionBasis {
            let b=value.basis
            guard actionBasis.valid,actionBasis.taskId==b.taskId,actionBasis.taskTurnId==b.taskTurnId,actionBasis.conversationId==b.conversationId,actionBasis.goalId==b.goalId,actionBasis.goalVersion==b.goalVersion,actionBasis.tripId==b.tripId,actionBasis.tripVersion==b.tripVersion,actionBasis.dateBasis==b.dateBasis,actionBasis.taskBasisDigest==b.taskBasisDigest,actionBasis.declarationRevision==value.declarationRevision,actionBasis.ruleVersion==value.ruleVersion,actionBasis.ontologyVersion==value.ontologyVersion else{throw NativeDataError.invalidResponse}
            for raw in actions{_=try NativeReadinessAction.decode(raw,basis:actionBasis)}
        }else{guard value.userReadiness == .notApplicable || value.userReadiness == .satisfied else{throw NativeDataError.invalidResponse}}
        guard Set(value.actions.map(\.id)).count==actions.count else{throw NativeDataError.invalidResponse};return value
    }
}
@MainActor enum NativeReadinessActionRoute:Equatable {
    case material(factID:String,version:Int,sourceID:String)
    case verification(target:String,factID:String?,version:Int?,sourceID:String?)
    case candidate(subject:String,factID:String,version:Int)
    case proposal(id:String,revision:Int,digest:String)
    static func resolve(_ action:NativeReadinessAction,current:NativeReadinessActionBasis?,foreground:Bool,now:Date,expiresAt:Date)throws->Self {
        guard foreground,expiresAt>now,current==action.basis,action.basis.valid else{throw NativeDataError.staleSessionResponse}
        switch action.kind {
        case .readMaterial:guard let fact=action.factId,let version=action.publicationVersion,let source=action.sourceRevisionId else{throw NativeDataError.invalidResponse};return .material(factID:fact,version:version,sourceID:source)
        case .verifyEntry:return .verification(target:action.target ?? "sources",factID:action.factId,version:action.publicationVersion,sourceID:action.sourceRevisionId)
        case .conditionalCandidate:guard let subject=action.subjectId,let fact=action.factId,let version=action.publicationVersion else{throw NativeDataError.invalidResponse};return .candidate(subject:subject,factID:fact,version:version)
        case .tripProposal:guard let id=action.proposalId,let version=action.proposalRevision,let digest=action.proposalDigest else{throw NativeDataError.invalidResponse};return .proposal(id:id,revision:version,digest:digest)
        }
    }
}

struct NativeReadinessExecution:Decodable {
    struct Result:Decodable{let kind:String;let evidence:NativeReadinessEvidence?;let target:String?;let sources:[NativeReadinessEvidence.Source]?;let subjectId:String?;let proposalId:String?;let proposalRevision:Int?;let proposalDigest:String?}
    let kind:String;let actionId:String;let basis:NativeReadinessActionBasis;let result:Result
    static func decode(_ bytes:Data,action:NativeReadinessAction)throws->Self {
        guard bytes.count<=256000,let root=try JSONSerialization.jsonObject(with:bytes) as? [String:Any],Set(root.keys)==Set(["data"]),let raw=root["data"] as? [String:Any],Set(raw.keys)==Set(["kind","actionId","basis","result"]),let b=raw["basis"] as? [String:Any],Set(b.keys)==NativeReadinessActionBasis.keys,let result=raw["result"] as? [String:Any] else{throw NativeDataError.invalidResponse}
        let value=try JSONDecoder().decode(Self.self,from:JSONSerialization.data(withJSONObject:raw));guard value.kind=="readiness_action/1",value.actionId==action.actionId,value.basis==action.basis else{throw NativeDataError.invalidResponse}
        switch action.kind {
        case .readMaterial:guard Set(result.keys)==Set(["kind","evidence"]),value.result.kind=="material",value.result.evidence?.valid==true,value.result.evidence?.factId==action.factId,value.result.evidence?.publicationVersion==action.publicationVersion,value.result.evidence?.sources.contains(where:{$0.sourceRevisionId==action.sourceRevisionId})==true else{throw NativeDataError.invalidResponse}
        case .verifyEntry:guard Set(result.keys)==Set(["kind","target","sources"]),value.result.kind=="verification_entry",value.result.target==action.target,(value.result.sources?.count ?? 101)<=100,value.result.sources?.allSatisfy({NativeMemoryWire.uuid($0.sourceRevisionId) && $0.url != nil})==true else{throw NativeDataError.invalidResponse}
        case .conditionalCandidate:guard Set(result.keys)==Set(["kind","subjectId","evidence"]),value.result.kind=="conditional_candidate",value.result.subjectId==action.subjectId,value.result.evidence?.valid==true,value.result.evidence?.factId==action.factId,value.result.evidence?.publicationVersion==action.publicationVersion else{throw NativeDataError.invalidResponse}
        case .tripProposal:guard Set(result.keys)==Set(["kind","proposalId","proposalRevision","proposalDigest"]),value.result.kind=="trip_proposal_reference",value.result.proposalId==action.proposalId,value.result.proposalRevision==action.proposalRevision,value.result.proposalDigest==action.proposalDigest else{throw NativeDataError.invalidResponse}
        };return value
    }
}
struct NativeReadinessInput {
    static func body(operation:String,taskId:String,tripVersion:Int,selection:NativeReadinessDeclaration,assessment:NativeReadinessAssessment?=nil,operationId:String?=nil,action:NativeReadinessAction?=nil)throws->Data {
        guard NativeMemoryWire.uuid(taskId),tripVersion>=0,selection.valid,["read","save","execute"].contains(operation) else{throw NativeDataError.invalidResponse}
        var raw:[String:Any]=["schemaVersion":"readiness-request/2","operation":operation,"taskId":taskId,"expectedTripVersion":tripVersion,"scenario":selection.scenario.rawValue,"city":selection.city,"locale":selection.locale,"subjectId":selection.subjectId as Any? ?? NSNull()]
        if operation != "read" {
            guard let assessment,assessment.basis.taskId==taskId,assessment.basis.tripVersion==tripVersion else{throw NativeDataError.invalidResponse}
            raw["expectedRevision"]=assessment.declarationRevision;raw["expectedBasis"]=try JSONSerialization.jsonObject(with:JSONEncoder().encode(assessment.basis))
            if operation=="save"{guard let operationId,NativeMemoryWire.uuid(operationId) else{throw NativeDataError.invalidResponse};raw["operationId"]=operationId;raw["declaration"]=try JSONSerialization.jsonObject(with:JSONEncoder().encode(selection))}
            else{guard let action,action.basis==assessment.actionBasis else{throw NativeDataError.invalidResponse};raw["actionId"]=action.actionId;raw["assessmentDigest"]=assessment.assessmentDigest}
        }
        let bytes=try JSONSerialization.data(withJSONObject:raw,options:.sortedKeys);guard bytes.count<=16000 else{throw NativeDataError.invalidResponse};return bytes
    }
}

struct NativeReadinessPendingSave:Codable {
    let endpoint:String;let owner:String;let epoch:Int;let tripId:String;let taskId:String;let body:Data
    func matches(_ actor:NativeDataScope)->Bool{endpoint==actor.endpoint && owner==actor.subject && epoch==actor.mobileEpoch}
    func parsed()throws->(basis:NativeReadinessTaskBasis,selection:NativeReadinessDeclaration) {
        guard NativeMemoryWire.uuid(tripId),NativeMemoryWire.uuid(taskId),body.count<=16000,let raw=try JSONSerialization.jsonObject(with:body) as? [String:Any],Set(raw.keys)==Set(["schemaVersion","operation","taskId","expectedTripVersion","scenario","city","locale","subjectId","operationId","expectedRevision","expectedBasis","declaration"]),raw["schemaVersion"] as? String=="readiness-request/2",raw["operation"] as? String=="save",raw["taskId"] as? String==taskId,let op=raw["operationId"] as? String,NativeMemoryWire.uuid(op),let revision=raw["expectedRevision"] as? Int,revision>=0,let basis=raw["expectedBasis"] as? [String:Any],Set(basis.keys)==NativeReadinessTaskBasis.keys,let declaration=raw["declaration"] as? [String:Any],Set(declaration.keys)==NativeReadinessDeclaration.keys else{throw NativeDataError.invalidResponse}
        let b=try JSONDecoder().decode(NativeReadinessTaskBasis.self,from:JSONSerialization.data(withJSONObject:basis)),d=try JSONDecoder().decode(NativeReadinessDeclaration.self,from:JSONSerialization.data(withJSONObject:declaration))
        guard b.valid,b.tripId==tripId,b.taskId==taskId,raw["expectedTripVersion"] as? Int==b.tripVersion,d.valid,raw["scenario"] as? String==d.scenario.rawValue,raw["city"] as? String==d.city,raw["locale"] as? String==d.locale,(raw["subjectId"] as? String)==d.subjectId else{throw NativeDataError.invalidResponse};return(b,d)
    }
}

struct NativeReadinessTaskOption:Decodable,Identifiable {
    var id:String{taskId};let taskId:String;let tripVersion:Int;let goalId:String;let goalVersion:Int;let conversationId:String;let label:String
}
enum NativeReadinessTaskDiscovery {
    case reference(String)
    case options([NativeReadinessTaskOption])
    case unavailable
    static func decode(_ bytes:Data,tripId:String,tripVersion:Int)throws->Self {
        guard bytes.count<=256000,let root=try JSONSerialization.jsonObject(with:bytes) as? [String:Any],Set(root.keys)==Set(["data"]),let raw=root["data"] as? [String:Any] else{throw NativeDataError.invalidResponse}
        if raw["kind"] as? String=="unavailable"{guard Set(raw.keys)==Set(["kind"]) else{throw NativeDataError.invalidResponse};return .unavailable}
        if raw["kind"] as? String=="readiness_task_reference/1" {
            guard Set(raw.keys)==Set(["kind","taskId","tripId","tripVersion","artifactId","artifactRevision"]),raw["tripId"] as? String==tripId,raw["tripVersion"] as? Int==tripVersion,let task=raw["taskId"] as? String,NativeMemoryWire.uuid(task),let artifact=raw["artifactId"] as? String,NativeMemoryWire.uuid(artifact),let revision=raw["artifactRevision"] as? Int,revision>0 else{throw NativeDataError.invalidResponse};return .reference(task)
        }
        guard raw["kind"] as? String=="readiness_task_options/1",Set(raw.keys)==Set(["kind","tripId","options"]),raw["tripId"] as? String==tripId,let options=raw["options"] as? [[String:Any]],options.count<=20,options.allSatisfy({Set($0.keys)==Set(["taskId","tripVersion","goalId","goalVersion","conversationId","label"])}) else{throw NativeDataError.invalidResponse}
        let values=try JSONDecoder().decode([NativeReadinessTaskOption].self,from:JSONSerialization.data(withJSONObject:options))
        guard Set(values.map(\.id)).count==values.count,values.allSatisfy({NativeMemoryWire.uuid($0.taskId) && $0.tripVersion==tripVersion && NativeMemoryWire.uuid($0.goalId) && $0.goalVersion>0 && NativeMemoryWire.uuid($0.conversationId) && !$0.label.isEmpty && $0.label.utf8.count<=16000}) else{throw NativeDataError.invalidResponse};return .options(values)
    }
}
