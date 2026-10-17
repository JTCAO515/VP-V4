import Foundation
@main struct ChatChecks {
 @MainActor static func main() {
  let state = NativeFrontendState(); var n = 0
  func check(_ value: Bool, _ name: String) { precondition(value,name); n += 1 }
  let originalJourneyID = state.journeys[0].id
  let originalMaterial = state.materials.first{$0.id=="sample-plan"}!
  state.draft=" \n";state.submit()
  check(state.messages.count==0 && !state.pendingConfirmation,"empty input does not invent output")
  state.draft="想走走，日期没定";state.submit()
  check(state.messages.count==2 && state.messages[0].text=="想走走，日期没定","literal no-date input uses shared submit")
  check(state.draft.isEmpty && state.pendingConfirmation,"shared result ready for explicit review")
  check(state.journeys.count==1 && state.journeys[0].id==originalJourneyID,"no second fixture journey")
  state.openMaterial("sample-plan")
  check(state.selectedTab == .library && state.selectedMaterialID==originalMaterial.id,"same material crosses tabs")
  state.openJourney(originalJourneyID)
  check(state.selectedTab == .journeys && state.selectedJourneyID==originalJourneyID,"same journey crosses tabs")
  state.openChat(context:state.journeys[0].title)
  check(state.selectedTab == .vp && state.chatContext==state.journeys[0].title,"return context kept in same state")
  state.draft="少走一点";state.submit()
  check(state.messages.count==4 && state.journeys[0].id==originalJourneyID,"same context continues without creating journey")
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
  check(state.messages.count==0 && !state.journeys[0].confirmed && state.chatContext==nil,"shared reset resets coherent fixture")
  let fresh = NativeFrontendState()
  check(fresh.messages.isEmpty, "new conversation body is quiet")
  fresh.startLocalConversation()
  check(fresh.messages.isEmpty && fresh.localConversations.count==2, "empty new avoids duplicate blank sessions")
  fresh.draft="未发送草稿";fresh.chatContext="sample-shanghai";fresh.pendingConfirmation=true
  let firstID=fresh.activeLocalConversationID
  fresh.startLocalConversation()
  let secondID=fresh.activeLocalConversationID
  check(secondID != firstID && fresh.messages.isEmpty && fresh.draft.isEmpty && fresh.chatContext==nil && !fresh.pendingConfirmation,"new isolates draft/context/pending")
  fresh.draft="第二个会话的草稿"
  fresh.selectLocalConversation(firstID)
  check(fresh.draft=="未发送草稿" && fresh.chatContext=="sample-shanghai" && fresh.pendingConfirmation,"history restores first session fields")
  fresh.selectLocalConversation(secondID)
  check(fresh.draft=="第二个会话的草稿" && fresh.chatContext==nil && !fresh.pendingConfirmation,"switch restores separate second draft")
  fresh.selectLocalConversation("sample-history")
  check(fresh.messages.count==2 && fresh.chatContext=="sample-shanghai" && fresh.draft.isEmpty,"explicit local history sample only")
  let historyID=fresh.activeLocalConversationID;fresh.selectLocalConversation("unknown")
  check(fresh.activeLocalConversationID==historyID,"unknown history cannot select another session")
  fresh.pendingConfirmation=true;fresh.journeys=[];fresh.confirmPlan()
  check(fresh.journeys.isEmpty && fresh.pendingConfirmation,"missing sample journey cannot fake confirmation")
  print("PASS \(n) shared-state chat contract checks; local fixtures only")
 }
}
