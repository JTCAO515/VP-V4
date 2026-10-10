import SwiftUI
import Observation

@MainActor @Observable final class NativeFiveResultStore {
    private(set) var record:NativeFiveResultRecord?
    private var erasedResultIDs=Set<String>()
    private var erasureScope:NativeDataScope?
    func applyResultErasure(_ erased:NativeResultDataErasure){
        guard key?.scope==erased.scope else{return}
        erasureScope=erased.scope;erasedResultIDs.formUnion(erased.artifactIDs)
        if record.map({erased.artifactIDs.contains($0.artifactID)})==true{record=nil;deadline=0}
        // Preserve original pendingChoice/pendingBody/submitting and writer generation.
    }
    private var eventGeneration = UUID()
    func invalidateAssistantEvent(_ signal: NativeAssistantEventsInvalidation) {
        guard key?.scope == signal.selection.scope else { return }
        guard signal.object == nil || signal.object == .artifact(key?.artifactID ?? "") else { return }
        eventGeneration = UUID(); record = nil; deadline = 0
        // Preserve immutable pendingChoice/pendingBody, submitting and writer generation.
    }
    private var generation=UUID()
    private var key:Key?
    private(set) var pendingChoice: NativeDecisionChoice?
    private(set) var choiceNotice: String?
    private var pendingBody: Data?
    private var submitting = false
    private var deadline:TimeInterval=0
    private let uptime:()->TimeInterval
    init(uptime:@escaping()->TimeInterval={ProcessInfo.processInfo.systemUptime}){self.uptime=uptime}
    struct Key:Equatable {let scope:NativeDataScope;let artifactID:String;let revision:Int}
    func clear(){generation=UUID();record=nil;key=nil;deadline=0;pendingChoice=nil;choiceNotice=nil;pendingBody=nil;submitting=false}
    func visible(_ scope:NativeDataScope?)->NativeFiveResultRecord?{guard scope==key?.scope,scope != nil,uptime()<deadline,record.map({!erasedResultIDs.contains($0.artifactID)})==true else{return nil};return record}
    func choose(option:String,comparison:NativeFiveResultRecord?,current:@escaping()->Key?,post:(Data)async throws->Data,read:(String,Int)async throws->Data)async{
        guard !submitting,let authority=key,authority==current(),let selected=visible(authority.scope),selected.current,let scope=key?.scope,
              case .decision(let decision)=selected.content,decision.state=="pending",let comparison,comparison.current,
              comparison.artifactID==decision.comparison.artifactId,comparison.revision==decision.comparison.revision,
              case .comparison(let content)=comparison.content,content.options?.contains(where:{$0.id==option})==true,selected.revision<1000 else{return}
        let request=pendingChoice ?? NativeDecisionChoice(artifactId:selected.artifactID,expectedRevision:selected.revision,operationId:UUID().uuidString.lowercased(),optionId:option)
        guard request.optionId==option,let body=pendingBody ?? (try? JSONEncoder().encode(request)) else{return};pendingChoice=request;pendingBody=body;choiceNotice=nil;let own=generation,eventOwn=eventGeneration
        submitting=true;defer{if generation==own{submitting=false}}
        do{
            let bytes=try await post(body);guard generation==own,eventGeneration==eventOwn,current()==authority,!Task.isCancelled else{return}
            guard let root=try JSONSerialization.jsonObject(with:bytes) as? [String:Any],Set(root.keys)==Set(["version","data"]),root["version"] as? Int==2,let data=root["data"] as? [String:Any] else{throw NativeDataError.invalidResponse}
            if data["kind"] as? String=="unavailable"{guard Set(data.keys)==Set(["kind"]) else{throw NativeDataError.invalidResponse};clear();return}
            guard Set(data.keys)==Set(["kind","artifactId","revision","reused"]),data["kind"] as? String=="selected",data["artifactId"] as? String==request.artifactId,
                  data["revision"] as? Int==request.expectedRevision+1,data["reused"] is Bool else{throw NativeDataError.invalidResponse}
            let readStarted=uptime()
            let next=try NativeFiveResultRecord.decode(await read(request.artifactId,request.expectedRevision+1),artifactID:request.artifactId,revision:request.expectedRevision+1)
            guard generation==own,eventGeneration==eventOwn,current()==authority,!Task.isCancelled else{return}
            guard uptime()-readStarted<30,let next,next.current,case .decision(let chosen)=next.content,chosen.state=="chosen",chosen.chosenOptionID==option else{throw NativeDataError.invalidResponse}
            record=next;key = .init(scope:scope,artifactID:next.artifactID,revision:next.revision);deadline=readStarted+30;pendingChoice=nil;pendingBody=nil
        }catch{guard generation==own,eventGeneration==eventOwn,current()==authority else{return};choiceFailed(error)}
    }
    func retryChoice(current:@escaping()->Key?,post:(Data)async throws->Data,read:(String,Int)async throws->Data)async{
        guard !submitting,let request=pendingChoice,let body=pendingBody,let authority=key,authority==current() else{return};let scope=authority.scope;let own=generation,eventOwn=eventGeneration
        submitting=true;defer{if generation==own{submitting=false}}
        do{
            let bytes=try await post(body);guard generation==own,eventGeneration==eventOwn,current()==authority,!Task.isCancelled else{return}
            guard let root=try JSONSerialization.jsonObject(with:bytes) as? [String:Any],Set(root.keys)==Set(["version","data"]),root["version"] as? Int==2,let data=root["data"] as? [String:Any] else{throw NativeDataError.invalidResponse}
            if data["kind"] as? String=="unavailable"{guard Set(data.keys)==Set(["kind"]) else{throw NativeDataError.invalidResponse};clear();return}
            guard Set(data.keys)==Set(["kind","artifactId","revision","reused"]),data["kind"] as? String=="selected",data["artifactId"] as? String==request.artifactId,
                  data["revision"] as? Int==request.expectedRevision+1,data["reused"] is Bool else{throw NativeDataError.invalidResponse}
            let readStarted=uptime()
            let next=try NativeFiveResultRecord.decode(await read(request.artifactId,request.expectedRevision+1),artifactID:request.artifactId,revision:request.expectedRevision+1)
            guard generation==own,eventGeneration==eventOwn,current()==authority,!Task.isCancelled else{return}
            guard uptime()-readStarted<30,let next,next.current,case .decision(let chosen)=next.content,chosen.state=="chosen",chosen.chosenOptionID==request.optionId else{throw NativeDataError.invalidResponse}
            record=next;key = .init(scope:scope,artifactID:next.artifactID,revision:next.revision);deadline=readStarted+30;pendingChoice=nil;pendingBody=nil;choiceNotice=nil
        }catch{guard generation==own,eventGeneration==eventOwn,current()==authority else{return};choiceFailed(error)}
    }
    private func choiceFailed(_ error: Error) {
        if case NativeDataError.server(let code)=error, ["UNAUTHENTICATED","DATA_POLICY_BLOCKED"].contains(code) {clear();return}
        record=nil;deadline=0;choiceNotice="unconfirmed"
    }
    func load(key requested:Key,current:@escaping ()->Key?,request:()async throws->Data)async{
        clear();guard requested==current(),UUID(uuidString:requested.artifactID) != nil,(1...1000).contains(requested.revision) else{return}
        if erasureScope != requested.scope{erasureScope=requested.scope;erasedResultIDs=[]}
        let own=generation,eventOwn=eventGeneration,started=uptime();key=requested
        do{let bytes=try await request();guard generation==own,eventGeneration==eventOwn,requested==current(),!Task.isCancelled else{return}
            guard uptime()-started<30 else{throw NativeDataError.invalidResponse}
            guard !erasedResultIDs.contains(requested.artifactID) else{throw NativeDataError.staleSessionResponse}
            record=try NativeFiveResultRecord.decode(bytes,artifactID:requested.artifactID,revision:requested.revision);deadline=started+30
        }catch{if generation==own{record=nil;deadline=0}}
    }
}
struct NativeFiveResultDetail:View {
    let artifactID:String;let revision:Int;let session:NativeSession;let chinese:Bool;var active=true
    @Environment(\.scenePhase) private var phase
    @State private var store=NativeFiveResultStore()
    @State private var comparison=NativeFiveResultStore()
    @State private var choosing:String?
    @State private var refresh=UUID()
    @Environment(\.dismiss) private var dismiss
    var onReference:((NativeDataScope,String,Int)->Void)? = nil
    private var key:NativeFiveResultStore.Key?{guard active,phase == .active,let scope=session.dataScope else{return nil};return .init(scope:scope,artifactID:artifactID,revision:revision)}
    var body:some View{
        ScrollView{VStack(alignment:.leading,spacing:12){
            if store.pendingChoice != nil {
                Text(chinese ? "选择尚未确认，请重试。":"Choice unconfirmed. Please retry.")
                Button(chinese ? "重试同一次明确选择":"Retry the same explicit choice"){
                    Task{await store.retryChoice(current:{key},post:{try await session.chooseFiveResultDecision($0)},read:{try await session.fiveResultRequest(artifactID:$0,revision:$1)})}
                }
            }
            Button(chinese ? "刷新此精确成果版本":"Refresh this exact result version"){store.clear();refresh=UUID()}
            TimelineView(.periodic(from:.now,by:1)){_ in
                if let value=store.visible(key?.scope){
                    NativeFiveResultCard(record:value,chinese:chinese)
                    if let onReference,value.current,let scope=key?.scope {Button(chinese ? "以此精确成果继续 / 改口":"Continue or amend from this exact result"){onReference(scope,value.artifactID,value.revision);dismiss()}}
                    if value.current,case .decision(let decision)=value.content,decision.state=="pending",let basis=comparison.visible(key?.scope),basis.current,case .comparison(let content)=basis.content{
                        ForEach(content.options ?? []){option in Button(chinese ? "明确选择："+option.title:"Choose explicitly: "+option.title){choosing=option.id}}
                    }
                }
                else{Text(chinese ? "成果暂不可读或已失效；不会替换成最新/其他成果。":"Result is unreadable or expired; no latest or other result is substituted.")}
            }
        }.padding()}
        .confirmationDialog(chinese ? "确认本次选择（不确认 Trip）":"Confirm this choice (does not confirm a Trip)",isPresented:Binding(get:{choosing != nil},set:{if !$0{choosing=nil}})){
            Button(chinese ? "明确提交选择":"Submit explicit choice"){
                guard let option=choosing else{return};choosing=nil
                Task{await store.choose(option:option,comparison:comparison.visible(key?.scope),current:{key},post:{try await session.chooseFiveResultDecision($0)},read:{try await session.fiveResultRequest(artifactID:$0,revision:$1)})}
            }
        }
        .task(id:Load(key:key,refresh:refresh)){
            guard let key else{store.clear();comparison.clear();return};await store.load(key:key,current:{self.key}){try await session.fiveResultRequest(artifactID:artifactID,revision:revision)}
            if let record=store.visible(key.scope),case .decision(let decision)=record.content{
                let comparisonKey=NativeFiveResultStore.Key(scope:key.scope,artifactID:decision.comparison.artifactId,revision:decision.comparison.revision)
                await comparison.load(key:comparisonKey,current:{self.key?.scope==key.scope ? comparisonKey:nil}){try await session.fiveResultRequest(artifactID:comparisonKey.artifactID,revision:comparisonKey.revision)}
            }
        }
        .onChange(of:session.assistantEventsInvalidation?.id){_,_ in
            guard let signal=session.assistantEventsInvalidation,
                  signal.matches(scope:session.dataScope,sessionID:(try? session.communitySafetyActor())?.sessionID) else{return}
            store.invalidateAssistantEvent(signal);comparison.invalidateAssistantEvent(signal)
        }
        .onChange(of:session.resultDataErasure?.id){_,_ in
            guard let erased=session.resultDataErasure,(try? session.communitySafetyActor())==erased.actor else{return}
            store.applyResultErasure(erased); comparison.applyResultErasure(erased)
            if erased.artifactIDs.contains(artifactID){choosing=nil}
        }
        .onChange(of:key){_,_ in store.clear();comparison.clear();choosing=nil}.onDisappear{store.clear();comparison.clear();choosing=nil}
    }
    private struct Load:Equatable{let key:NativeFiveResultStore.Key?;let refresh:UUID}
}
struct NativeFiveResultCard:View {
    let record:NativeFiveResultRecord;let chinese:Bool
    private func t(_ zh:String,_ en:String)->String{chinese ? zh:en}
    var body:some View{
        VStack(alignment:.leading,spacing:10){
            Text("\(record.artifactID) · r\(record.revision)").font(.caption).textSelection(.enabled).accessibilityIdentifier("result.exact.identity")
            if !record.current{Text(t("历史可读版本，不是当前建议、确认或执行资格。","Historically readable version, not current advice, confirmation, or execution authority."))}
            switch record.content{
            case .comparison(let content):Text(content.title).font(.headline);Text(content.summary);ForEach(content.options ?? []){o in VStack(alignment:.leading){Text(o.title);Text(o.tradeoff)}}
            case .proposal(let id,let revision):Text(t("提案引用","Proposal reference")).font(.headline);Text("\(id) · r\(revision)");Text(t("确认仍须原 Trip 提案差异与原子确认流程。","Confirmation still requires the existing Trip diff and atomic confirmation flow."))
            case .journey(let draft):Text(draft.title).font(.headline);Text(draft.summary);Text(draft.tripTitle);Text(t("不可编辑的行程预览，不是第二份 Trip。","Immutable journey preview, not a second editable Trip."));ForEach(draft.days){day in Text(day.date).font(.headline);ForEach(day.items){item in Text(item.title)}}
            case .decision(let value):Text(value.title).font(.headline);Text(value.summary);Text(value.state=="chosen" ? t("已记录明确选择：","Recorded explicit choice: ")+(value.chosenOptionID ?? ""):t("待明确选择，未推断替你决定。","Pending explicit choice; no decision is inferred."));Text("\(value.comparison.artifactId) · r\(value.comparison.revision)");Text(t("选择依据此比较的当前有效选项。","Choose from the currently available options in this comparison."))
            case .practical(let value):Text(t("已保存翻译","Saved translation")).font(.headline);Text("\(value.sourceLocale) → \(value.targetLocale)");Text(value.translation).textSelection(.enabled);Text(t("回译：","Back translation: ")+value.backTranslation)
            }
            Text(t("记录依据：","Recorded basis: ")+t("记忆 \(record.memories.count) 项，证据 \(record.evidence.count) 项","\(record.memories.count) Memory references, \(record.evidence.count) evidence references"))
            if !record.memories.isEmpty {
                DisclosureGroup(t("此成果的记忆引用","Memory references recorded with this result")) {
                    ForEach(record.memories,id:\.id){ref in Text("\(ref.id) · r\(ref.revision)").font(.caption).textSelection(.enabled)}
                    Text(t("这是成果记录的精确版本引用，不表示每个选项都已证明受它影响。","These are exact recorded versions; they do not prove influence on every option.")).font(.caption)
                }
            }
            Text(t("以上是此成果记录的参考资料。","These are the references recorded with this result."))
        }
    }
}
