import SwiftUI

/// HTTP adapters supply these closures only after their wire is fixed.
struct NativeTripSupportPorts {
    var read: ((NativeTripSupportTarget) async throws -> Data)?
    var context: ((NativeTripSupportTarget, NativeTripPending.Proposal) async throws -> Data)?
    var prepared: ((NativeTripSupportTarget, NativeTripPending.Proposal) async throws -> [Data])?
}
struct NativeTripSupportView: View {
    let session: NativeSession
    let tripID: String
    let tripVersion: Int
    let dayID: String
    let itemID: String
    let proposal: NativeTripPending.Proposal?
    let store: NativeTripSupportStore
    let chinese: Bool
    var ports = NativeTripSupportPorts()
    @Environment(\.scenePhase) private var phase
    @State private var context:NativeTripSupportContext?
    @State private var referenceID=""
    @State private var city="shanghai"
    @State private var scene="attraction"
    @State private var candidates:[NativeTripSupportCandidates.Entry]=[]
    @State private var cursor:NativeTripSupportCandidates.Cursor?
    @State private var candidateGeneration=UUID()
    @State private var candidateBusy=false
    @State private var prepareRequest:NativeTripSupportPrepareRequest?
    @State private var renewingEntry:NativeTripSupportRead.Entry?
    @State private var renewRequest:NativeTripSupportRenewRequest?
    @State private var renewalReceipt:NativeTripSupportRenewReceipt?
    @State private var sourceNotice:String?
    private var target: NativeTripSupportTarget? {
        session.dataScope.map { .init(actor:$0,tripID:tripID,tripVersion:tripVersion,dayID:dayID,itemID:itemID) }
    }
    private func t(_ zh:String,_ en:String)->String { chinese ? zh : en }
    var body: some View {
        Form {
            Section {
                Text("\(tripID) · v\(tripVersion)\n\(dayID) / \(itemID)").font(.caption).textSelection(.enabled)
                Text(t("仅核对所选条目的地址／开放时间参考；不验证名称、可行性、交通、预订或整份行程。", "Only address/opening-window references for this exact item are checked. Titles, feasibility, transport, bookings and the whole plan are not verified."))
                Button(t("读取／重新核对当前来源", "Read/recheck current sources")) { Task { await refresh() } }.disabled(store.busy || target==nil)
            }
            if store.target==target, let read=store.read {
                ForEach(read.entries) { entry in
                    Section(entry.scope == .address ? t("地址参考", "Address reference") : t("开放时间参考", "Opening-window reference")) {
                        TimelineView(.periodic(from:.now,by:1)) { _ in
                            Text(status(entry.status == .current && entry.claim?.evidence.contains(where:{NativeKnowledgeRead.date($0.expiresAt).map({$0<=Date()}) != false})==true ? .recheck:entry.status))
                        }
                        Text(entry.applicability == .matched ? t("与所选条目明确关系匹配", "Explicit selected-item relation matched") : t("条目适用性未验证", "Item applicability unverified"))
                        Text(entry.receiptId).font(.caption).textSelection(.enabled)
                        Text("v\(entry.version) · \(entry.sourceDigest)").font(.caption)
                        ForEach(Array(entry.sourceRefs.enumerated()),id:\.offset) { _,ref in Text("\(ref.sourceRevisionId) · \(ref.revisionLabel) · \(ref.snippetHash)").font(.caption).textSelection(.enabled) }
                        if proposal==nil {
                            Button(t("明确选择此参考重新续证", "Explicitly select this reference for renewal")) {
                                renewingEntry=entry;referenceID=entry.placeReferenceId;renewRequest=nil;renewalReceipt=nil;resetCandidates()
                            }.disabled(candidateBusy || renewRequest != nil)
                        }
                        if entry.status == .current, let claim=entry.claim { claimView(claim) }
                        else { Text(t("当前来源未获准，旧值不再展示；重新核对不会自动恢复资格。", "Source currently unqualified; old values are hidden. Rechecking does not automatically restore eligibility.")) }
                    }
                }
            }
            if proposal==nil,let entry=renewingEntry {
                Section(t("为此条目明确选择新来源回执", "Explicitly choose a new source receipt for this item")) {
                    Text("\(entry.supportId) · v\(entry.version) · \(entry.placeReferenceId)").font(.caption).textSelection(.enabled)
                    Picker(t("来源城市", "Source city"),selection:$city) { ForEach(["shanghai","beijing","guangzhou","chongqing"],id:\.self) { Text($0).tag($0) } }.disabled(candidateBusy || renewRequest != nil)
                    Picker(t("来源场景", "Source scene"),selection:$scene) { ForEach(["arrival","airport_transport","payment","connectivity","public_transport","taxi","rail","attraction","accommodation","emergency"],id:\.self) { Text($0).tag($0) } }.disabled(candidateBusy || renewRequest != nil)
                    Button(t("读取本参考当前合格来源", "Read currently qualified sources for this reference")) { Task { await loadCandidates(more:false) } }.disabled(candidateBusy || renewRequest != nil)
                    ForEach(candidates.filter{$0.scope==entry.scope}) { candidate in
                        VStack(alignment:.leading) {
                            claimView(candidate.claim)
                            Button(t("明确采用此新来源并续证", "Explicitly adopt this new source and renew")) { Task { await renew(candidate,entry:entry) } }.disabled(candidateBusy || renewRequest != nil)
                        }
                    }
                    if cursor != nil { Button(t("读取下一页来源", "Read next source page")) { Task { await loadCandidates(more:true) } }.disabled(candidateBusy || renewRequest != nil) }
                    if let renewRequest {
                        Button(t("明确重试同一续证请求", "Explicitly retry the same renewal request")) { Task { await sendRenew(renewRequest) } }.disabled(candidateBusy)
                        Button(t("放弃本机续证选择，再核对当前资格", "Discard local renewal selection and recheck current eligibility")) { self.renewRequest=nil;Task { await refresh() } }.disabled(candidateBusy)
                    }
                    if let renewalReceipt { Text(t("新续证回执：", "New renewal receipt: ")+"\(renewalReceipt.receiptId) · v\(renewalReceipt.version)").font(.caption).textSelection(.enabled) }
                    Text(t("续证不会改变行程内容；旧确认成功、旧来源或重新读取本身不能恢复资格。", "Renewal does not change Trip content. Past confirmation, old sources or rereading alone cannot restore eligibility."))
                }
            }
            if let proposal {
                if let context {
                    Section(t("明确选择已拥有的地点参考", "Explicitly choose an owned place reference")) {
                        Picker(t("地点参考", "Place reference"),selection:$referenceID) {
                            Text(t("请选择", "Choose")).tag("")
                            ForEach(context.canonicalPlaceReferences) { ref in
                                Text((chinese ? ref.display.zh : ref.display.en) ?? ref.referenceId).tag(ref.referenceId)
                            }
                        }.disabled(candidateBusy || prepareRequest != nil)
                        Picker(t("来源城市", "Source city"),selection:$city) { ForEach(["shanghai","beijing","guangzhou","chongqing"],id:\.self) { Text($0).tag($0) } }.disabled(candidateBusy || prepareRequest != nil)
                        Picker(t("来源场景", "Source scene"),selection:$scene) { ForEach(["arrival","airport_transport","payment","connectivity","public_transport","taxi","rail","attraction","accommodation","emergency"],id:\.self) { Text($0).tag($0) } }.disabled(candidateBusy || prepareRequest != nil)
                        Button(t("读取此参考的已审核来源", "Read reviewed sources for this reference")) { Task { await loadCandidates(more:false) } }.disabled(referenceID.isEmpty || candidateBusy || prepareRequest != nil)
                        if context.canonicalPlaceReferences.isEmpty { Text(t("本行程没有已拥有的标准地点参考。", "This Trip has no owned canonical place references.")) }
                        ForEach(candidates) { candidate in
                            VStack(alignment:.leading) {
                                Text(candidate.scope == .address ? t("地址参考", "Address reference") : t("开放时间参考", "Opening-window reference"))
                                claimView(candidate.claim)
                                Text("\(candidate.mappingId) · v\(candidate.mappingVersion)").font(.caption)
                                Button(t("明确准备此来源回执", "Explicitly prepare this source receipt")) { Task { await prepare(candidate,context:context,proposal:proposal) } }
                                    .disabled(candidateBusy || prepareRequest != nil || store.confirmationUnknown)
                            }
                        }
                        if cursor != nil { Button(t("读取下一页来源", "Read next source page")) { Task { await loadCandidates(more:true) } }.disabled(candidateBusy || prepareRequest != nil) }
                        if let prepareRequest {
                            Button(t("明确重试同一准备请求", "Explicitly retry the same preparation")) { Task { await sendPrepare(prepareRequest,proposal:proposal) } }.disabled(candidateBusy)
                            Button(t("放弃本机准备选择", "Discard local preparation selection")) { self.prepareRequest=nil;sourceNotice=t("仅放弃本机选择；未宣称服务器回执已撤销。", "Local selection discarded only; server receipt revocation is unconfirmed.") }.disabled(candidateBusy)
                        }
                    }
                } else { Text(t("真实地点关系／服务器条目摘要暂不可用。", "Real place relationship/server item digest unavailable.")) }
                NativeTripSupportSelectionView(store:store,chinese:chinese,revoke:{receipt in Task { await revoke(receipt) }})
                Text(t("只可选择服务器对当前提议签发的真实回执。没有真实映射／准备回执时不可附加参考；普通保存不创建回执。", "Only real server-issued receipts for this proposal may be selected. Missing mapped/prepared receipts cannot attach references. Ordinary saving creates no receipt."))
            }
            if let sourceNotice { Text(sourceNotice) }
            if store.notice != nil {
                Text(store.notice=="noMappedSupport" ? t("所选条目没有可用的真实映射参考。", "No usable mapped reference for the selected item.") : t("当前来源接口或资格不可用，尚未核验。", "Current source interface or qualification unavailable; not verified."))
            }
        }
        .navigationTitle(t("条目来源参考", "Item source references"))
        .task(id:target) { context=nil;referenceID="";candidates=[];cursor=nil;prepareRequest=nil;renewingEntry=nil;renewRequest=nil;renewalReceipt=nil;candidateGeneration=UUID();store.bind(target,proposal:proposal);await refresh() }
        .onChange(of:referenceID) { _,_ in resetCandidates() }
        .onChange(of:city) { _,_ in resetCandidates() }
        .onChange(of:scene) { _,_ in resetCandidates() }
        .onChange(of:session.dataScope) { _,_ in context=nil;resetCandidates();prepareRequest=nil;renewingEntry=nil;renewRequest=nil;renewalReceipt=nil;store.bind(target,proposal:proposal) }
        .onChange(of:phase) { _,value in
            if value != .active { context=nil;resetCandidates();prepareRequest=nil;renewingEntry=nil;renewRequest=nil;renewalReceipt=nil;store.bind(nil) }
            else { Task { await refresh() } }
        }
    }
    @ViewBuilder private func claimView(_ claim:NativeTripSupportClaim)->some View {
        TimelineView(.periodic(from:.now,by:1)) { _ in
            if claim.evidence.allSatisfy({NativeKnowledgeRead.date($0.expiresAt).map({$0>Date()})==true}) {
                VStack(alignment:.leading) {
                    if let lines=claim.value.lines { ForEach(Array(lines.enumerated()),id:\.offset) { _,line in Text(line) } }
                    if let start=claim.value.startsAt { Text(start) }
                    if let end=claim.value.endsAt { Text(end) }
                    if let zone=claim.value.timeZone { Text(zone) }
                    ForEach(Array(claim.evidence.enumerated()),id:\.offset) { _,fact in
                        Text("\(fact.factId) · v\(fact.version) · \(fact.reviewedAt) → \(fact.expiresAt)").font(.caption).textSelection(.enabled)
                    }
                }
            } else { Text(t("来源回执已到期，请重新核对；旧值不再显示。", "Source receipt expired; recheck. Old values are hidden.")) }
        }
    }
    private func refresh() async {
        guard let target else { store.unavailable();return }
        store.bind(target,proposal:proposal)
        guard let read=ports.read else { store.unavailable();return }
        await store.refresh(current:{session.dataScope},get:read)
        if let proposal,let readContext=ports.context {
            do {
                let bytes=try await readContext(target,proposal)
                guard self.target==target,!Task.isCancelled else{return}
                context=try NativeTripSupportContext.decode(bytes,target:target,proposal:proposal)
            } catch { context=nil;sourceNotice=t("真实关系读取未完成，不猜测地点或摘要。", "Real relationship read incomplete; no place/digest guessing.") }
        }
        if let proposal, let prepare=ports.prepared {
            do {
                let receipts=try await prepare(target,proposal)
                guard self.target==target else{return}
                try store.installPrepared(receipts,target:target,proposal:proposal)
            } catch { store.unavailable() }
        }
    }
    private func resetCandidates() { candidates=[];cursor=nil;candidateGeneration=UUID();sourceNotice=nil }
    private func loadCandidates(more:Bool) async {
        guard !candidateBusy,let target,!referenceID.isEmpty,(context?.canonicalPlaceReferences.contains(where:{$0.referenceId==referenceID})==true || renewingEntry?.placeReferenceId==referenceID) else{return}
        let ref=referenceID,selectedCity=city,selectedScene=scene,epoch=candidateGeneration,next=more ? cursor:nil
        candidateBusy=true;defer{candidateBusy=false}
        do {
            let bytes=try await session.tripSupportCandidates(target:target,placeReferenceID:ref,city:selectedCity,scene:selectedScene,locale:chinese ? "zh":"en",cursor:next)
            guard self.target==target,candidateGeneration==epoch,!Task.isCancelled else{return}
            let page=try NativeTripSupportCandidates.decode(bytes,target:target,placeReferenceID:ref,cursor:next)
            let merged=(more ? candidates:[])+page.entries
            guard merged.count<=500,Set(merged.map(\.id)).count==merged.count else{throw NativeDataError.invalidResponse}
            candidates=merged;cursor=page.nextCursor
            sourceNotice=merged.isEmpty ? t("此参考在所选来源场景下没有当前合格映射。", "No currently qualified mapping for this reference/source context."):nil
        } catch { if candidateGeneration==epoch { resetCandidates();sourceNotice=t("来源候选未获准或已变化，请重新读取。", "Source candidates unqualified or changed; read again.") } }
    }
    private func prepare(_ candidate:NativeTripSupportCandidates.Entry,context:NativeTripSupportContext,proposal:NativeTripPending.Proposal) async {
        guard let target,context.dayId==target.dayID,context.itemId==target.itemID,context.canonicalPlaceReferences.contains(where:{$0.referenceId==referenceID}),candidates.contains(where:{$0.id==candidate.id}) else{return}
        let request=NativeTripSupportPrepareRequest(operationId:UUID().uuidString.lowercased(),placeReferenceId:referenceID,dayId:target.dayID,itemId:target.itemID,proposalId:proposal.id,expectedProposalRevision:proposal.revision,expectedBaseVersion:target.tripVersion,expectedProposalDigest:context.proposalDigest,expectedItemDigest:context.itemDigest,mappingId:candidate.mappingId,expectedMappingVersion:candidate.mappingVersion,expectedMappingDigest:candidate.mappingDigest,city:city,scene:scene,locale:chinese ? "zh":"en",scope:candidate.scope,expectedClaimRevision:candidate.claimRevision,expectedPayloadHash:candidate.payloadHash,expectedSourceDigest:candidate.sourceDigest)
        prepareRequest=request
        await sendPrepare(request,proposal:proposal)
    }
    private func sendPrepare(_ request:NativeTripSupportPrepareRequest,proposal:NativeTripPending.Proposal) async {
        guard !candidateBusy,let target,request.valid else{return}
        candidateBusy=true;defer{candidateBusy=false}
        do {
            let bytes=try await session.tripSupportPrepare(request,target:target,proposal:proposal)
            guard self.target==target,!Task.isCancelled else{return}
            try store.addPrepared(bytes,target:target,proposal:proposal)
            prepareRequest=nil;sourceNotice=t("已准备回执；请明确勾选后返回原提议差异确认。", "Receipt prepared; explicitly select it, then review the original proposal diff before confirming.")
        } catch { sourceNotice=t("准备结果未确认，保留同一 operation；只由你明确重试。", "Preparation outcome unconfirmed; same operation retained for explicit retry only.") }
    }
    private func renew(_ candidate:NativeTripSupportCandidates.Entry,entry:NativeTripSupportRead.Entry) async {
        guard let target,referenceID==entry.placeReferenceId,candidate.scope==entry.scope,candidates.contains(where:{$0.id==candidate.id}) else{return}
        let request=NativeTripSupportRenewRequest(operationId:UUID().uuidString.lowercased(),supportId:entry.supportId,expectedVersion:entry.version,tripVersion:target.tripVersion,dayId:target.dayID,itemId:target.itemID,mappingId:candidate.mappingId,expectedMappingVersion:candidate.mappingVersion,expectedMappingDigest:candidate.mappingDigest,expectedClaimRevision:candidate.claimRevision,expectedPayloadHash:candidate.payloadHash,expectedSourceDigest:candidate.sourceDigest)
        renewRequest=request
        await sendRenew(request)
    }
    private func sendRenew(_ request:NativeTripSupportRenewRequest) async {
        guard !candidateBusy,let target,request.valid else{return}
        candidateBusy=true;defer{candidateBusy=false}
        do {
            let bytes=try await session.tripSupportRenew(request,target:target)
            guard self.target==target,!Task.isCancelled else{return}
            let receipt=try NativeTripSupportRenewReceipt.decode(bytes,request:request)
            renewalReceipt=receipt;renewRequest=nil
            await store.refresh(current:{session.dataScope},get:{try await session.tripSupportRead($0)})
            guard self.target==target else{return}
            renewingEntry=store.read?.entries.first(where:{$0.supportId==receipt.supportId})
            sourceNotice=t("已收到新的续证回执；当前来源资格见重新读取的条目状态。", "New renewal receipt received; current eligibility is shown by the refreshed item status.")
        } catch { sourceNotice=t("续证结果未确认，保留同一请求；不宣称已恢复资格。", "Renewal outcome unconfirmed; same request retained. Eligibility restoration is not claimed.") }
    }
    private func revoke(_ receipt:NativePreparedTripSupport) async {
        guard !candidateBusy,!store.confirmationUnknown,let actor=session.dataScope else{return}
        candidateBusy=true;defer{candidateBusy=false}
        do {
            let bytes=try await session.tripSupportRevoke(receipt,actor:actor)
            guard session.dataScope==actor else{return}
            try store.removeRevoked(receipt,bytes:bytes)
            sourceNotice=t("准备回执已撤销；未修改已保存行程。", "Prepared receipt revoked; saved Trip unchanged.")
        } catch { sourceNotice=t("撤销未确认，不宣称服务器已撤销。", "Revocation unconfirmed; no server revocation claimed.") }
    }
    private func status(_ status:NativeTripSupportStatus)->String {
        switch status {
        case .current:t("来源参考当前有效", "Source reference current")
        case .recheck:t("需要重新核对", "Recheck required")
        case .blocked:t("当前受阻", "Currently blocked")
        case .revoked:t("参考已撤回", "Reference revoked")
        }
    }
}
struct NativeTripSupportSelectionView: View {
    let store:NativeTripSupportStore
    let chinese:Bool
    var revoke: ((NativePreparedTripSupport)->Void)?
    var body:some View {
        Section(chinese ? "明确选择参考回执（最多8条）" : "Explicit receipt selection (up to 8)") {
            ForEach(store.prepared) { receipt in
                Toggle(isOn:Binding(get:{store.selectedIDs.contains(receipt.id)},set:{store.select(receipt.id,chosen:$0)})) {
                    VStack(alignment:.leading) {
                        Text("\(receipt.dayId) / \(receipt.itemId) · \(receipt.scope.rawValue)")
                        Text("\(receipt.receiptId) · v\(receipt.version)").font(.caption)
                        Text(receipt.sourceDigest).font(.caption)
                        Text(receipt.applicability == .matched ? (chinese ? "所选关系匹配" : "Selected relation matched") : (chinese ? "适用性未验证" : "Applicability unverified"))
                    }
                }.disabled(store.busy || store.confirmationUnknown || NativeKnowledgeRead.date(receipt.expiresAt).map({$0<=Date()}) != false)
                if let revoke { Button(chinese ? "明确撤销准备回执" : "Explicitly revoke prepared receipt") { revoke(receipt) }.disabled(store.busy || store.confirmationUnknown) }
            }
            if store.prepared.isEmpty { Text(chinese ? "尚无当前提议的准备回执" : "No prepared receipt for this proposal") }
            if store.confirmationUnknown { Text(chinese ? "保存结果未知；保留同一选择，需读取精确回执。" : "Save outcome unknown; retain the same selection and read its exact receipt.") }
        }
    }
}

struct NativeTripSupportRecoveryView: View {
    let session: NativeSession
    let chinese: Bool
    var readReceipt: ((NativeTripSupportConfirmJournal, NativeDataScope) async throws -> Data)?
    var onResolved: (() async -> Void)?
    @Environment(\.scenePhase) private var phase
    @State private var journal: NativeTripSupportConfirmJournal?
    @State private var request: NativeSupportedTripConfirmRequest?
    @State private var receipt: NativeSupportedTripConfirmReceipt?
    @State private var busy=false
    @State private var checkedAbsent=false
    @State private var retryVisible=false
    @State private var notice: String?
    private func t(_ zh:String,_ en:String)->String { chinese ? zh : en }
    var body: some View {
        Form {
            if let journal,let request {
                Section(t("同一保存请求", "Same save request")) {
                    Text("\(journal.tripID) · \(request.proposalId)").font(.caption).textSelection(.enabled)
                    Text(request.idempotencyKey).font(.caption).textSelection(.enabled)
                    Text(t("仅读取这次明确确认的回执，不自动重放保存。", "Read only this explicitly confirmed request; saving is never replayed automatically."))
                    ForEach(request.supportSelection,id:\.receiptId) { selected in
                        Text("\(selected.receiptId) · v\(selected.version) · \(selected.sourceDigest)").font(.caption).textSelection(.enabled)
                    }
                    Button(t("读取精确历史确认回执", "Read exact historical confirmation receipt")) { Task { await read(journal) } }
                        .disabled(busy || session.dataScope==nil)
                    if checkedAbsent {
                        Button(t("明确重试同一原始请求", "Explicitly retry the original request")) { retryVisible=true }.disabled(busy || session.dataScope==nil)
                    }
                }
            } else if receipt==nil { Text(t("本机没有待恢复的参考保存请求，或受保护记录暂不可读取。", "No pending reference-save request on this device, or its protected record is unreadable.")) }
            if let receipt {
                Section(t("当次确认回执", "Historical confirmation receipt")) {
                    Text("\(receipt.tripId) · v\(receipt.resultingVersion)").font(.caption)
                    Text(t("此回执只证明当次提议已确认；来源当前资格必须逐条重新读取，旧成功不恢复资格。", "This receipt proves that proposal's confirmation only. Current eligibility requires item reads; past success does not restore qualification."))
                    ForEach(receipt.supports,id:\.supportId) { binding in Text("\(binding.receiptId) · \(binding.status.rawValue)").font(.caption) }
                }
            }
            if let notice { Text(notice) }
        }
        .navigationTitle(t("参考保存回执", "Reference save receipt"))
        .task(id:session.dataScope) { load() }
        .onChange(of:session.dataScope) { _,_ in clear();load() }
        .onChange(of:phase) { _,value in if value != .active { clear() } else { load() } }
        .confirmationDialog(t("明确重试这次同一请求？", "Explicitly retry this same request?"),isPresented:$retryVisible,titleVisibility:.visible) {
            Button(t("重试同一原始字节和选择", "Retry original bytes and selection")) { if let journal { Task { await retry(journal) } } }
            Button(t("继续核对", "Keep checking"),role:.cancel) {}
        } message: { Text(t("保留原 operation key、提议和回执选择，不创建新保存请求。", "Keep the original operation key, proposal and receipt selection; create no new save request.")) }
    }
    private func load() {
        checkedAbsent=false
        do { journal=try session.tripSupportConfirmationRecovery(); request=try journal?.request() }
        catch { journal=nil;request=nil;notice=t("受保护恢复记录读取失败；未宣称已保存。", "Protected recovery record unreadable; no save success claimed.") }
    }
    private func clear() { journal=nil;request=nil;receipt=nil;checkedAbsent=false;retryVisible=false;notice=nil }
    private func read(_ journal:NativeTripSupportConfirmJournal) async {
        guard !busy,let actor=session.dataScope,journal.matches(actor),let readReceipt else { notice=t("只读确认接口暂不可用，保留原请求。", "Read-only confirmation interface unavailable; original request retained.");return }
        busy=true;defer{busy=false};checkedAbsent=false
        do {
            let bytes=try await readReceipt(journal,actor)
            guard session.dataScope==actor else{return}
            if let marker=try JSONSerialization.jsonObject(with:bytes) as? [String:Any],Set(marker.keys)==Set(["kind"]),["blocked","stale","conflict"].contains(marker["kind"] as? String ?? "") {
                checkedAbsent=true;notice=t("未取得此请求的确认回执，尚不宣称成功。", "No confirmation receipt obtained for this request; success is unconfirmed.");return
            }
            let result=try NativeTripSupportHistoricalReceipt.decode(bytes,journal:journal)
            let journalObserver = session.journalDataObservation(.tripSupport), journalTicket = journalObserver.begin()
            try session.completeTripSupportConfirmation(journal,receipt:result,actor:actor)
            receipt=result;self.journal=nil;request=nil
            journalObserver.finish(journalTicket, try journal.request().idempotencyKey)
            await onResolved?()
        } catch { notice=t("精确回执读取未完成，原请求仍保留。", "Exact receipt read incomplete; original request retained.") }
    }
    private func retry(_ journal:NativeTripSupportConfirmJournal) async {
        guard !busy,checkedAbsent,let actor=session.dataScope,journal.matches(actor) else{return}
        busy=true;defer{busy=false};checkedAbsent=false
        do {
            let bytes=try await session.tripSupportConfirm(journal,actor:actor)
            guard session.dataScope==actor else{return}
            let result=try NativeSupportedTripConfirmReceipt.decode(bytes,tripID:journal.tripID,request:journal.request())
            let journalObserver = session.journalDataObservation(.tripSupport), journalTicket = journalObserver.begin()
            try session.completeTripSupportConfirmation(journal,receipt:result,actor:actor)
            receipt=result;self.journal=nil;request=nil
            journalObserver.finish(journalTicket, try journal.request().idempotencyKey)
            await onResolved?()
        } catch { notice=t("重试结果未知；继续只读核对同一请求，不自动重放。", "Retry outcome unknown; continue read-only checking of this request. No automatic replay.") }
    }
}
