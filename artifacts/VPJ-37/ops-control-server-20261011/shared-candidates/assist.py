import scoped as s
import generate as g
import json
candidate=g.candidate;W1=g.W1;NATIVE=g.NATIVE
candidate('lib/server/knowledge/wiki/grounded-ai-assist.ts',[
 ('import { isPlaceQuestionId, reviewedQuestionId }','import {isDeepStrictEqual} from "node:util";\nimport {decodeOpsRefusal,opsRefusalCode,OpsControlRefusal} from "../../observability/ops-control/refusal.ts";\nimport { isPlaceQuestionId, reviewedQuestionId }'),
 ('  if (raw.error) return { kind: "not_offered", reason: "context_unavailable" };','  const initialDenied=decodeOpsRefusal(raw.data)??opsRefusalCode(raw.error?.message);\n  if(initialDenied)return {kind:"unavailable",reason:initialDenied==="OPS_CONTROL_DISABLED"?"ops_control_disabled":"ops_scope_unavailable"};\n  if (raw.error) return { kind: "not_offered", reason: "context_unavailable" };'),
 ('  const context = parseContext(raw.data);','  const context = parseContext(raw.data,input.turnId);'),
 ('function parseContext(value: unknown): Context | \"unauthorized\" | \"not_blocked\" | null {','function parseContext(value: unknown,expectedTurnId:string): Context | \"unauthorized\" | \"not_blocked\" | null {'),
 ('  if (value.kind !== \"context\") return null;','  if (value.kind !== \"context\") return null;\n  const keys=[\"kind\",\"turnId\",\"city\",\"locale\",\"intent\",\"inputText\",\"placeName\"];\n  if(Object.keys(value).length!==keys.length||!keys.every(k=>Object.hasOwn(value,k))||value.turnId!==expectedTurnId)return null;'),
 ('    dependencies, signal,\n  );','''    {...dependencies,recordDestination:async(destination,requestSignal)=>{
      if(destination.phase==="configured"){
        const fresh=await dependencies.contextRpc("read_grounded_ai_assist_context_v1",{p_turn_id:input.turnId});
        const denied=decodeOpsRefusal(fresh.data)??opsRefusalCode(fresh.error?.message);if(denied)throw new OpsControlRefusal(denied);
        if(fresh.error||!isDeepStrictEqual(raw.data,fresh.data))throw Error("DATA_POLICY_BLOCKED");
        // Main source ruling: this legacy C2 path has no proved durable scope,
        // current job-claim/source/config/budget binding. Context reads alone
        // never authorize another charged call; no new ledger or fake profile.
        throw new OpsControlRefusal("OPS_SCOPE_UNAVAILABLE");
      }
      await dependencies.recordDestination(destination,requestSignal);
    }}, signal,
  );''')],W1)
candidate('lib/server/knowledge/wiki/grounded-search.ts',[
 ('import { questionDefinition, isPlaceQuestionId }','import {opsRefusalCode} from "../../observability/ops-control/refusal.ts";\nimport { questionDefinition, isPlaceQuestionId }'),
 (' | "policy_denied" | "provider_failure";', ' | "policy_denied" | "provider_failure" | "ops_control_disabled" | "ops_scope_unavailable";'),
 ('    case "failed":\n      return { kind: "unavailable", reason: "provider_failure", providerCode: outcome.errorCode };','    case "failed":\n      if(opsRefusalCode(outcome.errorCode))return {kind:"unavailable",reason:outcome.errorCode==="OPS_CONTROL_DISABLED"?"ops_control_disabled":"ops_scope_unavailable"};\n      return { kind: "unavailable", reason: "provider_failure", providerCode: outcome.errorCode };')],W1)
candidate('lib/server/knowledge/wiki/grounded-ai-assist-job.ts',[
 ('import { runGroundedAiAssist,', 'import {decodeOpsRefusal,opsRefusalCode} from "../../observability/ops-control/refusal.ts";\nimport { runGroundedAiAssist,'),
 ('  | Readonly<{ status: "not_offered"; reason: "unauthorized" | "not_blocked" | "job_unavailable" }>','  | Readonly<{ status: "not_offered"; reason: "unauthorized" | "not_blocked" | "job_unavailable" | "ops_control_disabled" | "ops_scope_unavailable" }>'),
 ('  if (ensure.error) return { status: "not_offered", reason: "job_unavailable" };','  const denied=decodeOpsRefusal(ensure.data)??opsRefusalCode(ensure.error?.message);\n  if(denied)return {status:"not_offered",reason:denied==="OPS_CONTROL_DISABLED"?"ops_control_disabled":"ops_scope_unavailable"};\n  if (ensure.error) return { status: "not_offered", reason: "job_unavailable" };')],W1)
candidate('components/chat/SavedAnswers.tsx',[
 ('import { useEffect, useRef, useState }','import Link from "next/link";\nimport { useEffect, useRef, useState }'),
 ('  if (result.status === "not_offered") return <p>{language.aiAssistNotOffered}</p>;','''  const opsReason=result.status==="not_offered"?result.reason:result.status==="succeeded"&&result.outcome.kind==="unavailable"?result.outcome.reason:null;
  if(opsReason==="ops_control_disabled"||opsReason==="ops_scope_unavailable")return <aside role="status"><p>{locale==="zh"?"此能力暂时停用，或当前城市范围无法核实。已有行程和成果保留；不会自动重发已发送请求。":"This capability is paused or its current city scope cannot be qualified. Existing Trips and results are retained; sent requests are not retried automatically."}</p><Link href="/visepanda/trips">{locale==="zh"?"查看已有行程并手工调整":"Open existing Trips to edit manually"}</Link></aside>;
  if (result.status === "not_offered") return <p>{language.aiAssistNotOffered}</p>;''')],W1)
candidate('ios/VisePanda/VisePanda/Features/Ask/NativeAskModels.swift',[
 ('["unauthorized", "not_blocked", "job_unavailable"].contains(reason ?? "")','["unauthorized", "not_blocked", "job_unavailable", "ops_control_disabled", "ops_scope_unavailable"].contains(reason ?? "")'),
 ('["missing_content", "retrieval_miss", "user_input_missing", "capability_unsupported", "policy_denied", "provider_failure"].contains(outcome.reason ?? "")','["missing_content", "retrieval_miss", "user_input_missing", "capability_unsupported", "policy_denied", "provider_failure", "ops_control_disabled", "ops_scope_unavailable"].contains(outcome.reason ?? "")')],NATIVE)
# Amend the existing whole NativeAskView candidate with a separate AI-assist closed branch.
e=next(e for e in g.entries if e['path']=='ios/VisePanda/VisePanda/Features/Ask/NativeAskView.swift');target=g.OUT/'sources'/e['path'];after=__import__('pathlib').Path(str(target)+'.after.txt').read_text();before=(g.ROOT/e['path']).read_text()
old='''    @ViewBuilder private func aiAssistPanel(_ turn: NativeTextTurn, chinese: Bool) -> some View {
        switch store.aiAssist[turn.id] {'''
new='''    @ViewBuilder private func aiAssistPanel(_ turn: NativeTextTurn, chinese: Bool) -> some View {
        if case .done(let status)=store.aiAssist[turn.id], ["ops_control_disabled","ops_scope_unavailable"].contains(status.reason ?? status.outcome?.reason ?? "") {
            Text(chinese ? "此能力暂时停用，或当前城市范围无法核实。已有成果保留，不自动重发。" : "This capability is paused or the current city scope cannot be qualified. Saved results are retained; no automatic retry.")
                .accessibilityIdentifier("grounded.ai-assist.ops-refusal")
            NavigationLink(destination: NativeJourneysView()) {Text(chinese ? "查看已有行程与成果" : "Open existing Trips and results")}
        } else {
        switch store.aiAssist[turn.id] {'''
assert after.count(old)==1;after=after.replace(old,new,1)
# Close only the aiAssistPanel else block, before the next private declaration.
start=after.index(new);end=after.index('\n    @ViewBuilder private func aiAssistResult',start+len(new))
segment=after[start:end];last=segment.rfind('\n    }');assert last>=0
segment=segment[:last]+'\n        }'+segment[last:];after=after[:start]+segment+after[end:]
__import__('pathlib').Path(str(target)+'.after.txt').write_text(after);__import__('pathlib').Path(str(target)+'.patch').write_text(''.join(__import__('difflib').unified_diff(before.splitlines(True),after.splitlines(True),fromfile='a/'+e['path'],tofile='b/'+e['path'],n=0)))
e['afterSha256']=g.sha(after)
for entry in g.entries:
 if entry['path'].endswith('NativeAssistantConversationView.swift'):
  entry['leaseEligibility']='HOLD exact currentholder/Main release required; PR678 merged, regenerated on before9103ee2e7700daf3b31678a0b992e283f250c7bac865327cbb1218231f8e3dcf'
(g.OUT/'pins.json').write_text(json.dumps({'base':g.BASE,'privateHead':g.PRIVATE_HEAD,'applied':False,'files':g.entries},indent=2)+'\n')
print(f'{len(g.entries)} candidates written; no shared apply')
