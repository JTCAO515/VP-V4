import SwiftUI

struct NativeJourneysView: View {
    var isActive = true
    var onOpenVP: (() -> Void)?
    var onOpenGoal: ((NativeJourneyGoalEntry) -> Void)?
    @Environment(AppSettings.self) private var settings
    @Environment(\.scenePhase) private var scenePhase
    @State private var store = NativeJourneysStore()
    @State private var goalSelection: NativeJourneyGoalEntry?
    @State private var resultSelection: LibraryResultSelection?
    @State private var resultRequestGeneration = UUID()
    @State private var refresh = UUID()
    @State private var cursor: String?
    private var session: NativeSession { settings.nativeSession }
    private var chinese: Bool { settings.selectedLocale == .zh }
    private func text(_ en: String, _ zh: String) -> String { chinese ? zh : en }
    private var key: LoadKey { .init(scope: session.dataScope, active: isActive && scenePhase == .active, refresh: refresh, cursor: cursor) }

    var body: some View {
        List {
            Section {
                Text(text("Available goals across your VP conversations, one page at a time. Goals can come before dates or a Trip. Confirmed content stays in Trip.", "跨 VP 会话的可读取目标，按页显示。目标可先于日期或行程存在；已确认内容仍保存在行程中。"))
                    .accessibilityIdentifier("journeys.scope")
                Button(text("Open VP", "打开 VP")) { onOpenVP?() }
                    .disabled(onOpenVP == nil).accessibilityIdentifier("journeys.open-vp")
                NavigationLink(value: AppRoute.entry(.trip)) {
                    Text(text("Open Trips", "打开行程"))
                }.accessibilityIdentifier("journeys.open-trips")
                Button(text("Refresh", "刷新")) { store.clear(); cursor = nil; refresh = UUID() }
                    .accessibilityIdentifier("journeys.refresh")
            }
            TimelineView(.periodic(from: .now, by: 1)) { _ in
                if session.dataScope == nil {
                    Text(text("Sign in from Profile to read your journeys.", "请在「我的」登录后查看旅程。"))
                        .accessibilityIdentifier("journeys.signed-out")
                } else if key.active && store.isCurrent(session.dataScope) {
                    projection
                    if let next = store.nextCursor {
                        Button(text("Next goals", "下一页目标")) {
                            guard store.isCurrent(session.dataScope) else { return }
                            store.beginPageChange(); cursor = next
                        }.accessibilityIdentifier("journeys.next-page")
                    }
                } else {
                    Text(store.busy ? text("Checking current journeys…", "正在核对当前旅程…") : text("Journey reads are unavailable or expired. Refresh to check again.", "旅程读取暂不可用或已过期，请刷新核对。"))
                        .accessibilityIdentifier("journeys.unavailable")
                }
            }
        }
        .sheet(item:$goalSelection){entry in
            NativeJourneyGoalDetails(entry:entry,session:session,chinese:chinese,active:isActive,onOpenGoal:onOpenGoal)
        }
        .sheet(item:$resultSelection){selection in NativeFiveResultDetail(artifactID:selection.artifactID,revision:selection.revision,session:session,chinese:chinese,active:isActive)}
        .navigationTitle(text("Journeys", "旅程"))
        .task(id: key) {
            let captured = key
            guard captured.active, captured.scope != nil else { store.clear(); return }
            while session.busy {
                do { try await Task.sleep(for: .milliseconds(50)) } catch { return }
                guard key == captured, !Task.isCancelled else { return }
            }
            await store.load(scope: captured.scope, assistant: session.askMode == .assistant, cursor: captured.cursor, crossConversation: true,
                             currentScope: { session.dataScope }) { path in
                if path == "api/trips/native/v2" { return try await session.tripRequest(path: path, method: "GET") }
                let base = "api/chat/native/v5/journeys-goals"
                if path == base || path.hasPrefix(base + "/") {
                    return try await session.journeysGoalIndexRequest(cursor: path == base ? nil : String(path.dropFirst(base.count + 1)))
                }
                return try await session.askRequest(path: path, method: "GET")
            }
        }
        .onChange(of: session.dataScope) { _, _ in store.clear(); cursor = nil; resultSelection = nil; goalSelection=nil; resultRequestGeneration = UUID() }
        .onChange(of: isActive) { _, active in if !active { store.clear(); resultSelection=nil; goalSelection=nil; resultRequestGeneration=UUID() } }
        .onChange(of: scenePhase) { _, phase in if phase != .active { store.clear(); resultSelection=nil; goalSelection=nil; resultRequestGeneration=UUID() } }
        .onDisappear { store.clear() }
    }

    @ViewBuilder private var projection: some View {
        Section(text("Conversation goals", "会话目标")) {
            if !store.goalsAvailable {
                Text(text("Goals unavailable. Existing Trips remain separate below.", "目标暂不可用，下方仍独立显示已有行程。"))
            } else if store.rows.isEmpty {
                Text(text("No available goal in your conversations.", "会话中暂无可读取目标。"))
            }
            ForEach(store.rows) { row in
                VStack(alignment: .leading, spacing: 8) {
                    Text(row.goal.text).font(.headline).fixedSize(horizontal: false, vertical: true)
                    Text(text("Goal version ", "目标版本 ") + String(row.goal.scopeVersion)).font(.caption)
                    if let onOpenGoal, let capturedScope = store.scope, let conversationID = row.conversationID ?? store.conversationID {
                        Button(text("Open this goal in VP", "在 VP 打开此目标")) {
                            guard store.isCurrent(session.dataScope), session.dataScope == capturedScope else { return }
                            onOpenGoal(.init(scope: capturedScope, conversationID: conversationID, goalID: row.id, scopeVersion: row.goal.scopeVersion))
                        }.buttonStyle(.borderless)
                            .accessibilityIdentifier("journeys.goal.open.\(row.id)")
                        Button(text("Tasks, results and next decision", "任务、成果与下一项决定")) {
                            guard store.isCurrent(session.dataScope),session.dataScope==capturedScope else{return}
                            goalSelection = .init(scope:capturedScope,conversationID:conversationID,goalID:row.id,scopeVersion:row.goal.scopeVersion)
                        }.buttonStyle(.borderless).accessibilityIdentifier("journeys.goal.activity.\(row.id)")
                    }
                    if row.goal.scopeVersion == 10001 {
                        Text(text("This goal’s Trip link is closed. Read only here.", "该目标的行程关联已终止，此处只读。"))
                    }
                    switch row.relation {
                    case .unlinked:
                        if row.goal.scopeVersion != 10001 {
                            Text(text("No Trip linked. Goal changes stay in VP.", "尚未关联行程，目标修改仍在 VP 中进行。"))
                        }
                    case .unknown:
                        Text(text("Trip relationship needs checking. Refresh or open VP.", "行程关系待核对，请刷新或打开 VP。"))
                    case .linked(let id):
                        if let trip = store.trips.first(where: { $0.id == id }) {
                            Text(text("Linked Trip: ", "已关联行程：") + trip.title)
                        }
                    }
                }.accessibilityElement(children: .contain)
                    .accessibilityIdentifier("journeys.goal.\(row.id)")
            }
        }
        Section(text("Saved Trips", "已保存行程")) {
            if !store.tripsAvailable { Text(text("Trip list unavailable.", "行程列表暂不可用。")) }
            else if store.trips.isEmpty { Text(text("No saved Trip.", "暂无已保存行程。")) }
            ForEach(store.trips) { trip in
                if let capturedScope = store.scope {
                    Button(text("Read this Trip's exact result", "读取此行程的精确成果")) {
                        let requestGeneration=UUID();resultRequestGeneration=requestGeneration;resultSelection=nil
                        Task {
                            do {
                                let bytes=try await session.fiveResultReference(field:"trip",id:trip.id)
                                guard resultRequestGeneration==requestGeneration,isActive,scenePhase == .active,session.dataScope==capturedScope,store.isCurrent(session.dataScope) else{return}
                                if let ref=try NativeFiveResultReference.decode(bytes,field:"tripId",expectedID:trip.id){resultSelection = .init(artifactID:ref.artifactID,revision:ref.revision)}
                            }catch{if resultRequestGeneration==requestGeneration,session.dataScope==capturedScope{resultSelection=nil}}
                        }
                    }.accessibilityIdentifier("journeys.trip.result.\(trip.id)")
                    NavigationLink(value: AppRoute.journeyTrip(.init(tripID: trip.id, scope: capturedScope))) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(trip.title).font(.headline)
                            Text(text("Trip version ", "行程版本 ") + String(trip.headVersion)).font(.caption)
                        }
                    }.accessibilityIdentifier("journeys.trip.\(trip.id)")
                }
            }
        }
    }

    private struct LoadKey: Equatable {
        let scope: NativeDataScope?
        let active: Bool
        let refresh: UUID
        let cursor: String?
    }
}

/// Read-only aggregation of existing Conversation, Task and Result authorities.
private struct NativeJourneyGoalDetails: View {
    let entry:NativeJourneyGoalEntry
    let session:NativeSession
    let chinese:Bool
    let active:Bool
    let onOpenGoal:((NativeJourneyGoalEntry)->Void)?
    @Environment(\.scenePhase) private var phase
    @Environment(\.dismiss) private var dismiss
    @State private var page:AssistantConversationTaskPage?
    @State private var result:LibraryResultSelection?
    @State private var cursor:String?
    @State private var generation=UUID()
    @State private var notice:String?
    @State private var deadline:TimeInterval=0
    private var key:Key? {guard active,phase == .active,session.dataScope==entry.scope else{return nil};return .init(entry:entry.id,cursor:cursor)}
    private func t(_ zh:String,_ en:String)->String{chinese ? zh:en}
    private var readable:Bool{key != nil && ProcessInfo.processInfo.systemUptime<deadline}
    var body:some View {
        ScrollView {VStack(alignment:.leading,spacing:12){
            Text(t("此目标的任务与成果","Tasks and results for this goal")).font(.headline)
            Button(t("返回 VP 继续此目标","Continue this goal in VP")){guard readable else{return};onOpenGoal?(entry);dismiss()}
                .disabled(!readable || onOpenGoal==nil)
            TimelineView(.periodic(from:.now,by:1)){_ in
                if readable,let page {
                    let messages=page.messages.filter{$0.goalId==entry.goalID}
                    if messages.isEmpty {Text(t("本页暂无此目标的任务。","This page contains no task for this goal."))}
                    ForEach(messages){message in
                        if let task=page.turns.first(where:{$0.serviceTaskId==message.taskId}) {
                            VStack(alignment:.leading,spacing:8){
                                Text(message.text)
                                Text(taskLabel(task)).font(.caption)
                                if !task.goalScopeCurrent {Text(t("旧目标版本的任务，仅供查看。","Task from a previous goal version; read only."))}
                                if task.status=="completed",task.goalScopeCurrent,let taskID=message.taskId {
                                    Button(t("查看成果／下一项决定","Read result / next decision")){Task{await openResult(taskID)}}
                                }
                            }
                        }
                    }
                    if let next=page.nextCursor {Button(t("下一页任务","Next tasks")){clear();cursor=next}}
                }else {Text(t("任务读取暂不可用，请刷新。","Tasks unavailable. Please refresh."))}
            }
            if notice != nil {Text(t("成果暂不可读，请刷新后重试。","Result unavailable. Refresh and retry."))}
            Button(t("刷新此目标","Refresh this goal")){clear();cursor=nil;generation=UUID()}
        }.padding()}
        .sheet(item:$result){selection in NativeFiveResultDetail(artifactID:selection.artifactID,revision:selection.revision,session:session,chinese:chinese,active:active)}
        .task(id:Load(key:key,generation:generation)){await load()}
        .onChange(of:key){_,_ in page=nil;result=nil;deadline=0}
        .onDisappear{clear()}
    }
    private func clear(){generation=UUID();page=nil;result=nil;deadline=0;notice=nil}
    private func load()async {
        guard let selected=key else{page=nil;result=nil;deadline=0;notice=nil;return};let own=generation
        func current()->Bool{key==selected && generation==own && !Task.isCancelled}
        let started=ProcessInfo.processInfo.systemUptime
        do {
            let conversation=try await AssistantConversationReader.read(requestedID:entry.conversationID,isCurrent:current){try await session.assistantConversationRequest(conversationID:entry.conversationID)}
            guard conversation.goals.contains(where:{$0.goalId==entry.goalID && $0.scopeVersion==entry.scopeVersion}) else{throw NativeDataError.invalidResponse}
            let bytes=try await session.assistantTaskHistoryRequest(conversationID:entry.conversationID,cursor:cursor)
            guard current() else{return}
            let read=try JSONDecoder().decode(AssistantConversationTaskPage.self,from:bytes)
            guard read.valid,read.conversationId==entry.conversationID,read.conversationSequence==conversation.nextSequence,ProcessInfo.processInfo.systemUptime-started<30 else{throw NativeDataError.invalidResponse}
            page=read;deadline=started+30;notice=nil
        }catch{guard current() else{return};page=nil;deadline=0;notice="unavailable"}
    }
    private func openResult(_ taskID:String)async {
        guard readable,let selected=key else{return};let own=generation
        do {
            let bytes=try await session.fiveResultReference(field:"task",id:taskID)
            guard generation==own,key==selected,readable,!Task.isCancelled else{return}
            if let ref=try NativeFiveResultReference.decode(bytes,field:"taskId",expectedID:taskID){result = .init(artifactID:ref.artifactID,revision:ref.revision);notice=nil}else{notice="unavailable"}
        }catch{if generation==own,key==selected{notice="unavailable"}}
    }
    private func taskLabel(_ task:AssistantConversationTaskStatus)->String {
        switch task.status {
        case "accepted":return t("已接纳","Accepted")
        case "planning":return t("规划中","Planning")
        case "retrieving":return t("检索中","Retrieving")
        case "generating":return t("生成中","Generating")
        case "validating":return t("核对中","Validating")
        case "completed":return task.outcome == .clarification ? t("待补充输入","Needs input"):t("已完成","Completed")
        case "failed":return t("失败","Failed")
        case "cancelled":return t("已取消","Cancelled")
        default:return t("暂不可用","Unavailable")
        }
    }
    private struct Key:Equatable{let entry:UUID;let cursor:String?}
    private struct Load:Equatable{let key:Key?;let generation:UUID}
}
