import SwiftUI

struct NativeOfflineTodayPanel:View {
    let tripID:String
    let currentDetail:NativeTripDetail?
    let tripStore:NativeTripStore
    @Environment(AppSettings.self) private var settings
    @Environment(\.scenePhase) private var phase
    @State private var payload:NativeOfflineTextPayload?
    @State private var leaseRecord:NativeOfflineCachedText?
    @State private var version:Int?
    @State private var savedAt:Date?
    @State private var local:NativeOfflineTripDraft?
    @State private var date=""
    @State private var title=""
    @State private var notice:String?
    @State private var busy=false
    @State private var generation=UUID()
    @State private var revokeOperation:String?
    @State private var storageGeneration:Int?
    private var session:NativeSession{settings.nativeSession}
    private var chinese:Bool{settings.selectedLocale == .zh}
    private func t(_ zh:String,_ en:String)->String{chinese ? zh:en}
    private var namespace:NativeOfflineTripNamespace?{session.retainedDataScope.flatMap{try? .init(scope:$0,tripID:tripID)}}
    var body:some View {
        VStack(alignment:.leading,spacing:12){
            Text(t("已保存文字与本地改稿","Saved text and local edits")).font(.title2.bold())
            if let version,let savedAt {
                Text(t("缓存版本","Cached version")+" \(version) · "+savedAt.formatted()).font(.caption)
                TimelineView(.periodic(from:.now,by:1)){_ in
                if let payload,cacheTimeCurrent {
                    Text(t("仅显示已获准保存部分，不能代表完整行程；缓存文字不是实时事实。","Only the permitted saved portion is shown, not a complete Trip. Cached text is not live information."))
                    ForEach(payload.days){day in Text(day.date).font(.headline);ForEach(day.items){item in Text(item.title).textSelection(.enabled)}}
                }else {Text(t("租约或可信时间未确认，此处仅展示版本／同步时间；请联网重验。","Lease or trusted time was not confirmed. Only version/sync metadata is shown; revalidate online."))}
                }
            }else {Text(t("尚无获准的离线文字快照。","No permitted offline text snapshot is saved."))}
            Button(t("明确保存当前已获准文字","Save currently permitted text explicitly")){Task{await saveSnapshot()}}
                .disabled(busy || session.dataScope==nil || currentDetail?.confirmationState != "confirmed")
                .accessibilityIdentifier("today.offline.save")
            Text(t("只有服务端签发且本机可信校验通过的日期／项目文字可保存；地图、图片、第三方地址和资料不在此缓存。","Only server-permitted dates/item text with trusted verification can be saved. Maps, images and third-party addresses/materials are excluded.")).font(.footnote)
            Text(t("仅本地草稿","Local draft only")).font(.headline)
            TextField(t("新日期 YYYY-MM-DD","New date YYYY-MM-DD"),text:$date).textInputAutocapitalization(.never)
            TextField(t("明确输入的新项目文字","Explicitly enter new item text"),text:$title,axis:.vertical).lineLimit(2...4)
            Button(t("保存用户编辑草稿（不提交）","Save user-edit draft (no submission)")){saveLocal()}.disabled(busy || namespace==nil)
                .accessibilityIdentifier("today.offline.draft.save")
            if let local,storageCurrent {
                Text(t("草稿基于版本","Draft base version")+" \(local.baseVersion) · "+local.updatedAt.formatted()).font(.caption)
                Button(t("回网核对，加载到原行程草稿编辑","Recheck online and load into existing Trip draft editor")){
                    Task {
                        guard !busy else{return};busy=true
                        let accepted=await tripStore.restoreOfflineUserDraft(local,using:session)
                        notice=accepted ? "review":"conflict";busy=false
                    }
                }.disabled(busy || session.dataScope==nil)
                if let scope=session.dataScope {
                    NavigationLink(t("在原行程编辑器重新核对／确认","Recheck/review in the existing Trip editor")) {
                        NativeTripView(offlineUserDraft:local,initialTripID:tripID,initialTripScope:scope)
                    }
                }
                Text(t("加载不等于提交。返回原行程页查看差异，再明确生成／确认提案；冲突不覆盖，取消保留本地稿。","Loading is not submission. Return to Trip, review changes and explicitly create/confirm the Proposal. Conflicts never overwrite; cancellation keeps the local draft.")).font(.footnote)
            }
            if let notice {Text(message(notice)).font(.footnote)}
            Button(t("明确撤回此行程离线来源","Withdraw this Trip’s offline source explicitly"),role:.destructive){Task{await revokeSource()}}
                .disabled(busy || session.dataScope==nil)
            Button(t("重读本地保存状态","Reread local saved state")){readSaved()}.disabled(namespace==nil)
            Button(t("删除此行程的本机离线稿与快照","Remove this Trip’s local draft and snapshot"),role:.destructive){
                guard let namespace,let scope=session.retainedDataScope else{return}
                do{try session.offlineTrips.removeTrip(namespace,scope:scope);readSaved()}catch{notice="unavailable"}
            }.disabled(busy || namespace==nil)
        }
        .task(id:Key(scope:session.retainedDataScope,online:session.dataScope,active:phase == .active)){readSaved();await revalidate() }
        .onChange(of:session.retainedDataScope){_,_ in generation=UUID();payload=nil;leaseRecord=nil;local=nil;version=nil;savedAt=nil;date="";title="";notice=nil}
        .task(id:Key(scope:session.retainedDataScope,online:session.dataScope,active:phase == .active)){
            while !Task.isCancelled,phase == .active {
                try? await Task.sleep(for:.seconds(1))
                if !Task.isCancelled,storageGeneration != nil,!storageCurrent {generation=UUID();readSaved()}
            }
        }
        .onChange(of:phase){_,phase in if phase != .active{payload=nil}}
    }
    private var cacheTimeCurrent:Bool {
        guard storageCurrent,let value=leaseRecord else{return false}
        return value.bootIdentity==NativeOfflineBootIdentity.current() && Date()>=value.lastObservedAt && Date()<value.expiresAt && ProcessInfo.processInfo.systemUptime>=value.lastObservedUptime && ProcessInfo.processInfo.systemUptime<value.deadlineUptime
    }
    private var storageCurrent:Bool {
        guard let namespace,let scope=session.retainedDataScope,let storageGeneration else{return false}
        return (try? session.offlineTrips.offlineDataGeneration(namespace,scope:scope))==storageGeneration
    }
    private func readSaved(){
        payload=nil;leaseRecord=nil;local=nil;version=nil;savedAt=nil;storageGeneration=nil
        guard phase == .active,let namespace,let scope=session.retainedDataScope else{return}
        do {
            storageGeneration=try session.offlineTrips.offlineDataGeneration(namespace,scope:scope)
            local=try session.offlineTrips.readUserDraft(namespace,scope:scope)
            let meta=try session.offlineTrips.cachedMetadata(namespace,scope:scope);version=meta?.headVersion;savedAt=meta?.savedAt
            if let valid=try? session.offlineTrips.readConfirmedText(namespace,scope:scope,verifier:.installed){leaseRecord=valid.0;payload=valid.1}
        }catch{notice="unavailable"}
    }
    private func revalidate()async {
        guard phase == .active,let scope=session.dataScope,let namespace else{return}
        guard let storageBasis=try? session.offlineTrips.offlineDataGeneration(namespace,scope:scope) else{return}
        let own=generation
        do {
            let bytes=try await session.tripRequest(path:"api/trips/native/v2/"+namespace.tripID,method:"GET")
            guard generation==own,session.dataScope==scope,(try? session.offlineTrips.offlineDataGeneration(namespace,scope:scope))==storageBasis,!Task.isCancelled else{return}
            let detail=try JSONDecoder().decode(NativeTripDetail.self,from:bytes)
            let archiveBytes=try await session.tripRequest(path:"api/trips/native/v2/"+namespace.tripID+"/archive",method:"GET")
            guard generation==own,session.dataScope==scope,(try? session.offlineTrips.offlineDataGeneration(namespace,scope:scope))==storageBasis,!Task.isCancelled else{return}
            let archive=try JSONDecoder().decode(NativeTripArchiveReply.self,from:archiveBytes)
            guard detail.trip.id==namespace.tripID,archive.version==2 else{throw NativeDataError.invalidResponse}
            if archive.archive != nil {try session.offlineTrips.removeTrip(namespace,scope:scope);readSaved();return}
            if let version,version != detail.trip.headVersion {try session.offlineTrips.removeConfirmedText(namespace,scope:scope);readSaved();return}
            guard let version else{return}
            let nonce=UUID().uuidString.lowercased()
            let proof=try await session.offlineTripRead(tripID:namespace.tripID,headVersion:version,nonce:nonce)
            guard generation==own,session.dataScope==scope,(try? session.offlineTrips.offlineDataGeneration(namespace,scope:scope))==storageBasis,!Task.isCancelled else{return}
            // Online revalidation never renews a cached deadline or saves new bytes.
            let checked=try NativeOfflinePermitVerifier.installed.verify(proof,namespace:namespace,headVersion:version,nonce:nonce)
            guard checked.namespace==namespace,let previous=try session.offlineTrips.cachedMetadata(namespace,scope:scope),checked.generation==previous.generation,checked.policyID==previous.policyID,checked.policyRevision==previous.policyRevision,checked.coverage==previous.coverage,NativeOfflineTripNamespace.digest(try NativeOfflineCanonicalJSON.data(JSONSerialization.jsonObject(with:JSONEncoder().encode(checked.payload))))==previous.payloadDigest else{throw NativeOfflineTripError.authorityRequired}
        }catch{
            guard generation==own,session.dataScope==scope,(try? session.offlineTrips.offlineDataGeneration(namespace,scope:scope))==storageBasis else{return}
            if case NativeDataError.server(let code)=error,["FORBIDDEN","NOT_FOUND","TRIP_DELETED"].contains(code){try? session.offlineTrips.removeTrip(namespace,scope:scope)}
            else{try? session.offlineTrips.removeConfirmedText(namespace,scope:scope)}
            readSaved()
        }
    }
    private func revokeSource()async {
        guard !busy,let scope=session.dataScope,let namespace else{return};busy=true
        defer{busy=false}
        do {
            try session.offlineTrips.removeConfirmedText(namespace,scope:scope);readSaved()
            let operation=revokeOperation ?? UUID().uuidString.lowercased();revokeOperation=operation
            let bytes=try await session.offlineTripTextCommand(tripID:namespace.tripID,action:"revoke",body:JSONSerialization.data(withJSONObject:["operationId":operation]))
            guard session.dataScope==scope else{return}
            guard let receipt=try JSONSerialization.jsonObject(with:bytes) as? [String:Any],Set(receipt.keys)==Set(["kind","tripId","sessionEpoch","generation","operationId","reused"]),receipt["kind"] as? String=="offline_text_revoked/1",receipt["tripId"] as? String==namespace.tripID,receipt["sessionEpoch"] as? Int==scope.mobileEpoch,receipt["operationId"] as? String==operation,receipt["reused"] is Bool else{throw NativeDataError.invalidResponse}
            revokeOperation=nil;notice="revoked"
        }catch{notice="authority"}
    }
    private func saveLocal(){
        guard let namespace,let scope=session.retainedDataScope,let base=currentDetail?.trip.headVersion ?? version else{notice="basis";return}
        do {
            let ticket=try session.offlineTrips.beginOfflineDataWrite(namespace,scope:scope)
            let dayID=local?.operations.first(where:{$0.kind == .upsertDay})?.dayId ?? UUID().uuidString
            let itemID=local?.operations.first(where:{$0.kind == .upsertItem})?.itemId ?? UUID().uuidString
            let operations:[NativeTripOperation]=[.init(kind:.upsertDay,dayId:dayID,date:date),.init(kind:.upsertItem,title:title.trimmingCharacters(in:.whitespacesAndNewlines),dayId:dayID,itemId:itemID)]
            var draft=try local ?? NativeOfflineTripDraft(namespace:namespace,baseVersion:base,operations:operations)
            draft.operations=operations;draft.updatedAt=Date()
            try session.offlineTrips.saveUserDraft(draft,scope:scope,ticket:ticket);notice="draft";readSaved()
        }catch{notice="unavailable"}
    }
    private func saveSnapshot()async {
        guard !busy,let scope=session.dataScope,let namespace,let detail=currentDetail,detail.trip.id==tripID,detail.confirmationState=="confirmed" else{return}
        guard let ticket=try? session.offlineTrips.beginOfflineDataWrite(namespace,scope:scope) else{notice="unavailable";return}
        let nonce=ticket.nonce,own=generation;busy=true
        defer{if generation==own{busy=false}}
        do {
            let bytes=try await session.offlineTripRead(tripID:tripID.lowercased(),headVersion:detail.trip.headVersion,nonce:nonce)
            guard generation==own,session.dataScope==scope,phase == .active,!Task.isCancelled else{return}
            if let value=try JSONSerialization.jsonObject(with:bytes) as? [String:Any],value["kind"] as? String=="unavailable" {
                guard Set(value.keys)==Set(["kind","reason"]),["POLICY_UNCONFIGURED","NOT_ELIGIBLE","STALE_BASIS"].contains(value["reason"] as? String ?? "") else{throw NativeOfflineTripError.invalidInput}
                notice="authority";return
            }
            let permit=try NativeOfflinePermitVerifier.installed.verify(bytes,namespace:namespace,headVersion:detail.trip.headVersion,nonce:nonce)
            try session.offlineTrips.saveConfirmedText(permit,scope:scope,ticket:ticket);notice="saved";readSaved()
        }catch{guard generation==own,session.dataScope==scope else{return};notice="authority"}
    }
    private func message(_ notice:String)->String {
        switch notice {
        case "revoked":return t("离线来源已撤回，本机确认快照已清理。","Offline source withdrawn; local confirmed snapshot removed.")
        case "saved":return t("获准文字已保存；期限来自已验证的服务端许可。","Permitted text saved; its lifetime comes from the verified server permit.")
        case "draft":return t("用户改稿已加密保存在本机，尚未提交。","User edits were encrypted locally; nothing was submitted.")
        case "review":return t("已加载到原行程草稿。请返回行程查看差异并明确确认。","Loaded into the existing Trip draft. Return to Trip to review and confirm explicitly.")
        case "conflict":return t("当前版本／权限无法接纳旧稿，未覆盖服务器；本地稿仍保留。","Current version/authority cannot accept this draft. No server overwrite; local draft retained.")
        case "basis":return t("需要明确的原确认版本；不会猜测版本或创建行程。","An explicit confirmed base version is required; no guessed version or Trip creation.")
        case "authority":return t("许可、可信 key 或当前来源未满足，未保存确认快照。","Permit, trusted key or current source was unavailable; no confirmed snapshot saved.")
        default:return t("本机保存或读取未确认，请核对输入与权限；不宣称成功。","Local save/read was not confirmed. Check input and authority; no success is claimed.")
        }
    }
    private struct Key:Equatable{let scope:NativeDataScope?;let online:NativeDataScope?;let active:Bool}
}

struct NativeOfflineSavedTripsView:View {
    @Environment(AppSettings.self) private var settings
    @State private var ids:[String]=[]
    @State private var selected:String?
    @State private var store=NativeTripStore()
    private var session:NativeSession{settings.nativeSession}
    var body:some View {
        List {
            if ids.isEmpty {Text(settings.selectedLocale == .zh ? "此账号没有可读取的本机保存索引。":"No readable local saved index for this account.")}
            ForEach(ids,id:\.self){id in Button(id){selected=id}}
        }.navigationTitle(settings.selectedLocale == .zh ? "本机已保存行程":"Locally saved Trips")
        .task(id:session.retainedDataScope){
            ids=[];selected=nil
            if let scope=session.retainedDataScope{ids=(try? session.offlineTrips.savedTripIDs(scope:scope)) ?? []}
        }
        .sheet(isPresented:Binding(get:{selected != nil},set:{if !$0{selected=nil}})){
            if let selected {NavigationStack{ScrollView{NativeOfflineTodayPanel(tripID:selected,currentDetail:nil,tripStore:store).padding()}}}
        }
    }
}
