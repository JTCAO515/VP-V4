import Foundation
import Observation
import SwiftUI

struct NativeMemoryProfile: Decodable, Identifiable, Equatable {
    let id: String
    let revision: Int
    let state: String
    let constraintKind: String
    let summary: String?
    let sourceReceiptId: String
    let consentId: String
    let consentStatus: String
    let createdAt: String
    let updatedAt: String
    var eligible: Bool { ["explicit", "confirmed"].contains(state) && consentStatus == "granted" && summary != nil }
    var valid: Bool {
        [id, sourceReceiptId, consentId].allSatisfy(NativeMemoryWire.uuid)
        && (1...9_007_199_254_740_991).contains(revision)
        && ["explicit", "confirmed", "inferred", "rejected", "paused", "deleted"].contains(state)
        && ["preference", "hard_constraint"].contains(constraintKind) && !(state=="inferred" && constraintKind=="hard_constraint")
        && ["granted", "revoked"].contains(consentStatus)
        && (state == "deleted" || consentStatus == "revoked" ? summary == nil : summary.map(NativeMemoryWire.summary) == true)
        && NativeKnowledgeRead.date(createdAt) != nil && NativeKnowledgeRead.date(updatedAt) != nil
    }
}
struct NativeMemoryReceipt: Decodable {
    let version: Int
    let ownerId: String
    let action: String
    let operationId: String
    let memoryId: String?
    let consentId: String
    let sourceReceiptId: String?
    let revision: Int?
    let state: String?
    let reused: Bool
    let undoAvailable: Bool
}
enum NativeMemoryWire {
    static func uuid(_ s: String) -> Bool { UUID(uuidString:s)?.uuidString.lowercased() == s }
    static func summary(_ s: String) -> Bool {
        !s.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty && s.unicodeScalars.count <= 500
        && !s.unicodeScalars.contains(where:{$0.value < 32 && ![9,10,13].contains($0.value)})
    }
    static func rows(_ raw: Any?) throws -> [NativeMemoryProfile] {
        guard let rows=raw as? [[String:Any]], rows.count<=100 else {throw NativeDataError.invalidResponse}
        let keys:Set<String>=["id","revision","state","constraintKind","summary","sourceReceiptId","consentId","consentStatus","createdAt","updatedAt"]
        guard rows.allSatisfy({Set($0.keys)==keys}) else {throw NativeDataError.invalidResponse}
        let result=try JSONDecoder().decode([NativeMemoryProfile].self,from:JSONSerialization.data(withJSONObject:rows))
        guard result.allSatisfy(\.valid),Set(result.map(\.id)).count==result.count else {throw NativeDataError.invalidResponse};return result
    }
    static func read(_ bytes:Data,owner:String) throws -> [NativeMemoryProfile] {
        guard bytes.count<=256_000,let root=try JSONSerialization.jsonObject(with:bytes) as? [String:Any],Set(root.keys)==Set(["version","ownerId","profiles"]),root["version"] as? Int==1,root["ownerId"] as? String==owner else{throw NativeDataError.invalidResponse}
        return try rows(root["profiles"])
    }
    static func write(_ bytes:Data,owner:String,command:NativeMemoryCommand) throws -> (NativeMemoryReceipt,[NativeMemoryProfile]) {
        guard bytes.count<=256_000,let root=try JSONSerialization.jsonObject(with:bytes) as? [String:Any],Set(root.keys)==Set(["version","receipt","profiles"]),root["version"] as? Int==1,let raw=root["receipt"] as? [String:Any],Set(raw.keys)==Set(["version","ownerId","action","operationId","memoryId","consentId","sourceReceiptId","revision","state","reused","undoAvailable"]) else{throw NativeDataError.invalidResponse}
        let r=try JSONDecoder().decode(NativeMemoryReceipt.self,from:JSONSerialization.data(withJSONObject:raw))
        guard r.version==1,r.ownerId==owner,r.action==command.action,r.operationId==command.operationID,uuid(r.consentId) else{throw NativeDataError.invalidResponse}
        if command.action=="consentCreate" {
            guard r.memoryId==nil,r.sourceReceiptId==nil,r.revision==nil,r.state==nil,!r.undoAvailable else{throw NativeDataError.invalidResponse}
        }else {
            guard r.memoryId==command.memoryID,r.sourceReceiptId.map(uuid)==true,(r.revision ?? 0)>0,["explicit","confirmed","inferred","paused","rejected","deleted"].contains(r.state ?? ""),["create","update"].contains(r.action) || !r.undoAvailable else{throw NativeDataError.invalidResponse}
            if let expected=command.sourceReceiptID {guard r.sourceReceiptId==expected else{throw NativeDataError.invalidResponse}}
        }
        if let consent=command.consentID {guard r.consentId==consent else{throw NativeDataError.invalidResponse}}
        if command.action=="createUndo" {guard r.revision==2,r.state=="deleted",!r.undoAvailable else{throw NativeDataError.invalidResponse}}
        if ["update","updateUndo"].contains(command.action) {guard r.revision==command.expectedRevision.map({$0+1}),["explicit","confirmed"].contains(r.state ?? "") else{throw NativeDataError.invalidResponse}}
        if command.action=="revoke" {guard r.revision==command.expectedRevision,!r.undoAvailable else{throw NativeDataError.invalidResponse}}
        let profiles=try rows(root["profiles"])
        guard command.action=="consentCreate" ? profiles.isEmpty : profiles.count==1 && profiles.first?.id==command.memoryID else{throw NativeDataError.invalidResponse}
        return (r,profiles)
    }
}
struct NativeMemoryCommand {
    let action:String
    let operationID:String
    let memoryID:String?
    let sourceReceiptID:String?
    let consentID:String?
    let expectedRevision:Int?
    let expectedSummary:String?
    let body:Data
    init(action:String,profile:NativeMemoryProfile?=nil,summary:String?=nil,kind:String="preference",consentID:String?=nil,updateOperationID:String?=nil) throws {
        let operation=UUID().uuidString.lowercased()
        var fields:[String:Any]=["action":action,"operationId":operation]
        switch action {
        case "consentCreate":break
        case "create":
            guard let summary,NativeMemoryWire.summary(summary),let consentID,NativeMemoryWire.uuid(consentID),["preference","hard_constraint"].contains(kind) else{throw NativeDataError.invalidResponse}
            fields.merge(["memoryId":UUID().uuidString.lowercased(),"receiptId":UUID().uuidString.lowercased(),"consentId":consentID,"constraintKind":kind,"summary":summary,"saveLongTerm":true]){_,new in new}
        case "update","updateUndo","createUndo","state","revoke":
            guard let profile,profile.valid else{throw NativeDataError.invalidResponse}
            fields.merge(["memoryId":profile.id,"sourceReceiptId":profile.sourceReceiptId,"expectedRevision":profile.revision]){_,new in new}
            if action=="update" {guard profile.eligible,let summary,NativeMemoryWire.summary(summary) else{throw NativeDataError.invalidResponse};fields["summary"]=summary;fields["saveLongTerm"]=true}
            if action=="updateUndo" {guard let updateOperationID,NativeMemoryWire.uuid(updateOperationID) else{throw NativeDataError.invalidResponse};fields["updateOperationId"]=updateOperationID}
            if action=="createUndo" {guard profile.revision==1,profile.state=="explicit",profile.eligible else{throw NativeDataError.invalidResponse}}
            if action=="state" {guard let summary,["paused","explicit","confirmed","rejected","deleted"].contains(summary) else{throw NativeDataError.invalidResponse};fields["state"]=summary}
        default:throw NativeDataError.invalidResponse
        }
        self.action=action;operationID=operation;memoryID=fields["memoryId"] as? String
        sourceReceiptID=fields["sourceReceiptId"] as? String ?? fields["receiptId"] as? String
        self.consentID=profile?.consentId ?? fields["consentId"] as? String
        expectedRevision=fields["expectedRevision"] as? Int;expectedSummary=["create","update"].contains(action) ? summary:nil
        body=try JSONSerialization.data(withJSONObject:fields,options:.sortedKeys)
    }
}
@MainActor @Observable final class NativeMemoryPreferencesStore {
    struct Undo {
        let profile:NativeMemoryProfile
        let updateOperationID:String?
        let deadline:TimeInterval
        let operationID:String
    }
    private(set) var profiles:[NativeMemoryProfile]=[]
    private(set) var scope:NativeDataScope?
    private(set) var pending:NativeMemoryCommand?
    private(set) var undo:Undo?
    private(set) var toast:String?
    private(set) var notice:String?
    private(set) var busy=false
    private var generation=UUID()
    private var deadline:TimeInterval=0
    private var createIntent:(summary:String,kind:String)?
    private var acknowledged=Set<String>()
    func clear(){generation=UUID();scope=nil;profiles=[];pending=nil;undo=nil;toast=nil;notice=nil;busy=false;deadline=0;createIntent=nil;acknowledged=[]}
    func bind(_ next:NativeDataScope?){if scope != next {clear();scope=next}}
    func visible(_ current:NativeDataScope?)->[NativeMemoryProfile]{guard current != nil,current==scope,ProcessInfo.processInfo.systemUptime<deadline else{return []};return profiles}
    func usableUndo(_ current:NativeDataScope?)->Undo? {
        guard current==scope,let undo,ProcessInfo.processInfo.systemUptime<undo.deadline,visible(current).contains(undo.profile),undo.profile.eligible else{return nil};return undo
    }
    func abandon(){pending=nil;createIntent=nil;undo=nil;toast=nil;notice=nil;profiles=[];deadline=0;generation=UUID()}
    func dismissToast(_ operation:String){if toast==operation{toast=nil}}
    func load(scope requested:NativeDataScope,current:()->NativeDataScope?,get:()async throws->Data)async {
        bind(requested);guard current()==requested,!busy else{return};let own=generation,started=ProcessInfo.processInfo.systemUptime
        busy=true;defer{if generation==own{busy=false}}
        do {
            let bytes=try await get();guard generation==own,current()==requested,!Task.isCancelled else{return}
            profiles=try NativeMemoryWire.read(bytes,owner:requested.subject);deadline=started+30
            qualifyUndo();notice=nil
        }catch{guard generation==own,current()==requested else{return};failed(error)}
    }
    func create(summary:String,kind:String,current:@escaping()->NativeDataScope?,post:(Data)async throws->Data)async {
        guard pending==nil,!busy,let currentScope=current(),currentScope==scope,NativeMemoryWire.summary(summary) else{return}
        createIntent=(summary,kind)
        do {pending=try .init(action:"consentCreate")}catch{notice="invalid";return}
        await submit(current:current,post:post)
    }
    func change(_ action:String,profile:NativeMemoryProfile,summary:String?=nil,current:@escaping()->NativeDataScope?,post:(Data)async throws->Data)async {
        guard pending==nil,!busy,visible(current()).contains(profile) else{return}
        do {pending=try .init(action:action,profile:profile,summary:summary)}catch{notice="invalid";return}
        await submit(current:current,post:post)
    }
    func undoSave(current:@escaping()->NativeDataScope?,post:(Data)async throws->Data)async {
        guard pending==nil,!busy,let source=usableUndo(current()) else{return}
        do {pending=try .init(action:source.updateOperationID==nil ? "createUndo":"updateUndo",profile:source.profile,updateOperationID:source.updateOperationID)}catch{notice="invalid";return}
        await submit(current:current,post:post)
    }
    func retry(current:@escaping()->NativeDataScope?,post:(Data)async throws->Data)async {await submit(current:current,post:post)}
    private func submit(current:@escaping()->NativeDataScope?,post:(Data)async throws->Data)async {
        guard !busy,let command=pending,let selected=scope,current()==selected else{return}
        let own=generation,started=ProcessInfo.processInfo.systemUptime
        busy=true
        defer{if generation==own{busy=false}}
        do {
            let bytes=try await post(command.body);guard generation==own,current()==selected,!Task.isCancelled else{return}
            let (receipt,rows)=try NativeMemoryWire.write(bytes,owner:selected.subject,command:command)
            profiles=rows;deadline=started+30;pending=nil;toast=nil;notice=nil;busy=false
            qualifyUndo()
            if command.action=="consentCreate",let intent=createIntent {
                createIntent=nil
                pending=try .init(action:"create",summary:intent.summary,kind:intent.kind,consentID:receipt.consentId)
                await submit(current:current,post:post);return
            }
            createIntent=nil
            if ["create","update"].contains(command.action) {
                guard let row=rows.first(where:{$0.id==command.memoryID}),row.eligible,row.revision==receipt.revision,row.sourceReceiptId==receipt.sourceReceiptId,row.consentId==receipt.consentId,row.summary==command.expectedSummary,
                      command.action != "update" || row.revision==command.expectedRevision.map({$0+1}) else{undo=nil;notice="changed";return}
                if acknowledged.insert(command.operationID).inserted {toast=command.operationID}
                if receipt.undoAvailable,command.action != "create" || row.revision==1 {
                    let age=command.action=="update" ? max(0,Date().timeIntervalSince(NativeKnowledgeRead.date(row.updatedAt)!)):0
                    if age<600 {undo = .init(profile:row,updateOperationID:command.action=="update" ? command.operationID:nil,deadline:started+600-age,operationID:command.operationID)}
                }
            }else if ["createUndo","updateUndo"].contains(command.action) {undo=nil;notice="undone"}
        }catch{guard generation==own,current()==selected else{return};failed(error)}
        if generation==own {busy=false}
    }
    private func qualifyUndo(){if let value=undo,!profiles.contains(value.profile) || !value.profile.eligible{undo=nil;toast=nil}}
    private func failed(_ error:Error) {
        profiles=[];deadline=0;undo=nil;toast=nil
        if case NativeDataError.server(let code)=error {
            if ["UNAUTHENTICATED","FORBIDDEN"].contains(code){clear();return}
            notice=["MEMORY_CONFLICT","MEMORY_OPERATION_REUSE","MEMORY_ID_REUSE","MEMORY_UNDO_EXPIRED","CONSENT_REQUIRED","TERMINAL_MEMORY","INVALID_MEMORY_TRANSITION"].contains(code) ? "conflict":"unconfirmed"
        }else{notice="unconfirmed"}
    }
}

struct NativeMemoryPreferencesView: View {
    let session:NativeSession
    let chinese:Bool
    var active=true
    var currentInput:String=""
    var selectedMemoryIDs:[String]=[]
    var onThisTime:((String)->Void)?
    var onUse:((NativeMemoryProfile)->Void)?
    var onPending:((NativeDataScope?,Bool)->Void)?
    @Environment(\.scenePhase) private var phase
    @State private var summary=""
    @State private var kind="preference"
    @State private var editedID:String?
    @State private var saveLongTerm=false
    @State private var revokeProfile:NativeMemoryProfile?
    @FocusState private var undoKeyboardFocused:Bool
    @AccessibilityFocusState private var undoAccessibilityFocused:Bool
    private var store:NativeMemoryPreferencesStore {session.memoryPreferences}
    private var foreground:Bool{active && phase == .active}
    private func t(_ zh:String,_ en:String)->String{chinese ? zh:en}
    private var edited:NativeMemoryProfile?{store.visible(session.dataScope).first{$0.id==editedID}}
    var body:some View {
        VStack(alignment:.leading,spacing:10){
            Text(t("明确偏好与记忆","Explicit preferences and Memory")).font(.headline)
            if foreground,store.toast != nil,let undo=store.usableUndo(session.dataScope) {
                HStack {
                    Text(t("已加入记忆","Saved to memory"))
                    Button(t("撤销","Undo")){Task{await store.undoSave(current:{session.dataScope},post:{try await session.memoryProfilesCommand($0)})}}
                        .disabled(store.busy).focused($undoKeyboardFocused).accessibilityFocused($undoAccessibilityFocused)
                        .accessibilityIdentifier("memory.profiles.undo")
                }
                .task(id:"\(undo.operationID)-\(store.busy)-\(undoKeyboardFocused)-\(undoAccessibilityFocused)"){
                    guard !store.busy,!undoKeyboardFocused,!undoAccessibilityFocused else{return}
                    do{try await Task.sleep(for:.seconds(4))}catch{return};store.dismissToast(undo.operationID)
                }
            }
            if foreground {
                TimelineView(.periodic(from:.now,by:1)){_ in
                    ForEach(store.visible(session.dataScope)){profile in
                        VStack(alignment:.leading,spacing:6){
                            Text(profile.summary ?? t("此记忆已撤回或删除","This Memory was withdrawn or deleted"))
                            Text("\(profile.state) · \(profile.consentStatus) · r\(profile.revision)").font(.caption)
                            if profile.eligible {
                                Button(t("纠正这一条记忆","Correct this Memory")){editedID=profile.id;summary=profile.summary ?? "";kind=profile.constraintKind;saveLongTerm=false}
                                if let onUse {Button(selectedMemoryIDs.contains(profile.id) ? t("移除此记忆引用","Remove this Memory reference"):t("明确引用此记忆","Explicitly reference this Memory")){onUse(profile)}}
                                Button(t("暂停使用","Pause use")){Task{await store.change("state",profile:profile,summary:"paused",current:{session.dataScope},post:{try await session.memoryProfilesCommand($0)})}}
                            }
                            if profile.state=="paused",profile.consentStatus=="granted" {
                                Button(t("恢复为明确偏好","Resume as an explicit preference")){Task{await store.change("state",profile:profile,summary:"explicit",current:{session.dataScope},post:{try await session.memoryProfilesCommand($0)})}}
                            }
                            if !["deleted","rejected"].contains(profile.state),profile.consentStatus=="granted" {
                                Button(t("撤回检索授权","Withdraw retrieval consent"),role:.destructive){revokeProfile=profile}
                                Button(t("删除这一条记忆","Delete this Memory"),role:.destructive){Task{await store.change("state",profile:profile,summary:"deleted",current:{session.dataScope},post:{try await session.memoryProfilesCommand($0)})}}
                            }
                        }.disabled(store.pending != nil || store.busy)
                    }
                }
                if store.visible(session.dataScope).isEmpty {Text(t("尚无当前可读记忆，或读取已过期。请刷新。","No currently readable Memory, or the read expired. Please refresh."))}
            }
            Text(editedID==nil ? t("新增明确偏好或限制","Add an explicit preference or constraint"):t("纠正选中的同一条记忆","Correct the same selected Memory"))
            TextField(t("描述你的偏好或纠正","Describe your preference or correction"),text:$summary,axis:.vertical).lineLimit(2...5)
                .accessibilityIdentifier("memory.profiles.summary")
            if onThisTime != nil {
                Button(t("采用当前对话输入","Use current conversation input")){summary=currentInput;saveLongTerm=false}.disabled(currentInput.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty)
            }
            if editedID==nil {Picker(t("类型","Kind"),selection:$kind){Text(t("偏好","Preference")).tag("preference");Text(t("明确限制","Hard constraint")).tag("hard_constraint")}}
            Toggle(t("明确长期保存，授权以后检索此偏好","Save long term and allow future retrieval"),isOn:$saveLongTerm)
                .accessibilityIdentifier("memory.profiles.long-term")
            Text(t("仅本次覆盖会留在当前输入中，不修改长期记忆；长期纠正会更新选中的同一条记录。","A this-time override stays in current input and leaves long-term Memory unchanged. Long-term corrections update the same selected record.")).font(.footnote)
            if let onThisTime {Button(t("仅用于本次输入","Use only for this input")){onThisTime(trimmed);saveLongTerm=false}.disabled(!NativeMemoryWire.summary(trimmed) || store.pending != nil)}
            Button(editedID==nil ? t("明确保存长期记忆","Save explicit long-term Memory"):t("明确保存这次纠正","Save this correction explicitly")){
                guard saveLongTerm else{return}
                let text=trimmed
                Task {
                    if let edited {await store.change("update",profile:edited,summary:text,current:{session.dataScope},post:{try await session.memoryProfilesCommand($0)})}
                    else if editedID==nil {await store.create(summary:text,kind:kind,current:{session.dataScope},post:{try await session.memoryProfilesCommand($0)})}
                }
            }.disabled(!saveLongTerm || !NativeMemoryWire.summary(trimmed) || store.pending != nil || store.busy || !foreground || session.dataScope==nil || editedID != nil && edited?.eligible != true)
                .accessibilityIdentifier("memory.profiles.save")
            if editedID != nil {Button(t("取消纠正，新增另一条","Cancel correction and add another")){editedID=nil;summary="";saveLongTerm=false}}
            if store.pending != nil {
                Button(t("重试同一次操作","Retry the same operation")){Task{await store.retry(current:{session.dataScope},post:{try await session.memoryProfilesCommand($0)})}}.disabled(store.busy)
                Button(t("放弃未确认操作并重新读取","Discard unconfirmed operation and reread")){store.abandon();Task{await reload()}}.disabled(store.busy)
            }
            if let notice=store.notice {Text(notice=="undone" ? t("已撤销；当前版本已重新读取。","Undone; the current version was read back."):notice=="changed" || notice=="conflict" ? t("记录已变化或操作冲突，请刷新后重新明确选择。","The record changed or conflicted. Refresh and explicitly choose again."):t("操作尚未确认，不能宣称已保存。","Operation unconfirmed; no save is claimed."))}
            Button(t("刷新记忆","Refresh Memory")){Task{await reload()}}.disabled(store.busy || session.dataScope==nil)
        }
        .confirmationDialog(t("撤回此授权？共享同一授权的记忆都将停止检索。","Withdraw this consent? Every Memory sharing it will stop being retrieved."),isPresented:Binding(get:{revokeProfile != nil},set:{if !$0{revokeProfile=nil}})){
            Button(t("明确撤回","Withdraw explicitly"),role:.destructive){guard let profile=revokeProfile else{return};revokeProfile=nil;Task{await store.change("revoke",profile:profile,current:{session.dataScope},post:{try await session.memoryProfilesCommand($0)})}}
        }
        .task(id:Load(scope:session.dataScope,active:foreground)){store.bind(session.dataScope);if foreground{await reload()}}
        .onChange(of:session.dataScope){_,_ in store.bind(session.dataScope);summary="";editedID=nil;saveLongTerm=false;revokeProfile=nil}
        .onChange(of:store.pending?.operationID,initial:true){_,_ in onPending?(session.dataScope,store.pending != nil)}
    }
    private var trimmed:String{summary.trimmingCharacters(in:.whitespacesAndNewlines)}
    private func reload()async {guard foreground,let scope=session.dataScope else{return};await store.load(scope:scope,current:{session.dataScope},get:{try await session.memoryProfilesRequest()})}
    private struct Load:Equatable{let scope:NativeDataScope?;let active:Bool}
}
struct NativeMemoryHomeView:View {
    var isActive=true
    var onSwitchBlock:((Bool)->Void)?
    @Environment(AppSettings.self) private var settings
    var body:some View {
        ScrollView{VStack(alignment:.leading,spacing:16){
            NativeMemoryPreferencesView(session:settings.nativeSession,chinese:settings.selectedLocale == .zh,active:isActive,onPending:{scope,blocked in if scope==settings.nativeSession.dataScope{onSwitchBlock?(blocked)}})
            NavigationLink(settings.selectedLocale == .zh ? "已保存旅行节奏":"Saved travel pace"){NativeTravelPaceView()}
        }.padding()}.navigationTitle(settings.selectedLocale == .zh ? "记忆":"Memory")
    }
}
