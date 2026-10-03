import SwiftUI

struct NativeDeviceMaterialDeleteView:View {
    let session:NativeSession
    let chinese:Bool
    @Environment(\.scenePhase) private var phase
    @State private var store=NativeDeviceMaterialDeleteStore()
    @State private var reviewedDigest:String?
    @State private var confirmVisible=false
    private func t(_ zh:String,_ en:String)->String{chinese ? zh:en}
    var body:some View {
        Form {
            Section(t("只删除所选本机审阅副本", "Delete selected device review copies only")) {
                Text(t("仅操作当前账号、当前接入与会话下的本机截图收件箱。不删除照片图库、其他账号、未选择的文件、已导出的外部副本或服务器资料；不代表全部账号数据删除。", "Only this account/connection/session's device screenshot inbox is affected. Photo library, other owners, unselected files, external exported copies and server data are excluded. This does not complete all-account erasure."))
                Button(t("刷新精确文件预览", "Refresh exact file preview")){reviewedDigest=nil;confirmVisible=false;store.refresh(using:session)}.disabled(store.busy)
                ForEach(store.available,id:\.digest){file in
                    Toggle(isOn:Binding(get:{store.selected.contains(file.digest)},set:{store.select(file.digest,chosen:$0);reviewedDigest=nil})) {
                        VStack(alignment:.leading){
                            Text("\(file.bytes) bytes").font(.headline)
                            Text("SHA-256: \(file.digest)").font(.caption).textSelection(.enabled)
                            Text(t("本机文件身份：", "Device file identity: ")+file.fileIdentity).font(.caption)
                        }
                    }.disabled(store.busy || store.request != nil)
                }
                if store.available.isEmpty,store.request==nil{Text(t("当前没有可选择的本机审阅文件。", "No device review file currently available for selection."))}
                if let digest=store.reviewedDigest {
                    Text(t("明确选择：", "Explicit selection: ")+"\(store.selected.count)")
                    Button(t("明确删除这组已预览文件", "Explicitly delete this previewed selection"),role:.destructive){reviewedDigest=digest;confirmVisible=true}.disabled(store.busy)
                }
            }
            if let request=store.request {
                Section(t("同一删除请求尚未完成", "Same deletion request pending")) {
                    Text(request.requestId).font(.caption).textSelection(.enabled)
                    Text("\(request.files.count) · \(request.scopeDigest)").font(.caption)
                    Text(t("失败或中断不代表完成。保留原选择和 request，不自动更换或扩展范围。", "Failure/interruption does not mean completion. Original selection/request retained; no automatic replacement or scope expansion."))
                    Button(t("恢复同一删除请求并核验", "Resume and verify this same deletion request")){store.resume(using:session)}.disabled(store.busy || session.dataScope==nil)
                }
            }
            if let receipt=store.receipt {
                Section(t("上次精确本机删除回执", "Last exact device deletion receipt")) {
                    Text(receipt.requestId).font(.caption).textSelection(.enabled)
                    Text(t("已核验所选副本不存在：", "Selected copies verified absent: ")+"\(receipt.selectedCount)")
                    Text(receipt.scopeDigest).font(.caption)
                    Text(Date(timeIntervalSince1970:receipt.completedAt),style:.date)
                    Text(t("只证明这次所选本机副本的删除；外部副本、服务器或全部账号删除均未声明完成。", "Proves this selected device-copy deletion only. External/server/all-account erasure is not declared complete."))
                }
            }
            if let notice=store.notice,notice != "completed",notice != "pending" {
                Text(t("本机存储、权限或文件范围未确认；请解锁后读取同一请求。未宣称完成。", "Device storage/authority/file scope unconfirmed. Unlock and read the same request; no completion claimed."))
            }
        }.navigationTitle(t("本机材料删除", "Device material deletion"))
        .task(id:session.dataScope){reviewedDigest=nil;confirmVisible=false;store.refresh(using:session)}
        .onChange(of:session.dataScope){_,_ in reviewedDigest=nil;confirmVisible=false;store.bind(session.dataScope)}
        .onChange(of:phase){_,value in if value != .active{reviewedDigest=nil;confirmVisible=false;store.bind(nil)}else{store.refresh(using:session)}}
        .confirmationDialog(t("确认删除这组所选本机文件？", "Delete this exact selected device-file set?"),isPresented:$confirmVisible,titleVisibility:.visible){
            Button(t("确认同一选择并删除", "Confirm this selection and delete"),role:.destructive){if let reviewedDigest{store.confirm(reviewedDigest:reviewedDigest,using:session)}}
            Button(t("继续核对", "Keep checking"),role:.cancel){}
        }message:{Text(t("先保留本机请求，再删除并逐个核验不存在。只影响刚才预览并选择的文件身份；错误或中断保留待恢复状态。", "Persist the local request first, then delete and verify absence. Only previewed/selected file identities are affected; errors or interruption remain pending for recovery."))}
    }
}
