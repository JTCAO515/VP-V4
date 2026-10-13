#!/usr/bin/env python3
"""Execute exact production submission methods and readback tail without a simulator.
Transport/policy/projection fixtures are synthetic; SwiftUI rendering and full reload network orchestration
are not claimed. The actual selected-source models/store and scope/error types are compiled.
"""
from pathlib import Path
import hashlib, json, subprocess, tempfile
ROOT = Path(__file__).resolve().parents[3]
VIEW = ROOT / 'ios/VisePanda/VisePanda/Features/Ask/NativeAssistantConversationView.swift'
ASK = VIEW.parent
source = VIEW.read_text()
def declaration(text, marker):
    start = text.index(marker)
    opening = text.index('{', start)
    depth = 1
    end = opening + 1
    while depth:
        if text[end] == '{': depth += 1
        elif text[end] == '}': depth -= 1
        end += 1
    return text[start:end]
def decl(marker): return declaration(source, marker)
session = (ROOT / 'ios/VisePanda/VisePanda/App/NativeSession.swift').read_text()
parts = ['import Foundation\nimport Observation\n', declaration(session, 'struct NativeDataScope:'),
         declaration(session, 'enum NativeDataError:'), decl('struct AssistantConversationOpsRefusal'),
         decl('struct AssistantConversationRefreshState'),
         decl('struct AssistantConversationSelection').replace('NativeJourneyGoalEntry', 'FixtureGoalEntry'),
         decl('struct AssistantConversation:'), decl('struct AssistantGoal:'), decl('struct AssistantMessage:'),
         decl('private struct AssistantSubmission:'), decl('private struct AssistantAccepted:')]
parts.append('''
struct FixtureGoalEntry { var conversationID: String }
enum NativeTravelIntake { static func text(_ s: String, max: Int) -> Bool { !s.isEmpty && s.utf16.count <= max } }
enum NativeMemoryWire { static func uuid(_ s: String) -> Bool { UUID(uuidString:s) != nil } }
struct NativeResultSource: Decodable { var complete: Bool { false } }
enum NativeQualifiedDelegationRPC { static func digest(_ s:String) -> Bool { false } }
struct FixturePolicy { enum ConsentState { case accepted }; var id=UUID().uuidString; var consentState=ConsentState.accepted }
struct FixtureMemory { var id=UUID().uuidString }
@MainActor final class FixtureSession {
    var dataScope: NativeDataScope?
    var post: ((Data, Bool) async throws -> Data)!
    var posts = [Data]()
    init(_ scope: NativeDataScope) { dataScope=scope }
    func askRequest(path:String,method:String,body:Data) async throws -> Data { posts.append(body); return try await post(body,false) }
    func selectedSourceMessageRequest(_ body:Data) async throws -> Data { posts.append(body); return try await post(body,true) }
    func selectedSourceContextRequest(_ body:Data) async throws -> Data { throw NativeDataError.invalidResponse }
}
''')
parts += [(ASK/'NativeSelectedMessageModels.swift').read_text(), (ASK/'NativeSelectedMessageStore.swift').read_text()]
parts.append('''
@MainActor final class FixtureView {
    let session: FixtureSession
    var boundScope: NativeDataScope?
    var policy: FixturePolicy? = .init()
    var selection = AssistantConversationSelection()
    var conversation: AssistantConversation?
    fileprivate var pending: AssistantSubmission?
    var selectedSources = NativeSelectedMessageStore()
    var selectedMemoryBasis = [FixtureMemory]()
    var qualifiedMemoryBasis = [FixtureMemory]()
    var goal: AssistantGoal? { conversation?.goals.last }
    var operation="independent_question", draft="Synthetic immutable request"
    var chinese=false, busy=false, composerWaitingForAuthority=false
    var notice: String?, planningNotice: String?
    var refreshState=AssistantConversationRefreshState()
    var submissionOpsRefusal=AssistantConversationOpsRefusal()
    var conversations = [String]()
    var history: AssistantConversation?
    var readFailure: Error?
    init(_ scope:NativeDataScope, selected:Bool=false) {
        session=FixtureSession(scope); boundScope=scope; selectedSources.bind(scope)
        let id=UUID().uuidString; selection.select(id)
        conversation=AssistantConversation(version:5,kind:"conversation",conversationId:id,nextSequence:1,messages:[],goals:[])
        if selected { let memory=FixtureMemory(); selectedMemoryBasis=[memory]; qualifiedMemoryBasis=[memory] }
    }
''')
for marker in ['private var opsRefusal:', 'private func ownsSelection(', 'private func send()','private func sendSelectedSources(']:
    parts.append(decl(marker).replace('private ', ''))
reload = decl('private func reload(')
tail = reload[reload.index('            if let pending, read.messages.contains'):reload.index('\n        } catch {\n            guard ownsRefresh')]
catch = declaration(reload, '        } catch {\n            guard ownsRefresh')
catch_body = catch[catch.index('{')+1:-1]
# Exact readback success tail and outer catch; network orchestration/projection are synthetic.
parts.append('''
    func clearConversationContext() { pending=nil;draft="";notice=nil }
    func clearConversationProjection() {}
    func loadPrivacyLinks(_ scope:NativeDataScope) async {}
    func ownsRefresh(_ scope:NativeDataScope,_ generation:UUID,_ token:UUID)->Bool { ownsSelection(scope,generation) }
    func reload(replacing:Bool=false) async {
        guard let initial=session.dataScope, !Task.isCancelled else { return }
        let generation=selection.generation
        guard boundScope==initial else{return}
        let refreshToken=UUID()
        if let error=readFailure {
'''+catch_body+'''
            return
        }
        guard let read=history else{return}
'''+tail+'\n    }\n}\n')
parts.append('''
@MainActor var passed=0
@MainActor func check(_ value:Bool,_ message:String) { precondition(value,message); passed+=1 }
func scope(_ subject:String="actor-a", epoch:Int=1, generation:Int=1, endpoint:String="fixture") -> NativeDataScope {
    .init(endpoint:endpoint,subject:subject,mobileEpoch:epoch,generation:generation)
}
@MainActor func message(_ id:String) -> AssistantMessage {
    .init(messageId:id,sequence:1,locale:"en",text:"Synthetic immutable request",relationship:"independent_question",goalId:nil,scopeVersion:nil,taskId:nil,parentMessageId:nil,turnId:nil,status:"recorded",outcome:nil,output:nil)
}
@MainActor func history(_ id:String?, messages:[AssistantMessage]=[]) -> AssistantConversation {
    .init(version:5,kind:"conversation",conversationId:id,nextSequence:messages.count+1,messages:messages,goals:[])
}
@MainActor func accepted(_ bytes:Data,selected:Bool) throws -> Data {
    let r=try JSONSerialization.jsonObject(with:bytes) as! [String:Any]
    if !selected { return try JSONSerialization.data(withJSONObject:["version":5,"kind":"accepted","conversationId":r["conversationId"]!,"messageId":r["messageId"]!]) }
    return try JSONSerialization.data(withJSONObject:["version":6,"kind":"accepted","conversationId":r["conversationId"]!,"messageId":r["messageId"]!,"sequence":1,"goalId":NSNull(),"scopeVersion":NSNull(),"turnId":r["turnId"]!,"reused":false,"selectedSources":["artifact":NSNull(),"trip":NSNull(),"evidence":[]],"readyForProvider":false])
}
@main struct Run {
    @MainActor static func main() async throws {
        for selected in [false,true] {
            for code in ["OPS_CONTROL_DISABLED","OPS_SCOPE_UNAVAILABLE"] {
                let v=FixtureView(scope(),selected:selected)
                v.session.post={_,_ in throw NativeDataError.server(code:code)}
                v.history=history(v.selection.conversationID)
                await v.send()
                let body=v.session.posts[0]
                let r=try JSONSerialization.jsonObject(with:body) as! [String:Any]
                check(v.notice==code && v.opsRefusal,"actual submit catch/readback must retain exact refusal")
                check(v.pending != nil || v.selectedSources.pending != nil,"unconfirmed immutable request retained")
                check(v.draft=="Synthetic immutable request","unconfirmed draft retained")
                await v.send()
                await v.sendSelectedSources(initial:scope(),policyID:v.policy!.id)
                check(v.session.posts.count==1,"both direct submit entries blocked after refusal")
                v.readFailure=URLError(.timedOut); await v.reload()
                check(v.notice==code && v.opsRefusal,"transient GET cannot downgrade refusal")
                v.readFailure=nil
                v.history=history(v.selection.conversationID,messages:[message(UUID().uuidString)])
                await v.reload()
                check(v.pending != nil || v.selectedSources.pending != nil,"unrelated accepted message cannot clear pending")
                if selected {
                    v.history=history(UUID().uuidString,messages:[message(r["messageId"] as! String)])
                    await v.reload()
                    check(v.selectedSources.pending != nil,"cross-conversation readback cannot clear selected-source pending")
                }
                v.history=history(v.selection.conversationID,messages:[message(r["messageId"] as! String)])
                await v.reload()
                check(v.pending==nil && v.selectedSources.pending==nil && v.draft.isEmpty,"same-operation accepted readback converges")
                check(v.notice==code && v.opsRefusal,"accepted old content cannot grant current Ops eligibility")
                for changed in [scope("actor-b"),scope(epoch:2),scope(generation:2),scope(endpoint:"other")] {
                    v.session.dataScope=changed
                    check(!v.opsRefusal,"old refusal cannot cross actor/epoch/generation/endpoint")
                }
                v.session.dataScope=nil
                check(!v.opsRefusal,"offline scope cannot expose cached refusal")
                v.session.dataScope=scope(); v.selection.select(UUID().uuidString)
                check(!v.opsRefusal,"old refusal cannot cross conversation selection")
            }
            for error in [URLError(.timedOut) as Error,NativeDataError.invalidResponse,NativeDataError.server(code:"SERVICE_TASK_CONFLICT"),NativeDataError.server(code:"OPS_CONTROL_DISABLED suffix")] {
                let v=FixtureView(scope(),selected:selected)
                v.session.post={_,_ in throw error}; await v.send()
                check(v.notice=="retry" && !v.opsRefusal,"ordinary transport/contract failure remains retry/unknown")
                let first=v.session.posts[0]; await v.send()
                check(v.session.posts.count==2 && (try! JSONSerialization.jsonObject(with:v.session.posts[1]) as! NSDictionary)==(try! JSONSerialization.jsonObject(with:first) as! NSDictionary),"ordinary explicit retry keeps immutable request identity/body")
            }
            let success=FixtureView(scope(),selected:selected)
            success.session.post={ bytes,s in try accepted(bytes,selected:s) }
            await success.send()
            check(!success.opsRefusal && success.notice==nil,"normal accepted response remains available")
            for mutation in ["actor","epoch","selection","cancel","sources"] {
                if mutation=="sources" && !selected {continue}
                let v=FixtureView(scope(),selected:selected)
                var continuation:CheckedContinuation<Void,Never>?
                v.session.post={ _,_ in await withCheckedContinuation{continuation=$0}; throw NativeDataError.server(code:"OPS_CONTROL_DISABLED") }
                let task=Task{await v.send()}
                while continuation==nil {await Task.yield()}
                switch mutation {
                case "actor":v.session.dataScope=scope("actor-b")
                case "epoch":v.session.dataScope=scope(epoch:2)
                case "selection":v.selection.select(UUID().uuidString)
                case "sources":v.selectedSources.clear()
                default:task.cancel()
                }
                continuation!.resume();await task.value
                check(!v.opsRefusal && v.notice==nil,"late/cancelled refusal must not mutate current display")
                check(!v.busy,"submission releases own busy state")
                if mutation=="cancel" {
                    check(v.pending != nil || v.selectedSources.pending != nil,"cancellation must retain unconfirmed pending")
                    check(v.draft=="Synthetic immutable request" && v.session.posts.count==1,"cancellation does not clear draft or repost")
                }
            }
        }
        print("PASS \\(passed) runtime assertions; exact submit methods + readback tail/catch + actual selected-source store/models; no simulator/device/provider")
    }
}
''')
fixture='\n'.join(parts)
with tempfile.TemporaryDirectory(prefix='v10-native-refusal-') as temp:
    path=Path(temp)/'Behavior.swift'; path.write_text(fixture)
    compile_run=subprocess.run(['swiftc','-parse-as-library',str(path),'-o',str(Path(temp)/'behavior')],capture_output=True,text=True)
    print(compile_run.stdout+compile_run.stderr,end=''); compile_run.check_returncode()
    run=subprocess.run([str(Path(temp)/'behavior')],capture_output=True,text=True)
    print(run.stdout+run.stderr,end=''); run.check_returncode()
print(json.dumps({'sourceSHA256':hashlib.sha256(source.encode()).hexdigest(), 'fixtureSHA256':hashlib.sha256(fixture.encode()).hexdigest()}))
