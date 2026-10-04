import Foundation
@main struct Check {
 @MainActor static func main()async throws {
  let ids=["11111111-2222-3333-4444-555555555555","22222222-2222-3333-4444-555555555555","33333333-2222-3333-4444-555555555555","44444444-2222-3333-4444-555555555555","55555555-2222-3333-4444-555555555555"],a=String(repeating:"a",count:64),b=String(repeating:"b",count:64)
  let actor=NativeDataScope(endpoint:"http://127.0.0.1:63221",subject:ids[0],mobileEpoch:1,generation:0)
  let old=NativeReadinessTaskBasis(taskId:ids[0],taskTurnId:ids[1],conversationId:ids[2],goalId:ids[3],goalVersion:1,tripId:ids[4],tripVersion:3,dateBasis:a,taskBasisDigest:a)
  let newer=NativeReadinessTaskBasis(taskId:ids[0],taskTurnId:ids[1],conversationId:ids[2],goalId:ids[3],goalVersion:1,tripId:ids[4],tripVersion:4,dateBasis:b,taskBasisDigest:a)
  let selected=NativeReadinessDeclaration(scenario:.connectivity,city:"shanghai",locale:"en",subjectId:nil,applies:"no",resourcesReady:"unknown",conditionsChecked:"unknown",checkAt:"unknown")
  let unknown=NativeReadinessDeclaration(scenario:.connectivity,city:"shanghai",locale:"en",subjectId:nil,applies:"unknown",resourcesReady:"unknown",conditionsChecked:"unknown",checkAt:"unknown")
  func response(_ basis:NativeReadinessTaskBasis,revision:Int,stale:Bool=false)throws->Data {
   let f=ISO8601DateFormatter();f.formatOptions=[.withInternetDateTime,.withFractionalSeconds]
   let declaration=stale ? unknown:selected
   let rootBasis=try JSONSerialization.jsonObject(with:JSONEncoder().encode(basis))
   var actionBasis=rootBasis as! [String:Any];actionBasis["declarationRevision"]=revision;actionBasis["ruleVersion"]="readiness-actions/1";actionBasis["ontologyVersion"]="test/1";actionBasis["evidenceDigest"]=a
   let action:[String:Any]=["kind":"verify_entry","actionId":a,"basis":actionBasis,"target":"sources","factId":NSNull(),"publicationVersion":NSNull(),"sourceRevisionId":NSNull()]
   return try JSONSerialization.data(withJSONObject:["data":["schemaVersion":"readiness/2","basis":rootBasis,"scenario":"connectivity","ruleVersion":"readiness-actions/1","ontologyVersion":"test/1","declarationRevision":revision,"assessmentDigest":a,"evaluatedAt":f.string(from:Date()),"expiresAt":f.string(from:Date().addingTimeInterval(25)),"knowledgeAvailability":"unknown","userReadiness":stale ? "unknown":"not_applicable","actionTiming":stale ? "unknown":"not_applicable","declaration":try JSONSerialization.jsonObject(with:JSONEncoder().encode(declaration)),"declarationBasis":"explicit_user_report","declarationState":stale ? "stale":"current","evidence":[],"actions":stale ? [action]:[]]])
  }
  let initial=try NativeReadinessAssessment.decode(response(old,revision:1),taskId:ids[0],tripId:ids[4],tripVersion:3,selection:selected)
  let bytes=try NativeReadinessInput.body(operation:"save",taskId:ids[0],tripVersion:3,selection:selected,assessment:initial,operationId:ids[3])
  let pending=NativeReadinessPendingSave(endpoint:actor.endpoint,owner:actor.subject,epoch:1,tripId:ids[4],taskId:ids[0],body:bytes)
  let store=NativeReadinessActionsStore();store.bind(actor);try store.restorePending(pending,current:actor)
  await store.read(tripId:ids[4],tripVersion:3,selection:selected,current:{actor},post:{_ in try response(old,revision:1)})
  await store.save(tripId:ids[4],tripVersion:3,selection:selected,current:{actor},post:{body in precondition(body==bytes);throw URLError(.networkConnectionLost)})
  precondition(store.pendingSave==bytes)
  store.suspend();precondition(store.pendingSave==bytes && store.assessment==nil)
  let restored=NativeReadinessActionsStore();restored.bind(actor);try restored.restorePending(JSONDecoder().decode(NativeReadinessPendingSave.self,from:JSONEncoder().encode(pending)),current:actor)
  await restored.read(tripId:ids[4],tripVersion:3,selection:selected,current:{actor},post:{_ in try response(old,revision:2)})
  var acknowledged=false
  await restored.save(tripId:ids[4],tripVersion:3,selection:unknown,current:{actor},acknowledge:{p in precondition(p.body==bytes);acknowledged=true},post:{body in precondition(body==bytes);return try response(old,revision:2)})
  precondition(acknowledged && restored.pendingSave==nil)
  print("PASS lost ACK / refresh / background / restored original operation bytes retry")
  await restored.save(tripId:ids[4],tripVersion:3,selection:selected,current:{actor},post:{_ in throw URLError(.networkConnectionLost)})
  precondition(restored.pendingSave != nil)
  var discarded=false
  await restored.read(tripId:ids[4],tripVersion:4,selection:unknown,current:{actor},discardInvalid:{_ in discarded=true},post:{_ in try response(newer,revision:2,stale:true)})
  precondition(discarded && restored.pendingSave==nil && restored.assessment?.declaration.applies=="unknown")
  var persisted=false
  await restored.save(tripId:ids[4],tripVersion:4,selection:selected,current:{actor},persist:{p in precondition(try! p.parsed().basis==newer);persisted=true},post:{_ in throw URLError(.networkConnectionLost)})
  precondition(persisted)
  restored.bind(NativeDataScope(endpoint:actor.endpoint,subject:ids[2],mobileEpoch:1,generation:0));precondition(restored.pendingSave==nil)
  print("PASS changed current basis unlocks explicit redeclaration / cross-actor clear")
  let discovery=NativeReadinessActionsStore();discovery.bind(actor)
  let option:[String:Any]=["taskId":ids[0],"tripVersion":4,"goalId":ids[3],"goalVersion":1,"conversationId":ids[2],"label":"Owned current goal"]
  let options=try JSONSerialization.data(withJSONObject:["data":["kind":"readiness_task_options/1","tripId":ids[4],"options":[option]]])
  await discovery.discoverTask(tripId:ids[4],tripVersion:4,current:{actor},get:{options})
  precondition(discovery.taskId==nil && discovery.taskOptions.count==1)
  discovery.selectTask(ids[0]);precondition(discovery.taskId==ids[0])
  await discovery.discoverTask(tripId:ids[4],tripVersion:4,current:{actor},get:{try JSONSerialization.data(withJSONObject:["data":["kind":"unavailable"]])})
  precondition(discovery.taskId==nil && discovery.taskOptions.isEmpty)
  print("PASS date-entry single candidate stays explicit / unavailable is not first-or-latest")
 }
}
