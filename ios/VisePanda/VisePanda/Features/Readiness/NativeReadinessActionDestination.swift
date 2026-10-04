import SwiftUI

/// Executes a current, typed read/verification route. Opening is not completion.
struct NativeReadinessActionDestination:View {
    let route:NativeReadinessActionRoute
    let execution:NativeReadinessExecution
    let basis:NativeReadinessActionBasis
    let session:NativeSession
    let city:String
    let scenario:NativeReadinessScenario
    let chinese:Bool
    let currentBasis:()->NativeReadinessActionBasis?
    let returned:()->Void
    @Environment(\.scenePhase) private var phase
    @State private var statement:NativeReadinessEvidence?
    @State private var expires:Date?
    @State private var notice=false
    @State private var tripStore=NativeTripStore()
    private func t(_ zh:String,_ en:String)->String{chinese ? zh:en}
    private var selection:NativeKnowledgeSelection {
        let scene:String
        switch scenario{case .connectivity:scene="connectivity";case .payment:scene="payment";case .transport:scene="rail";case .admission,.address:scene="attraction"}
        return .init(city:city,scene:scene,locale:chinese ? "zh":"en")
    }
    var body:some View {
        Form {
            Section {
                Text(t("此动作只读取／核对依据；返回后须刷新本任务，不会把打开页面当作已解决。", "This action reads/verifies evidence only. Recheck this task on return; opening a page is never treated as resolution."))
                Text("\(basis.taskId) · \(basis.tripId) v\(basis.tripVersion)").font(.caption)
                Text("\(basis.ruleVersion) · \(basis.ontologyVersion) · \(basis.declarationRevision)").font(.caption)
            }
            TimelineView(.periodic(from:.now,by:1)){_ in
                if let statement,currentBasis()==basis,phase == .active,expires.map({$0>Date()})==true {
                    Section(t("当前精确材料及适用范围", "Exact current material and scope")) {
                        Text(statement.text)
                        ForEach(Array(statement.conditions.enumerated()),id:\.offset){_,condition in Text(condition)}
                        ForEach(Array(statement.exclusions.enumerated()),id:\.offset){_,exclusion in Text(exclusion)}
                        ForEach(statement.sources,id:\.sourceRevisionId){source in
                            if let url=source.url{Link(source.publisher+" · "+source.locator,destination:url)}
                        }
                        if case .verification=route {Text(t("请在这个当前合格入口核对，再返回明确更新声明；不会自动声明支付／入场资格已满足。", "Verify at this qualified entry, then return and explicitly update your declaration. Payment/admission readiness is never asserted automatically."))}
                        if case .candidate(let poi,_,_)=route {Text(t("条件化候选：", "Conditional candidate: ")+poi);Text(t("只在所列条件下可继续核对，不等于已可入场／可达或整份行程可行。", "Continue checking only within listed conditions; this is not admission/reachability or whole-plan feasibility."))}
                    }
                }
            }
            if execution.result.kind=="verification_entry",currentBasis()==basis {
                Section(t("实际核对入口", "Actual verification entry")) {
                    if execution.result.target=="declaration" {Text(t("返回上页核对并明确保存你的适用性、资源与条件声明，再重新核验。打开此页不等于准备完成。", "Return to review and explicitly save applicability/resource/condition declarations, then recheck. Opening this page is not readiness completion."))}
                    ForEach(execution.result.sources ?? [],id:\.sourceRevisionId){source in if let url=source.url{Link(source.publisher+" · "+source.locator,destination:url)}}
                    if (execution.result.sources ?? []).isEmpty {Text(t("没有当前合格外部入口。返回重新读取来源；不把未知当风险或已解决。", "No currently qualified external entry. Return and reread sources; unknown is neither a manufactured risk nor resolution."))}
                }
            }
            if case .proposal(let id,let revision,let digest)=route {
                if let pending=tripStore.pending,pending.proposal.id==id,pending.proposal.revision==revision,pending.proposal.digest==digest,tripStore.detail?.trip.headVersion==basis.tripVersion,currentBasis()==basis {
                    NavigationLink(t("审阅原提议差异，再明确决定", "Review original proposal diff and decide explicitly")) {
                        NativeTripView(initialTripID:basis.tripId,initialTripScope:session.dataScope,initialProposalReference:"\(id):\(revision):\(digest)",initialTripVersion:basis.tripVersion)
                    }
                    Text(t("这里不直接改 Trip；仍须原 Proposal/diff 确认与版本 CAS。", "This screen does not write Trip; original Proposal/diff confirmation and version CAS remain required."))
                }else{Text(t("精确提议或 Trip 版本不可读／已变化，请返回重核。", "Exact proposal/Trip version unreadable or changed; return and recheck."))}
            }
            if notice{Text(t("没有当前合格的精确材料或资格，保持未知；不使用最新／其他资料替代。", "Exact current material/qualification unavailable; remains unknown. No latest/other evidence fallback."))}
        }.navigationTitle(t("执行下一步并核对", "Take next step and verify"))
        .task{await load()}
        .onChange(of:session.dataScope){_,_ in statement=nil;expires=nil;tripStore.reset(for:session.dataScope)}
        .onChange(of:phase){_,value in if value != .active{statement=nil;expires=nil}}
        .onDisappear{returned()}
    }
    private func load()async {
        guard phase == .active,currentBasis()==basis,execution.basis==basis,let actor=session.dataScope else{notice=true;return}
        if case .proposal=route {
            tripStore.reset(for:actor);await tripStore.select(basis.tripId,using:session);return
        }
        if execution.result.kind=="verification_entry" {
            notice=false;expires=Date().addingTimeInterval(30);return
        }
        guard let evidence=execution.result.evidence,evidence.valid else{notice=true;return}
        statement=evidence;expires=NativeKnowledgeRead.date(evidence.expiresAt);notice=false
    }
}
