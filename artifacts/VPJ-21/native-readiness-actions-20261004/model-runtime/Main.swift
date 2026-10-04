import Foundation
@main struct Check {
 @MainActor static func main()throws {
  let ids=["11111111-2222-3333-4444-555555555555","22222222-2222-3333-4444-555555555555","33333333-2222-3333-4444-555555555555","44444444-2222-3333-4444-555555555555","55555555-2222-3333-4444-555555555555"],hash=String(repeating:"a",count:64)
  let basis=NativeReadinessTaskBasis(taskId:ids[0],taskTurnId:ids[1],conversationId:ids[2],goalId:ids[3],goalVersion:1,tripId:ids[4],tripVersion:3,dateBasis:hash,taskBasisDigest:hash)
  let decl=NativeReadinessDeclaration(scenario:.admission,city:"shanghai",locale:"en",subjectId:nil,applies:"no",resourcesReady:"unknown",conditionsChecked:"unknown",checkAt:"unknown")
  let f=ISO8601DateFormatter();f.formatOptions=[.withInternetDateTime,.withFractionalSeconds]
  var object:[String:Any]=["schemaVersion":"readiness/2","basis":try JSONSerialization.jsonObject(with:JSONEncoder().encode(basis)),"scenario":"admission","ruleVersion":"readiness-actions/1","ontologyVersion":"test/readiness-relations-1","declarationRevision":1,"assessmentDigest":hash,"evaluatedAt":f.string(from:Date()),"expiresAt":f.string(from:Date().addingTimeInterval(25)),"knowledgeAvailability":"unknown","userReadiness":"not_applicable","actionTiming":"not_applicable","declaration":try JSONSerialization.jsonObject(with:JSONEncoder().encode(decl)),"declarationBasis":"explicit_user_report","declarationState":"current","evidence":[],"actions":[]]
  func decode(_ r:[String:Any])throws->NativeReadinessAssessment{try NativeReadinessAssessment.decode(JSONSerialization.data(withJSONObject:["data":r]),taskId:ids[0],tripId:ids[4],tripVersion:3,selection:decl)}
  let assessment=try decode(object);precondition(assessment.userReadiness == .notApplicable && assessment.actions.isEmpty && assessment.actionBasis==nil)
  let save=try NativeReadinessInput.body(operation:"save",taskId:ids[0],tripVersion:3,selection:decl,assessment:assessment,operationId:ids[3])
  let body=try JSONSerialization.jsonObject(with:save) as! [String:Any];precondition(body.count==12 && body["expectedRevision"] as? Int==1 && body["expectedBasis"] != nil)
  print("PASS explicit declaration CAS / no fabricated action or digest")
  object["userReadiness"]="satisfied"
  do{_=try decode(object);fatalError("unknown evidence cannot satisfy readiness")}catch{}
  print("PASS unknown / not-applicable axes stay distinct")
  let actionBasis=NativeReadinessActionBasis(taskId:basis.taskId,taskTurnId:basis.taskTurnId,conversationId:basis.conversationId,goalId:basis.goalId,goalVersion:1,tripId:basis.tripId,tripVersion:3,dateBasis:hash,taskBasisDigest:hash,declarationRevision:0,ruleVersion:"readiness-actions/1",ontologyVersion:"test/readiness-relations-1",evidenceDigest:hash)
  let raw:[String:Any]=["kind":"verify_entry","actionId":hash,"basis":try JSONSerialization.jsonObject(with:JSONEncoder().encode(actionBasis)),"target":"sources","factId":NSNull(),"publicationVersion":NSNull(),"sourceRevisionId":NSNull()]
  let action=try NativeReadinessAction.decode(raw,basis:actionBasis)
  _=try NativeReadinessActionRoute.resolve(action,current:actionBasis,foreground:true,now:Date(),expiresAt:Date().addingTimeInterval(10))
  do{_=try NativeReadinessActionRoute.resolve(action,current:nil,foreground:true,now:Date(),expiresAt:Date().addingTimeInterval(10));fatalError("changed basis grants action")}catch{}
  do{_=try NativeReadinessActionRoute.resolve(action,current:actionBasis,foreground:true,now:Date(),expiresAt:Date().addingTimeInterval(-1));fatalError("expired action grants use")}catch{}
  let response=try JSONSerialization.data(withJSONObject:["data":["kind":"readiness_action/1","actionId":hash,"basis":try JSONSerialization.jsonObject(with:JSONEncoder().encode(actionBasis)),"result":["kind":"verification_entry","target":"sources","sources":[]]]])
  let result=try NativeReadinessExecution.decode(response,action:action);precondition(result.result.kind=="verification_entry")
  print("PASS exact action execute / expiry / changed basis / no solved label")
 }
}
