import Foundation
@main struct Checks {
 @MainActor static func main() async throws {
  typealias W = NativeJourneyMeasurementWire
  typealias M = NativeJourneyMeasurement
  typealias A = NativeJourneyMeasurementAdmission
  var count = 0
  func expect(_ yes: Bool) { precondition(yes); count += 1 }
  func reject(_ f: () throws -> Void) { do { try f(); fatalError("expected closed rejection") } catch { count += 1 } }
  let actor = W.Actor(ownerID: UUID(), sessionID: UUID(), mobileEpoch: 2)
  let consent = UUID(), trip = UUID(), process = UUID()
  let attempt = A.Attempt(operationID: UUID(), logicalID: UUID(), anchor: .nativeEntry(trip: trip, version: 0, material: .pdf), process: process, nativeStart: 100)
  let command = try JSONSerialization.jsonObject(with: W.admission(attempt, consentID: consent)) as! [String:Any]
  expect(command["entry"] as? String == "e2")
  let source = command["source"] as! [String:Any]
  expect(source["kind"] as? String == "native_entry" && source["logicalId"] as? String == W.id(attempt.logicalID))
  expect((source["anchor"] as! [String:Any])["tripVersion"] as? Int == 0)
  expect(command["ownerId"] == nil && command["admittedAt"] == nil)
  reject { _ = try W.command("activated", fields:["activated":true]) }
  reject { _ = try W.command("policy", fields:["rawText":"forbidden"]) }
  let base: [String:Any] = ["schemaVersion":M.schema,"purpose":M.purpose,"ownerId":W.id(actor.ownerID),"sessionId":W.id(actor.sessionID),"mobileEpoch":2]
  let notice: [String:Any] = ["schemaVersion":M.schema,"purpose":M.purpose,"noticeVersion":M.noticeVersion,"retentionMs":W.ttl,"zh":"告知","en":"Notice"]
  var policy = base;policy.merge(["kind":"policy","enabled":false,"noticeVersion":M.noticeVersion,"capabilities":W.capabilities,"capturedAt":100000,"expiresAt":120000,"consent":NSNull()]){_,n in n}
  func policyBytes(_ p:[String:Any]) throws -> Data { try JSONSerialization.data(withJSONObject:["data":p,"notice":notice]) }
  let decoded = try W.policy(policyBytes(policy),actor:actor,now:100001)
  expect(!decoded.enabled && decoded.consentID == nil && decoded.entries.isEmpty)
  var changed=policy;changed["enabled"]=1;reject{_ = try W.policy(policyBytes(changed),actor:actor,now:100001)}
  changed=policy;changed["ownerId"]=W.id(UUID());reject{_ = try W.policy(policyBytes(changed),actor:actor,now:100001)}
  changed=policy;changed["mobileEpoch"]=3;reject{_ = try W.policy(policyBytes(changed),actor:actor,now:100001)}
  changed=policy;changed["capabilities"]=["receive"];reject{_ = try W.policy(policyBytes(changed),actor:actor,now:100001)}
  changed=policy;changed["extra"]=true;reject{_ = try W.policy(policyBytes(changed),actor:actor,now:100001)}
  reject{_ = try W.policy(policyBytes(policy),actor:actor,now:120000)}
  var ticket=base;ticket.merge(["kind":"admission","operationId":W.id(attempt.operationID),"consentId":W.id(consent),"admissionId":W.id(UUID()),"entry":"e2","source":source,"clockOrigin":command["clockOrigin"]!,"authority":"authenticated_native_acceptance_report","admittedAt":NSNull(),"firstEver":"unknown","receivedAt":100000,"expiresAt":100000+W.ttl,"reused":false]){_,n in n}
  func ticketBytes(_ t:[String:Any]) throws -> Data { try JSONSerialization.data(withJSONObject:["data":t]) }
  let admitted = try W.ticket(ticketBytes(ticket),actor:actor,attempt:attempt,consent:consent,now:100001)
  expect(admitted.admittedAt == nil && admitted.firstEver == "unknown")
  var bad=ticket;bad["admittedAt"]=99999;reject{_ = try W.ticket(ticketBytes(bad),actor:actor,attempt:attempt,consent:consent,now:100001)}
  bad=ticket;bad["authority"]="service_task";reject{_ = try W.ticket(ticketBytes(bad),actor:actor,attempt:attempt,consent:consent,now:100001)}
  bad=ticket;bad["expiresAt"]=100001+W.ttl;reject{_ = try W.ticket(ticketBytes(bad),actor:actor,attempt:attempt,consent:consent,now:100001)}
  bad=ticket;bad["operationId"]=W.id(UUID());reject{_ = try W.ticket(ticketBytes(bad),actor:actor,attempt:attempt,consent:consent,now:100001)}
  bad=ticket;bad["reused"]=1;reject{_ = try W.ticket(ticketBytes(bad),actor:actor,attempt:attempt,consent:consent,now:100001)}
  let goal=A.Goal(conversationID:UUID(),goalID:UUID(),goalVersion:2,parentMessageID:UUID(),inputSequence:3)
  let g=A.Attempt(operationID:UUID(),logicalID:goal.goalID,anchor:.goal(goal),process:process,nativeStart:nil)
  expect(W.source(g)["logicalId"] as? String == W.id(goal.goalID))
  let wrong=A.Attempt(operationID:UUID(),logicalID:UUID(),anchor:.goal(goal),process:process,nativeStart:nil)
  reject{_ = try W.admission(wrong,consentID:consent)}
  let question=W.signal(.question(.partySize,.sourceConflict,UUID()))
  expect(question["basis"] as? String == "source_conflict" && question["questionId"] != nil)
  let observer = NativeJourneyMeasurementController<Int>(uptime:{100})
  var currentActor: Int? = 1; var requests = 0
  var enabledPolicy = policy; enabledPolicy["enabled"] = true
  let enabledBytes = try policyBytes(enabledPolicy)
  let gateway = NativeJourneyMeasurementGateway(observer:observer,currentActor:{currentActor},wireActor:{_ in actor},
    transport:{_,_ in requests += 1; return enabledBytes},wallMilliseconds:{100001},uptime:{100})
  let ready = await gateway.readPolicy()
  expect(!ready && requests == 1 && observer.status == .disabled)
  gateway.guardedStart(attempt)
  for _ in 0..<10 { await Task.yield() }
  expect(requests == 1)
  currentActor = 2; gateway.clear()
  expect(observer.status == .disabled)
  print("PASS \(count) current measurement wire checks; no real gateway/lifecycle/consent claim")
 }
}
