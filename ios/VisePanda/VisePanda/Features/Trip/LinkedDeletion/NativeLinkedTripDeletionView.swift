import SwiftUI

struct NativeLinkedTripDeletionView:View {
    let tripID:String
    let headVersion:Int
    var onQueued:((String)->Void)?
    @Environment(AppSettings.self) private var settings
    @Environment(\.scenePhase) private var phase
    @State private var store: NativeLinkedTripDeletionStore
    @State private var reviewed=false
    @State private var exportsReviewed=false
    @State private var confirmation=false
    @State private var reviewedIdentity:String?
    init(tripID: String, headVersion: Int, onQueued: ((String) -> Void)? = nil) {
        self.tripID = tripID; self.headVersion = headVersion; self.onQueued = onQueued
        _store = State(initialValue: NativeLinkedTripDeletionStore())
    }
    init(tripID: String, headVersion: Int, onQueued: ((String) -> Void)? = nil, store: NativeLinkedTripDeletionStore) {
        self.tripID = tripID; self.headVersion = headVersion; self.onQueued = onQueued
        _store = State(initialValue: store)
    }
    private var session:NativeSession{settings.nativeSession}
    private var chinese:Bool{settings.selectedLocale == .zh}
    private var selected:NativeLinkedTripDeleteSelection?{guard phase == .active,let scope=session.dataScope else{return nil};return .init(scope:scope,tripID:tripID,headVersion:headVersion)}
    private func t(_ zh:String,_ en:String)->String{chinese ? zh:en}
    var body:some View {
        Form {
            Section {
                Text(t("仅按服务端精确预览删除当前行程及独占关联聊天；不删除其他行程／聊天／财务／全账号。需要最近重新登录。","Deletes this Trip and its exclusive linked chats only within the exact server preview. Other Trips/chats/financial/account data are excluded. A recent sign-in is required."))
                Text(tripID+" · v"+String(headVersion)).font(.caption)
                Button(t("重新读取精确范围预览","Read exact scope preview")){resetReview();Task{await store.preview(current:{selected},read:{try await session.linkedTripDeletionRequest(body:$0)})}}
                    .disabled(store.busy || selected==nil || store.requestID != nil)
            }
            TimelineView(.periodic(from:.now,by:1)){_ in
                if let plan=store.visiblePlan(selected) {
                    Section(t("待明确确认的范围","Scope requiring explicit confirmation")) {
                        Text(plan.title)
                        Text(plan.scopeDigest).font(.caption).textSelection(.enabled)
                        ForEach(plan.selection.groups,id:\.key){group in DisclosureGroup("\(group.key): \(group.ids.count)"){ForEach(group.ids,id:\.self){id in Text(id).font(.caption)}}}
                        if !plan.conflicts.isEmpty {Text(t("存在冲突，不允许提交：","Conflicts prevent submission: ")+plan.conflicts.joined(separator:", "))}
                        Toggle(t("我已逐项确认全部七类精确选区","I reviewed the exact selection in all seven categories"),isOn:Binding(get:{reviewed && reviewedIdentity==plan.reviewIdentity},set:{reviewed=$0;reviewedIdentity=$0 ? plan.reviewIdentity:nil}))
                        if !plan.selection.exportRequestIds.isEmpty {
                            Text(t("导出选区包含此账号所有列出的整份服务端 D2 核心导出副本及在途导出，不是仅含此 Trip 的副本。它们将失效／停止生成；其他原始资料与财务不变，已交付或另存的文件无法回收。","Export selection includes all listed complete server-held D2 core copies and in-flight exports on this account, not just files containing this Trip. They will be invalidated/stopped. Other source/financial data is untouched; delivered/saved files cannot be recalled."))
                            Toggle(t("我明确确认整份服务端导出副本／任务失效","I explicitly confirm invalidation of complete server export copies/jobs"),isOn:Binding(get:{exportsReviewed && reviewedIdentity==plan.reviewIdentity},set:{exportsReviewed=$0;if $0{reviewedIdentity=plan.reviewIdentity}}))
                        }
                        Text(t("保留最小金融／capacity记录；provider／备份不宣称擦除。","Minimal financial/capacity records remain; provider/backup erasure is not claimed."))
                        Button(t("明确确认此范围删除","Confirm deletion of this exact scope"),role:.destructive){confirmation=true}
                            .disabled(!reviewed || !plan.conflicts.isEmpty || !plan.selection.exportRequestIds.isEmpty && !exportsReviewed || store.busy)
                    }
                }
            }
            if let receipt=store.receipt {
                Section(t("请求绑定回执","Request-bound receipt")) {
                    Text(receipt.requestId).font(.caption).textSelection(.enabled)
                    Text(receipt.state=="queued" ? t("已排队，尚未删除完成。","Queued; deletion is not complete."):t("此精确模块已完成，不是全用户数据擦除。","This exact module completed; it is not all-user-data erasure."))
                    if let at=receipt.completedAt{Text(at).font(.caption)}
                }
            }
            if store.requestID != nil {
                Button(t("只读同一请求状态","Read the same request status only")){Task{await readStatus()}}
                    .disabled(store.busy || selected==nil)
                if store.receipt==nil {Button(t("明确重试同一已确认请求","Explicitly retry the same confirmed request")){Task{await confirm()}}.disabled(store.busy || selected==nil)}
            }
            if store.notice != nil {Text(t("权限、预览或请求结果未确认；可能需要重新登录或 API 尚未启用。没有宣称删除成功。","Authority/preview/request outcome was unconfirmed. Sign-in may be required or the API disabled; no deletion success is claimed."))}
        }.navigationTitle(t("关联聊天协同删除","Linked-chat coordinated deletion"))
        .confirmationDialog(t("删除已逐项确认的精确范围？","Delete the exact scope you reviewed?"),isPresented:$confirmation,titleVisibility:.visible){
            Button(t("明确提交此范围","Submit this exact scope"),role:.destructive){Task{await confirm()}}
        }
        .task(id:selected){store.bind(selected);resetReview()
            if let selected,let saved=try? session.pendingLinkedTripDeletion(target:selected){try? store.restore(saved,target:selected);await readStatus()}
        }
        .onChange(of:selected){_,_ in store.bind(selected);resetReview()}
        .onDisappear{store.clear()}
    }
    private func readStatus()async {
        await store.readReceipt(current:{selected},get:{try await session.linkedTripDeletionRequest(requestID:$0)})
        if let receipt=store.receipt,receipt.state=="completed",let selected{try? session.completeLinkedTripDeletion(receipt,target:selected)}
    }
    private func resetReview(){reviewed=false;exportsReviewed=false;confirmation=false;reviewedIdentity=nil}
    private func confirm()async {
        await store.confirm(reviewed:reviewed,exportsReviewed:exportsReviewed,reviewIdentity:reviewedIdentity,persist:{command,body in guard let selected else{throw NativeDataError.sessionUnavailable};try session.rememberLinkedTripDeletion(command,body:body,target:selected)},current:{selected},post:{try await session.linkedTripDeletionRequest(body:$0)})
        if let receipt=store.receipt {onQueued?(tripID);if receipt.state=="completed",let selected{try? session.completeLinkedTripDeletion(receipt,target:selected)}}
    }
}
