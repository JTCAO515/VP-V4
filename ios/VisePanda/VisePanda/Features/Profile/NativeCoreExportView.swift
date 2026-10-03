import SwiftUI
import UIKit

struct NativeCoreExportView:View {
    @Environment(AppSettings.self) private var settings
    @Environment(\.scenePhase) private var phase
    @State private var store=NativeCoreExportStore()
    @State private var confirmed=false
    @State private var activity:ExportActivitySource?
    @State private var transportTask:Task<Void,Never>?
    private var session:NativeSession{settings.nativeSession}
    private var chinese:Bool{settings.selectedLocale == .zh}
    private func t(_ zh:String,_ en:String)->String{chinese ? zh:en}
    var body:some View {
        Form {
            Section(t("本机材料文件", "Device material files")) {
                Text(t("服务器核心包不含本机截图原文件；本机文件由你另行选择并明确导出。", "Server core bundles do not include original device screenshots. Select and export device files separately."))
                NavigationLink(t("预览并删除所选本机材料", "Preview and delete selected device materials")) {
                    NativeDeviceMaterialDeleteView(session:session,chinese:chinese)
                }
                NavigationLink(t("查看并导出本机材料", "Review and export device materials")) {
                    NativeDeviceMaterialExportView(session: session, chinese: chinese)
                }
            }
            Section(t("账号核心资料导出","Account core export")) {
                Text(t("仅导出当前请求已交付的核心模块；不是全部用户数据完成，也不删除源数据。需要最近重新登录，刷新 token 不等于重新认证。","Exports only the core modules delivered for this request. This is not completion of all-user-data export and deletes no source data. A recent sign-in is required; token refresh is not reauthentication."))
                Toggle(t("明确请求导出当前账号资料","Explicitly request this account’s export"),isOn:$confirmed)
                Button(store.requestID==nil ? t("请求核心导出","Request core export"):t("重试同一请求","Retry the same request")){
                    run{await store.request(confirmed:confirmed,current:{session.dataScope},post:{try await session.coreExportRequest(requestID:(try JSONDecoder().decode(ExportRequest.self,from:$0)).requestId,create:true)})}
                }.disabled(!confirmed || store.busy || session.dataScope==nil)
                    .accessibilityIdentifier("privacy.core-export.request")
            }
            if store.scope==session.dataScope,session.dataScope != nil,let id=store.requestID {
                Section(t("精确请求状态","Exact request status")) {
                    Text(id).font(.caption).textSelection(.enabled)
                    if let receipt=store.receipt {
                        Text(state(receipt.state)).accessibilityIdentifier("privacy.core-export.state")
                        if receipt.ready {
                            Text(receipt.state=="ready_partial" ? t("此包为部分资料，缺失模块／实时遍历限制见下；不代表全部资料完成。","This package is partial; missing modules/live traversal limits are shown below. It does not complete all data."):t("已交付全部声明的 D2 核心模块；仍不是全部用户数据。","Delivered the declared D2 core modules; still not all-user-data completion."))
                        }
                        ForEach(receipt.modules,id:\.module){module in VStack(alignment:.leading){Text(module.module);Text("\(module.status) · \(module.reason) · \(module.pages) pages / \(module.rows) rows").font(.caption)}}
                    }else {Text(t("尚未确认请求状态；不宣称已完成。","Request status unconfirmed; no completion is claimed."))}
                    Button(t("读取同一请求回执","Read this same request receipt")){run{await store.refresh(current:{session.dataScope},get:{try await session.coreExportRequest(requestID:$0,create:false)})}}
                        .disabled(store.busy || session.dataScope==nil).accessibilityIdentifier("privacy.core-export.refresh")
                    Button(t("放弃本机选择，另行明确请求","Discard local selection for another explicit request")){transportTask?.cancel();store.discardSelected();confirmed=false;activity=nil}.disabled(store.busy)
                }
            }
            TimelineView(.periodic(from:.now,by:1)){_ in
                if store.scope==session.dataScope,session.dataScope != nil,store.receipt?.ready==true {
                    Section(t("受保护的文件交付","Protected file delivery")) {
                        Button(t("明确取得新的下载票据","Request a new download ticket explicitly")){run{await store.getTicket(current:{session.dataScope},post:{try await session.coreExportTicket(requestID:$0)})}}
                            .disabled(store.busy || session.dataScope==nil)
                        Button(t("使用已确认票据下载一次","Download once with the acknowledged ticket")){run{await store.download(current:{session.dataScope},get:{try await session.coreExportDownload(requestID:$0,operationID:$1,token:$2)})}}
                            .disabled(store.busy || !store.hasTicket(session.dataScope)).accessibilityIdentifier("privacy.core-export.download")
                        Text(t("网络或 ACK 未确认时不会自动重放下载或续票。请先读取状态，再由你明确取得新票据；原资料到期不会延期。","Network/ACK uncertainty never automatically replays the download or renews a ticket. Read status, then explicitly request a new ticket; artifact expiry is not extended."))
                        if let file=store.selectedFile(session.dataScope) {
                            Button(t("明确导出／保存此已核验文件","Export/save this verified file explicitly")){guard store.selectedFile(session.dataScope)==file else{return};activity = .init(url:file)}
                                .accessibilityIdentifier("privacy.core-export.share")
                            Text(t("系统导出的副本不能远端召回；本机临时文件到期或账号切换会清理。","System-exported copies cannot be recalled remotely. Local temporary bytes are cleaned on expiry/account change."))
                        }
                    }
                }
            }
            if let notice=store.notice {
                Section {Text(notice=="reauth" ? t("请返回账号页重新登录后明确发起新请求；token refresh 不满足最近认证。","Return to Account and sign in again before a new explicit request. Token refresh does not meet recent authentication."):notice=="downloaded" ? t("完整字节及摘要已核验，尚未自动分享。","Complete bytes and digest verified; nothing was shared automatically."):t("操作或权限未确认，当前 policy／API 也可能未启用。没有宣称成功；请手动核对并重试。","Operation/authority unconfirmed; current policy/API may be disabled. No success is claimed. Check and retry explicitly."))}
            }
        }.navigationTitle(t("核心资料导出","Core data export"))
        .task(id:session.dataScope){transportTask?.cancel();store.bind(session.dataScope);activity=nil;confirmed=false}
        .onChange(of:session.dataScope){_,_ in transportTask?.cancel();store.bind(session.dataScope);activity=nil;confirmed=false}
        .onChange(of:phase){_,phase in if phase != .active{transportTask?.cancel();activity=nil;store.clear();confirmed=false}}
        .onDisappear{transportTask?.cancel();activity=nil;store.clear()}
        .sheet(item:$activity,onDismiss:{store.clear();confirmed=false}){source in NativeCoreExportActivity(url:source.url)}
    }
    private func run(_ operation:@escaping @MainActor () async -> Void){transportTask?.cancel();transportTask=Task{await operation()}}
    private func state(_ state:String)->String {
        switch state {
        case "queued":return t("已排队，尚未完成","Queued; not completed")
        case "running":return t("执行中，尚未交付","Running; not delivered")
        case "ready_partial":return t("部分核心模块已准备","Partial core modules ready")
        case "ready_complete":return t("声明的核心模块已准备","Declared core modules ready")
        case "failed":return t("执行失败；终止时间不是成功回执","Execution failed; termination time is not success")
        default:return t("已到期，不可下载","Expired; download unavailable")
        }
    }
    private struct ExportRequest:Decodable{let requestId:String;let confirmed:Bool}
    private struct ExportActivitySource:Identifiable{let id=UUID();let url:URL}
}
private struct NativeCoreExportActivity:UIViewControllerRepresentable {
    let url:URL
    func makeUIViewController(context:Context)->UIActivityViewController{UIActivityViewController(activityItems:[url],applicationActivities:nil)}
    func updateUIViewController(_ controller:UIActivityViewController,context:Context){}
}
