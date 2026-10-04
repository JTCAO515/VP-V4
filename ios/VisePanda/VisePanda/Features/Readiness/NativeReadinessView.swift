import SwiftUI

struct NativeReadinessView:View {
    let tripID:String
    let tripVersion:Int
    @Environment(AppSettings.self) private var settings
    @Environment(\.scenePhase) private var phase
    @State private var store=NativeReadinessActionsStore()
    @State private var scenario=NativeReadinessScenario.connectivity
    @State private var city="shanghai"
    @State private var subject:String?
    @State private var subjects:[NativeKnowledgeStatement]=[]
    @State private var applies="unknown"
    @State private var resources="unknown"
    @State private var conditions="unknown"
    @State private var timing="unknown"
    @State private var selectedTime=Date()
    @State private var currentVersion:Int?
    @State private var task:Task<Void,Never>?
    @State private var showAction=false
    private var session:NativeSession{settings.nativeSession}
    private var chinese:Bool{settings.selectedLocale == .zh}
    private var version:Int{currentVersion ?? tripVersion}
    private func t(_ zh:String,_ en:String)->String{chinese ? zh:en}
    private var declaration:NativeReadinessDeclaration{.init(scenario:scenario,city:city,locale:chinese ? "zh":"en",subjectId:subject,applies:applies,resourcesReady:resources,conditionsChecked:conditions,checkAt:timing=="later" ? ISO8601DateFormatter().string(from:selectedTime):timing)}
    private var selectionKey:String{"\(scenario.rawValue)|\(city)|\(chinese)"}
    private var key:String{"\(scenario.rawValue)|\(city)|\(subject ?? "")|\(chinese)"}
    var body:some View {
        Form {
            Section {
                Text(t("准备检查与实际下一步", "Preparation checks and actual next steps"))
                Text(t("只用当前真实 Task/Trip 和合格来源。未知、不适用、尚未到时分开显示；声明不会变成已通过结论，不新建任务，不自动改行程。", "Uses a real current Task/Trip and qualified sources. Unknown, not applicable and not yet due stay distinct. Declarations are not stored pass verdicts; no new task or automatic Trip change."))
                Text("\(tripID) · v\(version)").font(.caption)
                if let task=store.taskId{Text(task).font(.caption).textSelection(.enabled)}else{Text(t("没有可读取的真实关联 Task；不会用随机 UUID 替代。", "No readable real linked Task; no random UUID substitute."))}
                ForEach(store.taskOptions){option in
                    Button(t("明确选择现有任务：", "Explicitly choose existing task: ")+option.label){store.selectTask(option.id);run{await read()}}.disabled(store.busy)
                    Text("\(option.taskId) · \(option.goalId) r\(option.goalVersion)").font(.caption)
                }
                if !store.taskOptions.isEmpty{Text(t("包括单个选项在内均需明确选择；选项不是完整任务清单，也不等于准备权限。", "Explicit selection is required even for one option. Options are not a full task inventory or readiness authority."))}
                Button(t("读取真实任务／当前行程并重核", "Read real task/current Trip and recheck")){run{await refresh()}}.disabled(store.busy)
            }
            Section(t("本次场景与声明", "Scenario and declarations")) {
                Group {
                Picker(t("准备场景", "Preparation scenario"),selection:$scenario){ForEach(NativeReadinessScenario.allCases){Text($0.label(chinese:chinese)).tag($0)}}
                Picker(t("城市", "City"),selection:$city){ForEach(NativeKnowledgeSelection.cities,id:\.self){Text($0).tag($0)}}
                if scenario == .address || scenario == .admission {
                    Picker(t("明确选择当前合格地点主题", "Explicit qualified place subject"),selection:$subject){Text(t("未知／未选择", "Unknown/not selected")).tag(String?.none);ForEach(subjects){row in Text(row.place.map{chinese ? $0.names.zh:$0.names.en} ?? row.text).tag(Optional(row.assertion.subjectId))}}
                }
                answer(t("此准备适用吗？", "Does this preparation apply?"),$applies)
                answer(t("所需资源／材料已备妥？", "Resources/materials ready?"),$resources)
                answer(t("已核对当前适用条件？", "Current applicability conditions checked?"),$conditions)
                Picker(t("何时核对", "When to check"),selection:$timing){Text(t("未知", "Unknown")).tag("unknown");Text(t("现在", "Now")).tag("now");Text(t("明确时间", "Explicit time")).tag("later")}
                if timing=="later"{DatePicker(t("本人的核对时间（非预约／开门时间）", "Your check time, not booking/opening time"),selection:$selectedTime)}
                }.disabled(store.pendingSave != nil)
                Button(store.pendingSave==nil ? t("明确保存这些声明并重核", "Explicitly save declarations and recheck"):t("明确重试同一未决声明保存", "Explicitly retry same pending declaration save")){run{await store.save(tripId:tripID,tripVersion:version,selection:declaration,current:{session.dataScope},persist:{try session.rememberReadinessSave($0)},acknowledge:{try session.removeReadinessSave($0)},post:{try await session.readinessActions(tripId:tripID,body:$0)})}}
                    .disabled(store.busy || store.assessment==nil || store.taskId==nil)
            }.disabled(store.busy)
            TimelineView(.periodic(from:.now,by:1)){_ in
                if let assessment=store.visibleAssessment(current:session.dataScope,foreground:phase == .active) {
                    Section(t("三轴结论与依据", "Three-axis assessment and basis")) {
                        Text(t("知识依据：", "Knowledge: ")+axis(assessment.knowledgeAvailability.rawValue))
                        Text(t("用户准备（明确声明）：", "Readiness (explicit user report): ")+axis(assessment.userReadiness.rawValue))
                        Text(t("行动时机：", "Timing: ")+axis(assessment.actionTiming.rawValue))
                        Text("\(assessment.ruleVersion) · \(assessment.ontologyVersion) · declaration r\(assessment.declarationRevision) · \(assessment.declarationState)").font(.caption)
                        Text(assessment.basis.dateBasis).font(.caption)
                        if assessment.declarationState=="stale"{Text(t("日期或 Task 依据变化；旧声明不沿用，请明确重声明。", "Date/task basis changed; old declarations are not reused. Explicitly declare again."))}
                        ForEach(assessment.evidence,id:\.factId){evidence in Text(evidence.text);ForEach(Array(evidence.conditions.enumerated()),id:\.offset){_,text in Text(text).font(.caption)};ForEach(Array(evidence.exclusions.enumerated()),id:\.offset){_,text in Text(text).font(.caption)}}
                    }
                    Section(t("可执行下一步", "Executable next step")) {
                        ForEach(store.visible(current:session.dataScope,foreground:phase == .active)){action in
                            Button(actionLabel(action)){run{await store.execute(action,tripVersion:version,selection:declaration,current:{session.dataScope},post:{try await session.readinessActions(tripId:tripID,body:$0)});showAction=store.execution != nil && store.route != nil}}
                        }
                        if assessment.userReadiness == .notApplicable{Text(t("此项不适用，不制造准备风险或新待办。", "Not applicable; no manufactured risk or new task."))}
                        if assessment.userReadiness == .satisfied{Text(t("仅表示你声明已满足本项，不代表网络已开通、支付／入场获准或全部准备完成。", "Your report satisfies this check only; it does not prove network activation, payment/admission authorization or all preparation completion."))}
                    }
                }
            }
            if store.notice != nil{Text(t("当前 Task、来源、声明版本或权限不可核实。未知不等于未满足，请读取当前依据再明确决定。", "Task/source/declaration version/authority unconfirmed. Unknown is not unsatisfied; reread current basis and decide explicitly."))}
        }.navigationTitle(t("准备检查", "Preparation check"))
        .task(id:session.dataScope){await refresh()}
        .onChange(of:selectionKey){_,_ in applies="unknown";resources="unknown";conditions="unknown";subject=nil;store.invalidateAssessment();run{await read()}}
        .onChange(of:subject){_,_ in store.invalidateAssessment();run{await read()}}
        .onChange(of:session.dataScope){_,_ in task?.cancel();applies="unknown";resources="unknown";conditions="unknown";subject=nil;subjects=[];store.bind(session.dataScope)}
        .onChange(of:tripVersion){_,_ in currentVersion=nil;store.suspend();run{await refresh()}}
        .onChange(of:phase){_,value in if value != .active{task?.cancel();store.suspend();subjects=[]}else{run{await refresh()}}}
        .onDisappear{task?.cancel()}
        .sheet(isPresented:$showAction,onDismiss:{store.returnedFromAction();run{await refresh()}}){if let route=store.route,let execution=store.execution{NavigationStack{NativeReadinessActionDestination(route:route,execution:execution,basis:execution.basis,session:session,city:city,scenario:scenario,chinese:chinese,currentBasis:{store.visibleAssessment(current:session.dataScope,foreground:phase == .active)?.actionBasis},returned:{})}}}
    }
    private func axis(_ state:String)->String {
        switch state {
        case "available":t("有当前合格依据","Current qualified evidence available")
        case "satisfied":t("此项已满足 · 用户明确声明","Satisfied for this check · explicit user report")
        case "not_satisfied":t("此项尚未满足","Not yet satisfied")
        case "not_applicable":t("此项不适用","Not applicable")
        case "now":t("现在可核对","Check now")
        case "not_yet":t("尚未到明确选择的核对时间","Selected check time has not arrived")
        default:t("未知，需核对","Unknown; verification needed")
        }
    }
    private func answer(_ label:String,_ value:Binding<String>)->some View{Picker(label,selection:value){Text(t("未知", "Unknown")).tag("unknown");Text(t("是", "Yes")).tag("yes");Text(t("否", "No")).tag("no")}}
    private func actionLabel(_ action:NativeReadinessAction)->String{switch action.kind{case .readMaterial:t("读取这份精确材料及范围", "Read exact material and scope");case .verifyEntry:t("进入实际核对入口", "Open actual verification entry");case .conditionalCandidate:t("读取条件化候选依据", "Read conditional candidate basis");case .tripProposal:t("核对现有 Proposal 再审阅差异", "Verify existing proposal and review diff")}}
    private func run(_ operation:@escaping @MainActor ()async->Void){task?.cancel();task=Task{await operation()}}
    private func refresh()async {
        guard let actor=session.dataScope else{store.bind(nil);return};store.bind(actor)
        do{if let pending=try session.readinessSaveRecovery(){guard pending.tripId==tripID else{store.suspend();return};try store.restorePending(pending,current:actor)}}catch{store.suspend();return}
        do{let bytes=try await session.tripRequest(path:"api/trips/native/v2/\(tripID)",method:"GET");guard session.dataScope==actor else{return};let trip=try JSONDecoder().decode(NativeTripDetail.self,from:bytes);guard trip.trip.id==tripID else{throw NativeDataError.invalidResponse};currentVersion=trip.trip.headVersion}catch{store.suspend();return}
        await store.discoverTask(tripId:tripID,tripVersion:version,current:{session.dataScope},get:{try await session.readinessTaskDiscovery(tripId:tripID)})
        await read()
    }
    private func read()async {
        await store.read(tripId:tripID,tripVersion:version,selection:declaration,current:{session.dataScope},discardInvalid:{try session.removeReadinessSave($0)},post:{try await session.readinessActions(tripId:tripID,body:$0)})
        if let read=store.assessment{applies=read.declaration.applies;resources=read.declaration.resourcesReady;conditions=read.declaration.conditionsChecked;timing=read.declaration.checkAt=="now" ? "now":read.declaration.checkAt=="unknown" ? "unknown":"later";if let date=NativeKnowledgeRead.date(read.declaration.checkAt){selectedTime=date}}
        if scenario == .address || scenario == .admission {
            do{let bytes=try await session.knowledgeRequest(selection:.init(city:city,scene:"attraction",locale:chinese ? "zh":"en"));let reply=try JSONDecoder().decode(NativeKnowledgeReply.self,from:bytes).data;_=try reply.lifetime(for:reply.scope,elapsed:0);subjects=reply.statements.filter{$0.validPlace}.filter{$0.assertion.predicate==(scenario == .address ? "located_at":"opens_during")}}catch{subjects=[]}
        }
    }
}
