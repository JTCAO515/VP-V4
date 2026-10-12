import generate as g
import json
candidate=g.candidate;W1=g.W1;NATIVE=g.NATIVE
candidate('lib/server/model-gateway/adapters/provider-protocol.ts',[
 ('import { WIKI_STATEMENT_PROPOSALS_PROMPT }','import {decodeOpsRefusal,opsRefusalCode,OpsControlRefusal} from "../../observability/ops-control/refusal.ts";\nimport { WIKI_STATEMENT_PROPOSALS_PROMPT }'),
 ('      p_provider: binding.provider, p_context_digest: digest });\n    return record(decision)', '      p_provider: binding.provider, p_context_digest: digest });\n    const refusal=decodeOpsRefusal(decision);if(refusal)throw new OpsControlRefusal(refusal);\n    return record(decision)'),
 ('...(taskMode ? { p_context_digest: raw.contextDigest as string } : {}) });\n    return record(decision)', '...(taskMode ? { p_context_digest: raw.contextDigest as string } : {}) });\n    const refusal=decodeOpsRefusal(decision);if(refusal)throw new OpsControlRefusal(refusal);\n    return record(decision)'),
 ('    return record(decision) && decision.kind === \"authorized\";', '    return record(decision) && Object.keys(decision).length===1 && decision.kind === \"authorized\";',2),
 ('      } catch {\n        return controller.signal.aborted','      } catch (error) {\n        const refusal=opsRefusalCode(error);if(refusal)return unavailable(refusal);\n        return controller.signal.aborted')],W1)
candidate('lib/server/turn/text-worker.ts',[
 ('import { textTurnFailureCopy, type Locale }','import {decodeOpsRefusal,opsRefusalCode,opsRefusalCopy,type OpsRefusalCode} from "../observability/ops-control/refusal.ts";\nimport { textTurnFailureCopy, type Locale }'),
 ('    const result = await runWithDurableBudget(attempt, budgetRpc, async budgetSignal => {','''    let refusal:OpsRefusalCode|null=null;
    const guardedBudget:BudgetRpc=async(name,params)=>{const value=await budgetRpc(name,params);const denied=decodeOpsRefusal(value);if(denied)refusal=denied;return value;};
    const persistRefusal=async()=>{
      const persisted=await textRpc(grounded?"complete_grounded_work":"complete_text_work",{...keys,...(grounded?{p_intent:"blocked",p_request_scope:"unknown"}:{p_kind:"blocked",p_text:opsRefusalCopy(String(input.locale))})});
      if(!record(persisted)||persisted.kind!=="finished")throw Error("Operational denial acknowledgment unknown");
      return "persisted" as const;
    };
    const result = await runWithDurableBudget(attempt, guardedBudget, async budgetSignal => {'''),
 ('    if (result.kind !== "completed") return "provider_failure";\n    const output = result.value;','    if (result.kind !== "completed") return refusal?await persistRefusal():"provider_failure";\n    const output = result.value;\n    if(output.kind==="unavailable"&&opsRefusalCode(output.code))return await persistRefusal();')],W1)
candidate('ios/VisePanda/VisePanda/Features/Ask/NativeAssistantConversationView.swift',[
 ('    @State private var notice: String?','''    private var opsRefusal: Bool { [notice, planningNotice].contains { $0 == "OPS_CONTROL_DISABLED" || $0 == "OPS_SCOPE_UNAVAILABLE" } }
    @State private var notice: String?'''),
 ('                if notice != nil && privacyLinks.isEmpty {\n                    Text(chinese ? "请求未确认，请重试或刷新。" : "Request not confirmed. Retry or refresh.").font(.footnote).accessibilityIdentifier("assistant.notice")\n                }','''                if opsRefusal {
                    Text(chinese ? "此能力暂时停用，或当前城市范围无法核实。已有行程和成果保留；请查看原行程，按原确认流程手工调整。" : "This capability is paused or the current city scope cannot be qualified. Existing Trips and results are retained; edit through the original confirmation flow.")
                        .font(.footnote).accessibilityIdentifier("assistant.ops-refusal")
                    NavigationLink(destination: NativeJourneysView()) {
                        Text(chinese ? "查看已有行程与成果" : "Open existing Trips and results")
                    }.accessibilityIdentifier("assistant.ops-alternative")
                } else if notice != nil && privacyLinks.isEmpty {
                    Text(chinese ? "请求未确认，请重试或刷新。" : "Request not confirmed. Retry or refresh.").font(.footnote).accessibilityIdentifier("assistant.notice")
                }'''),
 ('            conversations = []; notice = "retry"\n            if authorityLost { await loadPrivacyLinks(initial) }','            conversations = []; notice = "retry"\n            if case NativeDataError.server(let code)=error,["OPS_CONTROL_DISABLED","OPS_SCOPE_UNAVAILABLE"].contains(code){notice=code}\n            if authorityLost { await loadPrivacyLinks(initial) }'),
 ('                planningNotice = "retry"\n            }\n        }\n        planningBusy = false','                planningNotice = "retry"\n                if case NativeDataError.server(let code)=error,["OPS_CONTROL_DISABLED","OPS_SCOPE_UNAVAILABLE"].contains(code){planningNotice=code}\n            }\n        }\n        planningBusy = false'),
 ('                        .disabled(planningBusy || (planningPending == nil','                        .disabled(opsRefusal || planningBusy || (planningPending == nil'),
 ('                            .disabled(busy || !composerScopeCurrent','                            .disabled(opsRefusal || busy || !composerScopeCurrent'),
 ('            if planningNotice != nil {\n                Text(chinese ? "委托尚未确认；请重试同一次请求或刷新。" : "Delegation is unconfirmed. Retry the same request or refresh.")','            if planningNotice != nil && !opsRefusal {\n                Text(chinese ? "委托尚未确认；请重试同一次请求或刷新。" : "Delegation is unconfirmed. Retry the same request or refresh.")')],NATIVE)
(g.OUT/'pins.json').write_text(json.dumps({'base':g.BASE,'privateHead':g.PRIVATE_HEAD,'applied':False,'files':g.entries},indent=2)+'\n')
print(f'{len(g.entries)} candidates written; no shared apply')
