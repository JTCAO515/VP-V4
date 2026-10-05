import SwiftUI

struct NativeMemoryDeletionView:View {
    let session:NativeSession
    let chinese:Bool
    @Environment(\.scenePhase) private var phase
    @State private var store: NativeMemoryDeletionStore
    @State private var reviewedIdentity:String?
    @State private var exportsReviewed=false
    @State private var confirmVisible=false
    @State private var retryVisible=false
    @State private var task:Task<Void,Never>?
    @State private var journalNotice=false
    @State private var completedAcknowledgedRequestID:String?
    init(session: NativeSession, chinese: Bool) {
        self.session = session; self.chinese = chinese; _store = State(initialValue: NativeMemoryDeletionStore())
    }
    init(session: NativeSession, chinese: Bool, store: NativeMemoryDeletionStore) {
        self.session = session; self.chinese = chinese; _store = State(initialValue: store)
    }
    private func t(_ zh:String,_ en:String)->String{chinese ? zh:en}
    var body:some View {
        Form {
            Section(t("明确选择记忆（1–100条）", "Explicitly select Memory (1–100)")) {
                Text(t("使用当前账号的真实记忆管理记录。服务端要求五分钟内重新登录；token refresh 不是重新认证。", "Uses real management records for this account. The server requires a sign-in within five minutes; token refresh is not reauthentication."))
                Button(t("读取本机持久请求并恢复", "Read and recover the persisted device request")){run{await restore()}}.disabled(store.busy)
                Button(t("读取当前记忆管理列表", "Read current Memory management list")){resetReview();run{await load()}}.disabled(store.busy)
                TimelineView(.periodic(from:.now,by:1)){_ in
                    ForEach(store.visibleProfiles(session.dataScope)){profile in
                        Toggle(isOn:Binding(get:{store.selected.contains(profile.id)},set:{store.select(profile.id,chosen:$0,current:session.dataScope);resetReview()})) {
                            VStack(alignment:.leading){Text(profile.summary ?? t("摘要已撤回或不可读", "Summary withdrawn/unreadable"));Text("\(profile.id) · r\(profile.revision) · \(profile.sourceReceiptId)").font(.caption).textSelection(.enabled)}
                        }.disabled(store.busy || store.command != nil || ["deleted","rejected"].contains(profile.state))
                    }
                }
                Button(t("取得这组选择的服务器预览", "Get server preview for this selection")){resetReview();run{await store.preview(current:{session.dataScope},post:{try await session.memoryDeletionRequest(body:$0)})}}
                    .disabled(store.busy || store.command != nil || store.selected.isEmpty)
            }
            TimelineView(.periodic(from:.now,by:1)){_ in
                if let plan=store.visiblePlan(session.dataScope) {
                    Section(t("精确服务器删除范围", "Exact server deletion scope")) {
                        Text(plan.planId).font(.caption).textSelection(.enabled)
                        Text("source r\(plan.sourceRevision) · \(plan.scopeDigest)").font(.caption)
                        ForEach(plan.selection.memories,id:\.memoryId){memory in Text("\(memory.memoryId) · r\(memory.revision) · \(memory.sourceReceiptId)").font(.caption)}
                        ForEach(plan.selection.groups,id:\.0){group in
                            Text("\(group.0): \(group.1.count)")
                            ForEach(group.1,id:\.self){id in Text(id).font(.caption).textSelection(.enabled)}
                        }
                        Text(t("列出的生成结果及其副本作为完整生成成果清理；列出的当前账号核心导出包／执行中导出整包失效，不声称有精确的‘仅含此记忆’清单。", "Listed generated results/copies are cleared as whole generated artifacts. Listed account core-export packages/in-flight exports are invalidated in full; no exact ‘only this Memory’ export inventory is claimed."))
                        Text(t("保留原用户聊天输入、Trip意图及财务记录。外部保存、模型服务商与备份副本不声明已清除。", "Original user chat input, Trip intent and financial records are retained. External/provider/backup copies are not declared erased."))
                        ForEach(plan.conflicts,id:\.self){Text($0).foregroundStyle(.red)}
                        Toggle(t("我已核对这组完整派生／导出范围", "I reviewed this whole derived/export-copy scope"),isOn:$exportsReviewed)
                        Button(t("明确确认这份预览", "Explicitly confirm this preview"),role:.destructive){reviewedIdentity=plan.reviewIdentity;confirmVisible=true}
                            .disabled(store.busy || !exportsReviewed || !plan.conflicts.isEmpty || store.command != nil)
                    }
                }
            }
            if let command=store.command {
                Section(t("同一请求的真实状态", "Actual status of the same request")) {
                    Text(command.requestId).font(.caption).textSelection(.enabled)
                    if let receipt=store.receipt {
                        Text(receipt.state=="queued" ? t("所选原文记忆已作删除标记；派生引用／生成输出／导出清理尚未完成。", "Selected canonical Memory summaries are tombstoned; derived-reference/generated-output/export cleanup remains pending.") : t("此精确范围的派生清理已完成；不是全部账号删除。", "Derived cleanup for this exact scope completed; not all-account erasure."))
                        ForEach(receipt.deletedRevisions,id:\.memoryId){row in Text("\(row.memoryId) · deleted r\(row.revision)").font(.caption)}
                    }else{Text(t("请求结果尚未确认，不声明原文或派生资料已删除。", "Request outcome unconfirmed; neither canonical nor derived erasure is claimed."))}
                    Button(t("只读恢复同一 request 回执", "Read-only recovery of this request receipt")){run{await store.read(current:{session.dataScope},get:{try await session.memoryDeletionRequest(requestID:$0)});finishReceipt()}}.disabled(store.busy)
                    if store.receipt==nil {
                        Button(t("明确重试原始请求字节", "Explicitly retry original request bytes")){retryVisible=true}.disabled(store.busy)
                    }
                    if store.receipt?.state=="completed",!journalNotice {
                        Button(t("另行明确选择新的删除范围", "Explicitly choose another deletion scope")){store.newSelectionAfterCompletion();resetReview();run{await load()}}
                    }
                }
            }
            if store.notice != nil || journalNotice {
                Text(store.notice=="reauth" ? t("请返回账号页明确重新登录后再预览。刷新 token 不满足最近认证。", "Return to Account and explicitly sign in again before previewing. Token refresh is not recent authentication.") : t("权限、网络或受保护恢复记录未确认，可能尚未启用此接口；保留原请求，不宣称完成。", "Authority/network/protected recovery record unconfirmed; this API may be disabled. Original request retained; no completion claimed."))
            }
        }.navigationTitle(t("记忆及派生资料删除", "Memory and derived-data deletion"))
        .task(id:session.dataScope){await restore()}
        .onChange(of:session.dataScope){_,_ in task?.cancel();resetReview();completedAcknowledgedRequestID=nil;store.bind(session.dataScope)}
        .onChange(of:phase){_,value in if value != .active{task?.cancel();resetReview();store.bind(nil)}else{run{await restore()}}}
        .onDisappear{task?.cancel();resetReview();store.bind(nil)}
        .confirmationDialog(t("确认这组记忆及完整派生范围？", "Confirm this Memory and whole derived-data scope?"),isPresented:$confirmVisible,titleVisibility:.visible){
            Button(t("确认所选精确范围", "Confirm this exact selection"),role:.destructive){if let reviewedIdentity{run{await store.confirm(reviewedIdentity:reviewedIdentity,exportsReviewed:exportsReviewed,current:{session.dataScope},persist:{try session.rememberMemoryDeletion($0,body:$1)},post:{try await session.memoryDeletionRequest(body:$0)});finishReceipt()}}}
            Button(t("继续核对", "Keep reviewing"),role:.cancel){}
        }.confirmationDialog(t("明确重试同一已持久请求？", "Explicitly retry the same persisted request?"),isPresented:$retryVisible,titleVisibility:.visible){
            Button(t("重试同一 request 和原始 body", "Retry the same request/original body")){run{await store.retry(current:{session.dataScope},post:{try await session.memoryDeletionRequest(body:$0)});finishReceipt()}}
            Button(t("继续只读核对", "Keep reading"),role:.cancel){}
        }
    }
    private func resetReview(){reviewedIdentity=nil;exportsReviewed=false;confirmVisible=false;retryVisible=false}
    private func run(_ operation:@escaping @MainActor () async -> Void){task?.cancel();task=Task{await operation()}}
    private func load() async {await store.load(current:{session.dataScope},get:{try await session.memoryProfilesRequest()})}
    private func restore() async {
        resetReview();store.bind(session.dataScope);journalNotice=false
        guard let scope=session.dataScope else{return}
        do {if let journal=try session.memoryDeletionRecovery(){try store.restore(journal,current:scope);await store.read(current:{session.dataScope},get:{try await session.memoryDeletionRequest(requestID:$0)});finishReceipt()}else{await load()}}
        catch{journalNotice=true}
    }
    private func finishReceipt(){
        guard let receipt=store.receipt else{return}
        if receipt.sourceTombstoned{session.memoryPreferences.clear()}
        if receipt.state=="completed",completedAcknowledgedRequestID != receipt.requestId{do{try session.completeMemoryDeletion(receipt);completedAcknowledgedRequestID=receipt.requestId;journalNotice=false}catch{journalNotice=true}}
    }
}
