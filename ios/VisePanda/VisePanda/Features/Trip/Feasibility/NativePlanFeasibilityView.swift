import SwiftUI

struct NativePlanFeasibilityView:View {
    let session:NativeSession
    let tripStore:NativeTripStore
    let chinese:Bool
    @Environment(\.scenePhase) private var phase
    @State private var store=NativePlanFeasibilityStore()
    @State private var partySize=1
    @State private var currency="CNY"
    @State private var budgetEnabled=false
    @State private var budget=""
    @State private var walkingEnabled=false
    @State private var walking=""
    @State private var transfer=15
    @State private var baggage=0
    @State private var appointment=0
    @State private var acknowledged=false
    @State private var task:Task<Void,Never>?
    private var target:NativePlanFeasibilityTarget? {
        guard let actor=session.dataScope,tripStore.scope==actor,let pending=tripStore.pending,!pending.proposal.stale,pending.proposal.status=="pending" else{return nil}
        return .init(actor:actor,pending:pending)
    }
    private var needs:NativePlanNeeds? {
        if budgetEnabled && Int(budget)==nil || walkingEnabled && Int(walking)==nil{return nil}
        let value=NativePlanNeeds(partySize:partySize,currency:currency,maxBudgetMinor:budgetEnabled ? Int(budget):nil,minTransferMinutes:transfer,baggageBufferMinutes:baggage,appointmentBufferMinutes:appointment,maxWalkingMinutes:walkingEnabled ? Int(walking):nil)
        return value.valid ? value:nil
    }
    private var inputIdentity:String {"\(partySize)|\(currency)|\(budgetEnabled)|\(budget)|\(transfer)|\(baggage)|\(appointment)|\(walkingEnabled)|\(walking)"}
    private func t(_ zh:String,_ en:String)->String{chinese ? zh:en}
    private func constraintName(_ key:String)->String {
        let labels:[String:(String,String)]=["calendar_timezone":("日期与时区","Date and timezone"),"actual_place":("真实地点","Actual place"),"door_to_door_route":("门到门交通","Door-to-door route"),"baggage_appointment_buffers":("行李与预约缓冲","Baggage/appointment buffers"),"last_connection":("末班衔接","Last connection"),"walking_limit":("步行上限","Walking limit"),"plan_items":("计划条目","Plan items"),"opening":("开放时间","Opening hours"),"reservation":("预约资格","Reservation"),"route":("换乘依据","Transfer evidence"),"budget":("总预算","Total budget")]
        guard let label=labels[key] else{return key};return t(label.0,label.1)
    }
    var body:some View {
        Form {
            Section(t("核验当前提议的逐条约束", "Check constraints of the current proposal")) {
                if let target{Text("\(target.tripId) · \(target.proposalId) · r\(target.proposalRevision) / v\(target.baseVersion)").font(.caption).textSelection(.enabled)}
                Text(t("只核验服务端固定的同一份提议。结果不会改动行程、固定预约或已审阅差异，也不代为预订。缺少合格来源的约束保持待核验。", "Checks the exact server-bound proposal only. Results do not modify Trip, fixed appointments or the reviewed diff and do not book anything. Constraints without qualified sources remain pending."))
            }
            Section(t("本次明确输入的限制", "Explicit needs for this check")) {
                Stepper(t("人数：", "Party size: ")+"\(partySize)",value:$partySize,in:1...20)
                TextField(t("三字母货币代码", "Three-letter currency code"),text:$currency).textInputAutocapitalization(.characters)
                Toggle(t("本次设置总预算上限", "Set a budget limit for this check"),isOn:$budgetEnabled)
                if budgetEnabled{TextField(t("最低货币单位整数（人民币分）", "Integer minor currency units"),text:$budget).keyboardType(.numberPad)}
                Stepper(t("换乘最低分钟：", "Minimum transfer minutes: ")+"\(transfer)",value:$transfer,in:0...1440)
                Stepper(t("行李缓冲分钟：", "Baggage buffer minutes: ")+"\(baggage)",value:$baggage,in:0...1440)
                Stepper(t("预约缓冲分钟：", "Appointment buffer minutes: ")+"\(appointment)",value:$appointment,in:0...1440)
                Toggle(t("本次设置步行分钟上限", "Set a walking-minute limit"),isOn:$walkingEnabled)
                if walkingEnabled{TextField(t("步行分钟整数", "Integer walking minutes"),text:$walking).keyboardType(.numberPad)}
                Toggle(t("确认这些限制仅用于本次核验", "Confirm these needs apply to this check only"),isOn:$acknowledged)
            }.disabled(store.busy)
            if let pending=tripStore.pending,let after=pending.proposal.after {
                Section(t("明确选择条目的地点来源", "Explicit item-place evidence choices")) {
                    ForEach(after.days){day in
                        ForEach(day.items){item in
                            NavigationLink("\(day.id) / \(item.id) · \(item.title)") {
                                NativePlanPlacePicker(session:session,pending:pending,dayID:day.id,itemID:item.id,chinese:chinese,current:{target},selected:{store.choose($0)})
                            }.disabled(store.busy)
                        }
                    }
                    ForEach(store.choices){choice in
                        Text("\(choice.dayId)/\(choice.itemId) · \(choice.placeReferenceId) · \(choice.mappingId) v\(choice.expectedMappingVersion)").font(.caption)
                        Button(t("移除此本次来源选择", "Remove this check's evidence choice")){store.remove(choice.id)}.disabled(store.busy)
                    }
                }
            }else{Text(t("尚无服务端 after-diff 快照，不能猜测条目或地点关系。", "Server after-diff snapshot unavailable; item/place relationships cannot be guessed."))}
            Button(t("按这组明确输入核验当前提议", "Check this proposal with these explicit needs")) {
                guard let needs else{return}
                task?.cancel();task=Task{await store.check(needs:needs,after:tripStore.pending?.proposal.after,current:{target},post:{bytes in guard let target else{throw NativeDataError.sessionUnavailable};return try await session.planFeasibility(target,body:bytes)})}
            }.disabled(!acknowledged || needs==nil || target==nil || store.busy)
            TimelineView(.periodic(from:.now,by:1)){_ in
                if let result=store.visible(target) {
                    Section(t("服务端逐约束结果", "Server constraint results")) {
                        Text(result.status=="infeasible" ? t("有约束冲突", "Constraint conflict found"):result.status=="pending" ? t("仍有待核验项", "Some constraints remain pending"):t("所列约束已获支持", "Listed constraints supported"))
                        ForEach(Array(result.lines.enumerated()),id:\.offset){_,line in
                            VStack(alignment:.leading){Text("\(line.itemId ?? t("计划层", "Plan level")) · \(constraintName(line.constraint))");Text(line.status=="supported" ? t("此项获支持", "This constraint supported"):line.status=="violated" ? t("此项冲突", "This constraint violated"):t("此项待核验", "This constraint pending"));Text(line.reason).font(.caption)}
                        }
                        ForEach(result.evidenceBasis,id:\.itemId){evidence in
                            Text("\(evidence.itemId) · \(evidence.placeReferenceId) · \(evidence.mappingId) v\(evidence.mappingVersion) · \(evidence.claimType)").font(.caption).textSelection(.enabled)
                            Text("\(evidence.sourceDigest) · \(evidence.contextDigest)").font(.caption)
                            ForEach(evidence.facts,id:\.factId){fact in Text("\(fact.factId) v\(fact.version) · \(fact.expiresAt)").font(.caption)}
                        }
                        ForEach(Array(result.missingEvidence.enumerated()),id:\.offset){_,missing in Text(t("待补来源：", "Missing evidence: ")+"\(missing.itemId ?? "plan") · \(missing.constraint) · \(missing.reason)").font(.caption)}
                        ForEach(result.userDecisions,id:\.itemId){decision in Text(t("保留原时间：", "Original time preserved: ")+"\(decision.dayId)/\(decision.itemId) · \(decision.startsAt ?? "—") → \(decision.endsAt ?? "—")").font(.caption)}
                        Text(t("仅表示本次所列约束，不是全部旅行风险、预约或整份行程的保证；来源或提议变化需重新核验。", "Applies only to constraints listed in this check; it is not a guarantee of all travel risks, bookings or the whole itinerary. Changed sources/proposal require another check."))
                    }
                }
            }
            if store.notice != nil{Text(t("核验来源、权限或提议依据未确认；没有声明可行，也没有修改提议。输入过大时请明确减少来源选择。", "Evidence/authority/proposal basis unconfirmed; feasibility is not claimed and proposal is unchanged. Explicitly reduce evidence choices if input is too large."))}
        }.navigationTitle(t("计划约束核验", "Plan constraint check"))
        .task(id:target){store.bind(target);acknowledged=false}
        .onChange(of:inputIdentity){_,_ in store.invalidate();acknowledged=false}
        .onChange(of:target){_,value in task?.cancel();store.bind(value);acknowledged=false}
        .onChange(of:phase){_,value in if value != .active{task?.cancel();store.bind(nil);acknowledged=false}else{store.bind(target)}}
        .onDisappear{task?.cancel()}
    }
}

private struct NativePlanPlacePicker:View {
    let session:NativeSession;let pending:NativeTripPending;let dayID:String;let itemID:String;let chinese:Bool
    let current:()->NativePlanFeasibilityTarget?
    let selected:(NativePlanPlaceChoice)->Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var phase
    @State private var context:NativeTripSupportContext?
    @State private var reference=""
    @State private var city="shanghai"
    @State private var scene="attraction"
    @State private var entries:[NativeTripSupportCandidates.Entry]=[]
    @State private var cursor:NativeTripSupportCandidates.Cursor?
    @State private var busy=false
    @State private var notice=false
    private var target:NativeTripSupportTarget?{
        guard let selected=current(),selected.proposalId==pending.proposal.id,selected.proposalRevision==pending.proposal.revision,selected.proposalDigest==pending.proposal.digest else{return nil}
        return .init(actor:selected.actor,tripID:selected.tripId,tripVersion:selected.baseVersion,dayID:dayID,itemID:itemID)
    }
    private func t(_ zh:String,_ en:String)->String{chinese ? zh:en}
    var body:some View {
        Form {
            if let context {
                Picker(t("明确选择已拥有的地点参考", "Explicit owned place reference"),selection:$reference){Text(t("请选择", "Choose")).tag("");ForEach(context.canonicalPlaceReferences){ref in Text((chinese ? ref.display.zh:ref.display.en) ?? ref.referenceId).tag(ref.referenceId)}}
                Picker(t("来源城市", "Source city"),selection:$city){ForEach(["shanghai","beijing","guangzhou","chongqing"],id:\.self){Text($0).tag($0)}}
                Picker(t("来源场景", "Source scene"),selection:$scene){ForEach(["arrival","airport_transport","payment","connectivity","public_transport","taxi","rail","attraction","accommodation","emergency"],id:\.self){Text($0).tag($0)}}
                Button(t("读取当前合格来源", "Read currently qualified evidence")){Task{await load(more:false)}}.disabled(reference.isEmpty || busy)
                ForEach(entries){entry in
                    VStack(alignment:.leading){
                        ForEach(Array((entry.claim.value.lines ?? []).enumerated()),id:\.offset){_,line in Text(line)}
                        if let starts=entry.claim.value.startsAt{Text(starts)}
                        if let ends=entry.claim.value.endsAt{Text(ends)}
                        if let zone=entry.claim.value.timeZone{Text(zone)}
                        Text("\(entry.scope.rawValue) · \(entry.mappingId) v\(entry.mappingVersion)").font(.caption);Text(entry.sourceDigest).font(.caption)
                        Button(t("明确用于本次计划核验", "Explicitly use for this check")){
                            guard let target,current()?.proposalDigest==pending.proposal.digest,context.canonicalPlaceReferences.contains(where:{$0.referenceId==reference}) else{return}
                            selected(.init(dayId:target.dayID,itemId:target.itemID,placeReferenceId:reference,mappingId:entry.mappingId,expectedMappingVersion:entry.mappingVersion,city:city,scene:scene,locale:chinese ? "zh":"en"));dismiss()
                        }.disabled(busy || entry.claim.evidence.contains{NativeKnowledgeRead.date($0.expiresAt).map{$0<=Date()} != false})
                    }
                }
                if cursor != nil{Button(t("下一页来源", "Next evidence page")){Task{await load(more:true)}}.disabled(busy)}
                if entries.isEmpty{Text(t("尚无当前合格映射；不按名称猜测。", "No currently qualified mapping; no name guessing."))}
            }else{Text(t("真实地点关系未获准或不可用。", "Real place relationships unqualified/unavailable."))}
            if notice{Text(t("来源或依据变化，请重新读取。", "Evidence/basis changed; read again."))}
        }.navigationTitle(t("条目来源选择", "Item evidence selection"))
        .task(id:target){context=nil;entries=[];cursor=nil;reference="";guard let target else{return};do{let bytes=try await session.tripSupportContext(target:target,proposal:pending.proposal);guard self.target==target else{return};context=try NativeTripSupportContext.decode(bytes,target:target,proposal:pending.proposal)}catch{notice=true}}
        .onChange(of:reference){_,_ in entries=[];cursor=nil}
        .onChange(of:city){_,_ in entries=[];cursor=nil}
        .onChange(of:scene){_,_ in entries=[];cursor=nil}
        .onChange(of:phase){_,value in if value != .active{context=nil;entries=[];cursor=nil}}
    }
    private func load(more:Bool)async {
        guard !busy,let target,context?.canonicalPlaceReferences.contains(where:{$0.referenceId==reference})==true else{return}
        let ref=reference,c=city,s=scene,next=more ? cursor:nil;busy=true;defer{busy=false}
        do{let bytes=try await session.tripSupportCandidates(target:target,placeReferenceID:ref,city:c,scene:s,locale:chinese ? "zh":"en",cursor:next);guard self.target==target,ref==reference,c==city,s==scene else{return};let page=try NativeTripSupportCandidates.decode(bytes,target:target,placeReferenceID:ref,cursor:next);let all=(more ? entries:[])+page.entries;guard all.count<=500,Set(all.map(\.id)).count==all.count else{throw NativeDataError.invalidResponse};entries=all;cursor=page.nextCursor;notice=false}catch{entries=[];cursor=nil;notice=true}
    }
}
