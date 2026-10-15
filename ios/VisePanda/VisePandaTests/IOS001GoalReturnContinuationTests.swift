import Foundation
import XCTest
@testable import VisePanda

/// Runs against the real App module, store and result decoder. Fixture payloads
/// exercise read boundaries; they are not Auth, provider, UI or target proof.
nonisolated final class IOS001GoalReturnContinuationTests: XCTestCase {
 @MainActor func testClosedWireRejectsForeignScopeAndMalformedReferences() throws {
  let conversation = "00000000-0000-4000-8000-000000000001"
  let goal = "00000000-0000-4000-8000-000000000002"
  let parent = "00000000-0000-4000-8000-000000000003"
  let artifact = "00000000-0000-4000-8000-000000000004"
  let source = NativeJourneyGoalReturnWire.Scope(conversationID: conversation, goalID: goal, goalVersion: 2, parentMessageID: parent, inputSequence: 9)
  let scope: [String: Any] = ["conversationId": conversation, "goalId": goal, "goalVersion": 2, "parentMessageId": parent, "inputSequence": 9]
  let reference: [String: Any] = ["artifactId": artifact, "revision": 3, "eventId": "9223372036854775807"]
  let root: [String: Any] = ["version": 5, "kind": "goal_return", "schemaVersion": "goal-return/1", "scope": scope, "lastDecision": reference, "nextStep": ["kind": "unknown"]]
  func bytes(_ object: [String: Any]) throws -> Data { try JSONSerialization.data(withJSONObject: object) }
  XCTAssertEqual(try NativeJourneyGoalReturnWire.decode(bytes(root), expected: source), .reference(.init(artifactID: artifact, revision: 3, eventID: "9223372036854775807")))
  XCTAssertEqual(source.query.map(\.name), ["conversationId", "goalId", "goalVersion", "parentMessageId", "inputSequence"])
  for (key, value) in [("conversationId", goal as Any), ("goalId", conversation as Any), ("goalVersion", 3 as Any), ("parentMessageId", goal as Any), ("inputSequence", 10 as Any), ("inputSequence", true as Any)] {
   var changed = scope; changed[key] = value
   var candidate = root; candidate["scope"] = changed
   XCTAssertThrowsError(try NativeJourneyGoalReturnWire.decode(bytes(candidate), expected: source), key)
  }
  for event: Any in ["0", "01", "-1", "9223372036854775808", "1.0", 1, true] {
   var changed = reference; changed["eventId"] = event
   var candidate = root; candidate["lastDecision"] = changed
   XCTAssertThrowsError(try NativeJourneyGoalReturnWire.decode(bytes(candidate), expected: source))
  }
  for revision: Any in [0, 1001, 1.5, true] {
   var changed = reference; changed["revision"] = revision
   var candidate = root; candidate["lastDecision"] = changed
   XCTAssertThrowsError(try NativeJourneyGoalReturnWire.decode(bytes(candidate), expected: source))
  }
  for (key, value) in [("schemaVersion", "goal-return/2" as Any), ("nextStep", ["kind": "continue"] as Any), ("extra", true as Any), ("version", true as Any)] {
   var candidate = root; candidate[key] = value
   XCTAssertThrowsError(try NativeJourneyGoalReturnWire.decode(bytes(candidate), expected: source), key)
  }
 }
 @MainActor func testActualStoreCurrentChosenRevalidationAndInvalidation() async throws {
  let conversation="00000000-0000-4000-8000-000000000001", goal="00000000-0000-4000-8000-000000000002", parent="00000000-0000-4000-8000-000000000003", artifact="00000000-0000-4000-8000-000000000004"
  let source=NativeJourneyGoalReturnWire.Scope(conversationID:conversation,goalID:goal,goalVersion:2,parentMessageID:parent,inputSequence:9)
  let scope=NativeDataScope(endpoint:"https://fixture.invalid",subject:"00000000-0000-4000-8000-000000000005",mobileEpoch:2,generation:1)
  let actor=NativeCommunitySafetyActor(scope:scope,sessionID:"00000000-0000-4000-8000-000000000006")
  let target=NativeJourneyGoalReturnContext(actor:actor,source:source)
  var now:TimeInterval=100, live:NativeJourneyGoalReturnContext?=target, count=0
  let store=NativeJourneyGoalReturnStore(uptime:{now})
  func expect(_ yes:Bool,_ message:String){XCTAssertTrue(yes,message);count+=1}
  func reference(event:String="9223372036854775807",revision:Int=3)->Data {
   try! JSONSerialization.data(withJSONObject:["version":5,"kind":"goal_return","schemaVersion":"goal-return/1","scope":["conversationId":conversation,"goalId":goal,"goalVersion":2,"parentMessageId":parent,"inputSequence":9],"lastDecision":["artifactId":artifact,"revision":revision,"eventId":event],"nextStep":["kind":"unknown"]])
  }
  let unknown=try JSONSerialization.data(withJSONObject:["version":5,"kind":"unavailable","nextStep":["kind":"unknown"]])
  func record(current:Bool=true,chosen:Bool=true,goalID:String?=nil,message:String?=nil,sequence:Int=9)->Data {
   let content:[String:Any]=["schemaVersion":"decision/1","title":"Fixture decision","summary":"Explicit fixture choice","comparisonRef":["artifactId":"00000000-0000-4000-8000-000000000007","revision":1],"state":chosen ? "chosen":"pending","chosenOptionId":chosen ? "option-a" as Any:NSNull(),"actions":[]]
   return try! JSONSerialization.data(withJSONObject:["version":2,"data":["kind":"result_artifact","artifactId":artifact,"revision":3,"currentRevision":current ? 3:4,"current":current,"historicalReadable":true,"lifecycle":"active","source":["tripId":NSNull(),"tripVersion":NSNull(),"taskId":"00000000-0000-4000-8000-000000000008","taskTurnId":"00000000-0000-4000-8000-000000000009","goalId":goalID ?? goal,"goalVersion":2,"inputMessageId":message ?? parent,"inputSequence":sequence],"basis":["memories":[],"evidence":[]],"content":content,"createdAt":"2026-10-15T00:00:00Z"]])
  }
  var discoveries=0, reads=0
  await store.load(target,current:{live},discover:{_ in discoveries+=1;return reference()},read:{id,revision in reads+=1;expect(id==artifact && revision==3,"exact original artifact/revision reader");return record()})
  expect(store.state == .ready && store.visible(current:live)?.chosenOptionID=="option-a","actual original decoder + chosen/current + rediscovery")
  expect(discoveries==2 && reads==1,"one discovery/read/rediscovery; no business writer")
  now=120;expect(store.visible(current:live)==nil,"exact20s publication expiry")
  now=99;expect(store.visible(current:live)==nil,"clock rollback fails closed")
  now=100
  await store.load(target,current:{live},discover:{_ in unknown},read:{_,_ in fatalError("unknown must not read")})
  expect(store.state == .unknown && store.visible(current:live)==nil,"uniform unavailable has no fallback")
  for (name,bytes) in [("historical",record(current:false)),("pending",record(chosen:false)),("wronggoal",record(goalID:conversation)),("wrongparent",record(message:goal)),("wrongsequence",record(sequence:10))] {
   discoveries=0
   await store.load(target,current:{live},discover:{_ in discoveries+=1;return reference()},read:{_,_ in bytes})
   expect(store.visible(current:live)==nil && store.state == .unknown && discoveries==1,"reject \(name) before rediscovery/display")
  }
  discoveries=0
  await store.load(target,current:{live},discover:{_ in discoveries+=1;return reference(event:discoveries==1 ? "10":"11")},read:{_,_ in record()})
  expect(store.state == .unknown && store.visible(current:live)==nil,"publication event drift never uses older result")
  await store.load(target,current:{live},discover:{_ in reference()},read:{_,_ in now=120;return record()})
  expect(store.visible(current:live)==nil && store.state == .idle,"deadline includes complete chain/network")
  now=100
  await store.load(target,current:{live},discover:{_ in store.clear();return reference()},read:{_,_ in fatalError("invalidated read")})
  expect(store.state == .idle && store.visible(current:live)==nil,"event/withdrawal/erasure clear fences late response")
  await store.load(target,current:{live},discover:{_ in live=nil;return reference()},read:{_,_ in fatalError("inactive selection")})
  expect(store.visible(current:target)==nil,"scene/current selection replacement")
  live=target
  await store.load(target,current:{live},discover:{_ in
   let changed=NativeDataScope(endpoint:scope.endpoint,subject:scope.subject,mobileEpoch:3,generation:scope.generation)
   live = .init(actor:.init(scope:changed,sessionID:actor.sessionID),source:source);return reference()
  },read:{_,_ in fatalError("epoch changed")})
  expect(store.visible(current:live)==nil,"replaced epoch")
  live=target
  await store.load(target,current:{live},discover:{_ in throw NativeDataError.server(code:"DATA_POLICY_BLOCKED")},read:{_,_ in fatalError("denied")})
  expect(store.state == .unavailable && store.visible(current:live)==nil,"permission/consent denial no old fallback")
  let old=store.requestGeneration
  await store.load(target,current:{live},discover:{_ in store.expireRequest(store.requestGeneration);return reference()},read:{_,_ in fatalError("watchdog expired")})
  expect(store.state == .idle,"timeout releases loading without late revival")
  store.expireRequest(old);expect(store.state == .idle,"old timeout cannot own newer generation")
  live=target
  for changed in [
    NativeJourneyGoalReturnContext(actor:.init(scope:scope,sessionID:conversation),source:source),
    NativeJourneyGoalReturnContext(actor:.init(scope:.init(endpoint:scope.endpoint,subject:conversation,mobileEpoch:scope.mobileEpoch,generation:scope.generation),sessionID:actor.sessionID),source:source),
    NativeJourneyGoalReturnContext(actor:actor,source:source,selectionGeneration:UUID()),
    NativeJourneyGoalReturnContext(actor:actor,source:.init(conversationID:conversation,goalID:goal,goalVersion:3,parentMessageID:parent,inputSequence:9)),
    NativeJourneyGoalReturnContext(actor:actor,source:.init(conversationID:conversation,goalID:goal,goalVersion:2,parentMessageID:goal,inputSequence:10))
  ] {
    live=target
    await store.load(target,current:{live},discover:{_ in live=changed;return reference()},read:{_,_ in XCTFail("changed scope must not read");return record()})
    expect(store.state == .idle && store.visible(current:live)==nil,"actor/session/selection/goal/input replacement")
  }
  live=target
  await store.load(target,current:{live},discover:{_ in live=nil;throw NativeDataError.sessionUnavailable},read:{_,_ in record()})
  expect(store.state == .idle,"throw after invalidation must clear loading and source")
  live=target
  discoveries=0
  await store.load(target,current:{live},discover:{_ in discoveries+=1;return reference(revision:discoveries==1 ? 3:4)},read:{_,_ in record()})
  expect(store.state == .unknown && store.visible(current:live)==nil,"rediscovered revision drift refuses cached decision")
  await store.load(target,current:{live},discover:{_ in reference()},read:{_,_ in record()})
  let readyGeneration=store.requestGeneration
  store.expireRequest(readyGeneration)
  expect(store.state == .idle && store.visible(current:live)==nil,"watchdog clears a ready lease as well as loading")
  await store.load(target,current:{live},discover:{_ in reference()},read:{_,_ in record()})
  store.expireRequest(readyGeneration)
  expect(store.state == .ready,"old expiry cannot clear a newer request")
  var continuation:CheckedContinuation<Data,Never>?
  let job=Task { @MainActor in await store.load(target,current:{live},discover:{_ in await withCheckedContinuation{continuation=$0}},read:{_,_ in fatalError("cancelled")}) }
  while continuation==nil {await Task.yield()}
  job.cancel();continuation?.resume(returning:reference());await job.value
  expect(store.visible(current:live)==nil,"cancelled transport cannot publish")
  XCTAssertGreaterThan(count, 20)
 }
}
