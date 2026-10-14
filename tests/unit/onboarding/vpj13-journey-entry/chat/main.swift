import Foundation
@main struct ChatChecks {
 @MainActor static func main() {
  let state = NativeFrontendState(); var n = 0
  func check(_ value: Bool, _ name: String) { precondition(value,name); n += 1 }
  let originalJourneyID = state.journeys[0].id
  let originalMaterial = state.materials.first{$0.id=="sample-plan"}!
  state.draft=" \n";state.submit()
  check(state.messages.count==1 && !state.pendingConfirmation,"empty input does not invent output")
  state.draft="想走走，日期没定";state.submit()
  check(state.messages.count==3 && state.messages[1].text=="想走走，日期没定","literal no-date input uses shared submit")
  check(state.draft.isEmpty && state.pendingConfirmation,"shared result ready for explicit review")
  check(state.journeys.count==1 && state.journeys[0].id==originalJourneyID,"no second fixture journey")
  state.openMaterial("sample-plan")
  check(state.selectedTab == .library && state.selectedMaterialID==originalMaterial.id,"same material crosses tabs")
  state.openJourney(originalJourneyID)
  check(state.selectedTab == .journeys && state.selectedJourneyID==originalJourneyID,"same journey crosses tabs")
  state.openChat(context:state.journeys[0].title)
  check(state.selectedTab == .vp && state.chatContext==state.journeys[0].title,"return context kept in same state")
  state.draft="少走一点";state.submit()
  check(state.messages.count==5 && state.journeys[0].id==originalJourneyID,"same context continues without creating journey")
  state.cancelPlan()
  check(!state.pendingConfirmation && !state.journeys[0].confirmed,"cancel preserves unconfirmed original fixture")
  state.confirmPlan()
  check(!state.journeys[0].confirmed,"no pending confirmation means no implicit confirm")
  state.draft="保留这份本地安排";state.submit();state.confirmPlan()
  check(state.journeys[0].confirmed && !state.pendingConfirmation,"only explicit shared confirm changes fixture flag")
  check(state.materials.first{$0.id==originalMaterial.id}?.content==originalMaterial.content,"confirmation does not invent content changes")
  let old=state.selectedJourneyID;state.openJourney("missing")
  check(state.selectedJourneyID==old,"unknown journey rejected")
  state.screenState = .loading;state.screenState = .cancelled;state.screenState = .ready
  check(state.journeys[0].confirmed,"loading cancellation does not lose content")
  state.reset()
  check(state.messages.count==1 && !state.journeys[0].confirmed && state.chatContext==nil,"shared reset resets coherent fixture")
  print("PASS \(n) shared-state chat contract checks; local fixtures only")
 }
}
