from pathlib import Path
import subprocess, json, difflib
root=Path(__file__).resolve().parents[4]
base=Path('/Users/jtsm5p/Documents/Codex/VP-V5-worktrees/vpj08-native-assistant-events-20261010')
out=Path(__file__).parent
paths=['ios/VisePanda/VisePanda/App/NativeSession.swift','ios/VisePanda/VisePanda/Features/Ask/NativeAssistantConversationView.swift','ios/VisePanda/VisePanda/Features/Knowledge/NativeFiveResultModels.swift','ios/VisePanda/VisePanda/Features/Knowledge/NativeFiveResultView.swift','ios/VisePanda/VisePanda.xcodeproj/project.pbxproj']
pins=[]
for path in paths:
    before=(base/path).read_text();after=before
    if path.endswith('NativeSession.swift'):
        marker='    func fiveResultReference(field: String, id: String) async throws -> Data {'
        assert before.count(marker)==1
        addition='''    func travelDirectionsReadRequest(kind: String, conversationID: String, goalID: String) async throws -> Data {
        guard ["basis", "intake"].contains(kind), UUID(uuidString: conversationID) != nil,
              UUID(uuidString: goalID) != nil else { throw NativeDataError.invalidResponse }
        let root = "api/chat/native/v5/planning/directions"
        return try await dataRequest(prefix: root, path: root + "/" + kind, method: "GET",
            queryItems: [.init(name: "conversationId", value: conversationID), .init(name: "goalId", value: goalID)])
    }
    func travelDirectionsActionRequest(action: String, body: Data) async throws -> Data {
        guard ["submit", "choose", "save", "edit", "bind"].contains(action), body.count <= 16_384 else { throw NativeDataError.invalidResponse }
        let root = "api/chat/native/v5/planning/directions"
        return try await dataRequest(prefix: root, path: root + "/" + action, method: "POST", body: body)
    }

'''
        after=after.replace(marker,addition+marker)
        after=after.replace('let guardsTurnProjection = method == "GET" && path.hasPrefix("api/chat/native/")','let directionsProjection = path.hasPrefix("api/chat/native/v5/planning/directions/")\n        let guardsTurnProjection = directionsProjection || method == "GET" && path.hasPrefix("api/chat/native/")')
        after=after.replace('let guardsResultProjection = path.hasPrefix("api/results/native/") ||','let guardsResultProjection = directionsProjection || path.hasPrefix("api/results/native/") ||')
        after=after.replace('(path == "api/results/native/v2/decision" ?','(path == "api/results/native/v2/decision" || directionsProjection ?')
    elif path.endswith('NativeAssistantConversationView.swift'):
        marker='    @State private var planningPolicy: AssistantPlanningPolicy?'
        assert after.count(marker)==1
        after=after.replace(marker,'    @State private var directionsPresentation: NativeTravelDirectionsSelection?\n    @State private var directionsIntake = NativeTravelDirectionsIntakeStore()\n'+marker)
        marker='    private var goalHasCurrentMessage: Bool {'
        assert after.count(marker)==1
        addition='''    private var directionsSelection: NativeTravelDirectionsSelection? {
        guard let intake = travelIntakeSelection, let planningPolicy, planningPolicy.valid,
              planningPolicy.consentState == "accepted", let policyID = planningPolicy.policyId,
              !busy, !planningBusy, !tripBusy, pending == nil, planningPending == nil,
              pendingTripMutation == nil, selectedSources.pending == nil else { return nil }
        return .init(scope: intake.scope, conversationID: intake.conversationID, goalID: intake.goalID,
            goalVersion: intake.goalVersion, parentMessageID: intake.parentMessageID, planningPolicyID: policyID)
    }
'''
        after=after.replace(marker,addition+marker)
        marker='                        ForEach(conversation?.messages ?? []) { message in'
        assert after.count(marker)==1
        after=after.replace(marker,'''                        if let target = directionsSelection {
                            Button(chinese ? "查看旅行方向 · 日期可未定" : "Explore travel directions · Dates optional") {
                                directionsPresentation = target
                            }.accessibilityIdentifier("assistant.directions.open")
                        }
'''+marker)
        marker='        .sheet(isPresented: $showTravelIntake) {'
        assert after.count(marker)==1
        after=after.replace(marker,'''        .sheet(item: $directionsPresentation, onDismiss: { Task { await reload() } }) { target in
            NativeTravelDirectionsSheet(selection: target, currentSelection: { directionsSelection },
                originalRequest: conversation?.messages.first(where: { $0.messageId == target.parentMessageID })?.text ?? "",
                session: session, chinese: chinese, store: directionsIntake)
        }
'''+marker)
        marker='            tripLink = nil; ownedTrips = []; pendingTripMutation = nil; privacyLinks = []; privacyNextCursor = nil'
        assert after.count(marker)==1
        after=after.replace(marker,marker+'\n            directionsPresentation = nil; directionsIntake.bind(nil)')
    elif path.endswith('NativeFiveResultModels.swift'):
        after=after.replace('    case practical(Translation)','    case practical(Translation)\n    case directions(NativeTravelDirectionsContent)')
        marker='        if schema=="comparison/1" {'
        assert after.count(marker)==1
        after=after.replace(marker,'        if schema=="travel-directions/1" { return .directions(try NativeTravelDirectionsContent.decode(r)) }\n'+marker)
        after=after.replace('"decision/1","practical/1"]','"decision/1","practical/1","travel-directions/1"]')
    elif path.endswith('NativeFiveResultView.swift'):
        marker='    @State private var choosing:String?'
        assert after.count(marker)==1
        after=after.replace(marker,marker+'''\n    private struct DirectionsEntry: Identifiable { let id = UUID(); let scope: NativeDataScope; let artifactID: String; let revision: Int }
    @State private var directionsEntry: DirectionsEntry?''')
        marker='                    NativeFiveResultCard(record:value,chinese:chinese)'
        assert after.count(marker)==1
        after=after.replace(marker,marker+'''\n                    if case .directions = value.content, let scope = key?.scope {
                        Button(chinese ? "打开旅行方向" : "Open travel directions") {
                            directionsEntry = .init(scope: scope, artifactID: value.artifactID, revision: value.revision)
                        }.accessibilityIdentifier("library.directions.open")
                    }''')
        marker='        .onChange(of:key){_,_ in store.clear();comparison.clear();choosing=nil}.onDisappear{store.clear();comparison.clear();choosing=nil}'
        assert after.count(marker)==1
        after=after.replace(marker,'''        .sheet(item: $directionsEntry) { entry in
            NavigationStack {
                ScrollView {
                    NativeTravelDirectionsResultView(artifactID: entry.artifactID, revision: entry.revision, session: session,
                        chinese: chinese, active: active && session.dataScope == entry.scope).padding()
                }
            }
        }
'''+marker.replace('choosing=nil}', 'choosing=nil;directionsEntry=nil}'))
        marker='            case .practical(let value):'
        assert after.count(marker)==1
        after=after.replace(marker,'''            case .directions(let value):
                Text(value.title).font(.headline); Text(value.summary)
                ForEach(value.directions, id: \\.id) { option in Text(option.title).font(.headline); Text(option.tradeoff) }
                if let draft = value.draft {
                    ForEach(draft.days, id: \\.ordinal) { day in
                        Text(t("第 \\(day.ordinal) 天 · \\(day.destination)", "Day \\(day.ordinal) · \\(day.destination)")).font(.headline)
                        ForEach(Array(day.activities.enumerated()), id: \\.offset) { _, activity in Text(activity) }
                    }
                }
'''+marker)
    else:
        sources=sorted((root/'ios/VisePanda/VisePanda/Features/TravelDirections').glob('*.swift'))
        names=[str(p.relative_to(root/'ios/VisePanda')) for p in sources]+['VisePandaTests/NativeTravelDirectionsTests.swift']
        build=[];refs=[];members=[];test=[];app=[]
        for i,name in enumerate(names,1):
            ref=f'B19710000000000000000{i:04X}';bid=f'B19720000000000000000{i:04X}'
            assert ref not in before and bid not in before
            refs.append(f'\t\t{ref} = {{isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = {name}; sourceTree = SOURCE_ROOT; }};\n')
            build.append(f'\t\t{bid} = {{isa = PBXBuildFile; fileRef = {ref}; }};\n')
            members.append(ref)
            (test if name.startswith('VisePandaTests') else app).append(bid)
        after=after.replace('/* End PBXBuildFile section */',''.join(build)+'/* End PBXBuildFile section */').replace('/* End PBXFileReference section */',''.join(refs)+'/* End PBXFileReference section */')
        # Append references to the existing root group and build IDs to the existing sources phases.
        marker='600000000000000000000001 = {\n\t\t\tisa = PBXGroup;\n\t\t\tchildren = ('
        assert after.count(marker)==1
        after=after.replace(marker,marker+'\n'+''.join('\t\t\t\t'+r+',\n' for r in members))
        marker='800000000000000000000001 /* Sources */ = {\n\t\t\tisa = PBXSourcesBuildPhase;\n\t\t\tbuildActionMask = 2147483647;\n\t\t\tfiles = ('
        assert after.count(marker)==1
        after=after.replace(marker,marker+'\n'+''.join('\t\t\t\t'+r+',\n' for r in app))
        marker='800000000000000000000003 /* Sources */ = {isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; files = ('
        assert after.count(marker)==1
        after=after.replace(marker,marker+', '.join(test)+',')
    assert after!=before
    name=Path(path).name
    (out/(name+'.before')).write_text(before)
    (out/(name+'.after')).write_text(after)
    (out/(name+'.patch')).write_text(''.join(difflib.unified_diff(before.splitlines(True),after.splitlines(True),fromfile='a/'+path,tofile='b/'+path,n=3)))
    def blob(s):return subprocess.check_output(['git','hash-object','--stdin'],input=s.encode()).decode().strip()
    pins.append({'path':path,'before':blob(before),'after':blob(after),'baseWT':str(base),'baseHEAD':subprocess.check_output(['git','-C',str(base),'rev-parse','HEAD']).decode().strip()})
(out/'pins.json').write_text(json.dumps(pins,indent=2)+'\n')
print(json.dumps(pins,indent=2))
