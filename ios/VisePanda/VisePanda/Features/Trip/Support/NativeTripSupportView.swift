import SwiftUI

/// HTTP adapters supply these closures only after their wire is fixed.
struct NativeTripSupportPorts {
    var read: ((NativeTripSupportTarget) async throws -> Data)?
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
                        Text(status(entry.status))
                        Text(entry.applicability == .matched ? t("与所选条目明确关系匹配", "Explicit selected-item relation matched") : t("条目适用性未验证", "Item applicability unverified"))
                        Text(entry.receiptId).font(.caption).textSelection(.enabled)
                        Text("v\(entry.version) · \(entry.sourceDigest)").font(.caption)
                        if entry.status == .current, let claim=entry.claim { claimView(claim) }
                        else { Text(t("当前来源未获准，旧值不再展示；重新核对不会自动恢复资格。", "Source currently unqualified; old values are hidden. Rechecking does not automatically restore eligibility.")) }
                    }
                }
            }
            if proposal != nil {
                NativeTripSupportSelectionView(store:store,chinese:chinese)
                Text(t("只可选择服务器对当前提议签发的真实回执。没有真实映射／准备回执时不可附加参考；普通保存不创建回执。", "Only real server-issued receipts for this proposal may be selected. Missing mapped/prepared receipts cannot attach references. Ordinary saving creates no receipt."))
            }
            if store.notice != nil {
                Text(store.notice=="noMappedSupport" ? t("所选条目没有可用的真实映射参考。", "No usable mapped reference for the selected item.") : t("当前来源接口或资格不可用，尚未核验。", "Current source interface or qualification unavailable; not verified."))
            }
        }
        .navigationTitle(t("条目来源参考", "Item source references"))
        .task(id:target) { store.bind(target,proposal:proposal); await refresh() }
        .onChange(of:session.dataScope) { _,_ in store.bind(target,proposal:proposal) }
        .onChange(of:phase) { _,value in if value != .active { store.bind(nil) } }
    }
    @ViewBuilder private func claimView(_ claim:NativeTripSupportClaim)->some View {
        if let lines=claim.value.lines { ForEach(Array(lines.enumerated()),id:\.offset) { _,line in Text(line) } }
        if let start=claim.value.startsAt { Text(start) }
        if let end=claim.value.endsAt { Text(end) }
        if let zone=claim.value.timeZone { Text(zone) }
        ForEach(Array(claim.evidence.enumerated()),id:\.offset) { _,fact in
            Text("\(fact.factId) · v\(fact.version) · \(fact.reviewedAt) → \(fact.expiresAt)").font(.caption).textSelection(.enabled)
        }
    }
    private func refresh() async {
        guard let target else { store.unavailable();return }
        store.bind(target,proposal:proposal)
        guard let read=ports.read else { store.unavailable();return }
        await store.refresh(current:{session.dataScope},get:read)
        if let proposal, let prepare=ports.prepared {
            do {
                let receipts=try await prepare(target,proposal)
                guard self.target==target else{return}
                try store.installPrepared(receipts,target:target,proposal:proposal)
            } catch { store.unavailable() }
        }
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
            }
            if store.prepared.isEmpty { Text(chinese ? "尚无当前提议的准备回执" : "No prepared receipt for this proposal") }
            if store.confirmationUnknown { Text(chinese ? "保存结果未知；保留同一选择，需读取精确回执。" : "Save outcome unknown; retain the same selection and read its exact receipt.") }
        }
    }
}
