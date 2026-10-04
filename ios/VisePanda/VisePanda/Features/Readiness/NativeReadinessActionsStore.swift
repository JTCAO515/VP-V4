import Foundation
import Observation

@MainActor @Observable final class NativeReadinessActionsStore {
    private(set) var actor:NativeDataScope?
    private(set) var basis:NativeReadinessActionBasis?
    private(set) var actions:[NativeReadinessAction]=[]
    private(set) var route:NativeReadinessActionRoute?
    private(set) var notice:String?
    private(set) var taskId:String?
    private(set) var assessment:NativeReadinessAssessment?
    private(set) var execution:NativeReadinessExecution?
    private(set) var busy=false
    private(set) var pendingSave:Data?
    private var generation=UUID()
    private var expiry:Date?
    private var deadline:TimeInterval=0
    func clear(){generation=UUID();taskId=nil;assessment=nil;execution=nil;busy=false;pendingSave=nil;basis=nil;actions=[];route=nil;notice=nil;expiry=nil;deadline=0}
    func bind(_ actor:NativeDataScope?){if self.actor != actor{clear();self.actor=actor}}
    func install(basis:NativeReadinessActionBasis,actions:[NativeReadinessAction],evaluatedAt:Date,expiresAt:Date,started:TimeInterval,current:NativeDataScope?)throws {
        guard current != nil,actor==current,basis.valid,actions.count<=100,Set(actions.map(\.id)).count==actions.count,actions.allSatisfy({$0.basis==basis}),expiresAt>evaluatedAt,expiresAt.timeIntervalSince(evaluatedAt)<=30,expiresAt>Date() else{throw NativeDataError.invalidResponse}
        self.basis=basis;self.actions=actions;expiry=expiresAt;deadline=started+expiresAt.timeIntervalSince(evaluatedAt);route=nil;notice=nil
    }
    private func installAssessment(_ value:NativeReadinessAssessment,started:TimeInterval,current:NativeDataScope?)throws {
        guard current != nil,current==actor,let evaluated=NativeKnowledgeRead.date(value.evaluatedAt),let expires=NativeKnowledgeRead.date(value.expiresAt),expires>evaluated,expires>Date() else{throw NativeDataError.invalidResponse}
        basis=value.actionBasis;actions=value.actions;expiry=expires;deadline=started+expires.timeIntervalSince(evaluated);execution=nil;route=nil;notice=nil
    }
    func visibleAssessment(current:NativeDataScope?,foreground:Bool)->NativeReadinessAssessment? {
        guard foreground,current != nil,current==actor,ProcessInfo.processInfo.systemUptime<deadline,expiry.map({$0>Date()})==true else{return nil};return assessment
    }
    func visible(current:NativeDataScope?,foreground:Bool)->[NativeReadinessAction] {
        guard foreground,current != nil,current==actor,ProcessInfo.processInfo.systemUptime<deadline,expiry.map({$0>Date()})==true else{return []};return actions
    }
    func open(_ id:String,current:NativeDataScope?,foreground:Bool,currentBasis:NativeReadinessActionBasis?) {
        guard let action=visible(current:current,foreground:foreground).first(where:{$0.id==id}),let expiry else{notice="refreshRequired";return}
        do{route=try NativeReadinessActionRoute.resolve(action,current:currentBasis,foreground:foreground,now:Date(),expiresAt:expiry)}catch{route=nil;notice="refreshRequired"}
    }
    func resolveTask(tripId:String,tripVersion:Int,current:()->NativeDataScope?,reference:()async throws->Data,record:(String,Int)async throws->Data)async {
        guard !busy,let actor,current()==actor else{return};let token=generation;busy=true;defer{if generation==token{busy=false}}
        do{let bytes=try await reference();guard generation==token,current()==actor else{return};guard let ref=try NativeFiveResultReference.decode(bytes,field:"tripId",expectedID:tripId) else{throw NativeDataError.invalidResponse};let exact=try await record(ref.artifactID,ref.revision);guard generation==token,current()==actor else{return};guard let result=try NativeFiveResultRecord.decode(exact,artifactID:ref.artifactID,revision:ref.revision),let task=result.source.taskId,NativeMemoryWire.uuid(task) else{throw NativeDataError.invalidResponse};taskId=task;notice=nil}catch{guard generation==token,current()==actor else{return};taskId=nil;notice="taskUnavailable"}
    }
    func read(tripId:String,tripVersion:Int,selection:NativeReadinessDeclaration,current:()->NativeDataScope?,post:(Data)async throws->Data)async {
        guard !busy,let actor,current()==actor,let taskId else{return};let token=generation,started=ProcessInfo.processInfo.systemUptime;busy=true;assessment=nil;execution=nil;actions=[];defer{if generation==token{busy=false}}
        do{let input=try NativeReadinessInput.body(operation:"read",taskId:taskId,tripVersion:tripVersion,selection:selection);let bytes=try await post(input);guard generation==token,current()==actor,!Task.isCancelled else{return};let value=try NativeReadinessAssessment.decode(bytes,taskId:taskId,tripId:tripId,tripVersion:tripVersion,selection:selection);if let previous=self.assessment,previous.basis != value.basis{pendingSave=nil};assessment=value;try installAssessment(value,started:started,current:actor)}catch{guard generation==token,current()==actor else{return};notice="unavailable"}
    }
    func save(tripId:String,tripVersion:Int,selection:NativeReadinessDeclaration,current:()->NativeDataScope?,post:(Data)async throws->Data)async {
        guard !busy,let actor,current()==actor,let taskId,let assessment else{return};let token=generation,started=ProcessInfo.processInfo.systemUptime;busy=true;defer{if generation==token{busy=false}}
        do{if pendingSave==nil{pendingSave=try NativeReadinessInput.body(operation:"save",taskId:taskId,tripVersion:tripVersion,selection:selection,assessment:assessment,operationId:UUID().uuidString.lowercased())};guard let body=pendingSave else{return};let bytes=try await post(body);guard generation==token,current()==actor,!Task.isCancelled else{return};let value=try NativeReadinessAssessment.decode(bytes,taskId:taskId,tripId:tripId,tripVersion:tripVersion,selection:selection);self.assessment=value;pendingSave=nil;try installAssessment(value,started:started,current:actor)}catch{guard generation==token,current()==actor else{return};notice="saveUnconfirmed"}
    }
    func execute(_ action:NativeReadinessAction,tripVersion:Int,selection:NativeReadinessDeclaration,current:()->NativeDataScope?,post:(Data)async throws->Data)async {
        guard !busy,let actor,current()==actor,let taskId,let assessment,visible(current:actor,foreground:true).contains(where:{$0.id==action.id}) else{return};let token=generation;busy=true;defer{if generation==token{busy=false}}
        do{let input=try NativeReadinessInput.body(operation:"execute",taskId:taskId,tripVersion:tripVersion,selection:selection,assessment:assessment,action:action);let bytes=try await post(input);guard generation==token,current()==actor,!Task.isCancelled else{return};execution=try NativeReadinessExecution.decode(bytes,action:action);route=try NativeReadinessActionRoute.resolve(action,current:assessment.actionBasis,foreground:true,now:Date(),expiresAt:NativeKnowledgeRead.date(assessment.expiresAt)!)}catch{guard generation==token,current()==actor else{return};execution=nil;route=nil;notice="recheckRequired"}
    }
    func invalidateAssessment(){basis=nil;assessment=nil;actions=[];execution=nil;route=nil;deadline=0;expiry=nil;notice="recheckRequired"}
    func returnedFromAction(){invalidateAssessment()}
}
