import { createHash } from "node:crypto";
import { questionDefinition, QUESTION_ONTOLOGY_VERSION } from "../knowledge/claim/questions.ts";
import { resolveOntologyRelation } from "../knowledge/provenance/ontology.ts";
import { record,timestamp } from "./contract.ts";
import {readinessQuestion,READINESS_ACTION_RULE_VERSION,readinessActionId,type ReadinessAction,type ReadinessActionBasis} from "./actions-contract.ts";
import type {ReadinessDeclarationRead,ReadinessDeclaration} from "./declarations-contract.ts";
import type {ReadinessAssessment} from "./assessment-contract.ts";
import type {ReadinessEvidence} from "./index.ts";

const uuid=(v:unknown):v is string=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const text=(v:unknown,max:number):v is string=>typeof v==="string"&&v.trim().length>0&&v.length<=max;
const strings=(v:unknown,max=16):v is string[]=>Array.isArray(v)&&v.length<=max&&v.every(t=>text(t,240));
const positive=(v:unknown):v is number=>typeof v==="number"&&Number.isSafeInteger(v)&&v>0;
const digest=(v:unknown)=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
function source(v:unknown):v is ReadinessEvidence["sources"][number]{
 if(!record(v)||!uuid(v.sourceRevisionId)||!text(v.publisher,160)||!text(v.locator,240)||!text(v.uri,2000))return false;
 try{const u=new URL(v.uri);return ["https:","http:"].includes(u.protocol)&&!!u.hostname&&!u.username&&!u.password;}catch{return false;}
}
/** SQL owns rights/publication eligibility; this boundary additionally binds exact
 * question, ontology relation, scope, receipt revision and short current lifetime. */
function qualifiedEvidence(raw:unknown,declaration:ReadinessDeclaration,now:number):ReadinessEvidence[]{
 const question=readinessQuestion(declaration.scenario,declaration.subjectId);
 const definition=question&&questionDefinition(question.questionId,question.subjectId);
 const scene=declaration.scenario==="admission"?"attraction":definition?.scene;
 if(!scene||!record(raw)||raw.schemaVersion!==(declaration.scenario==="admission"?"knowledge-read/1":"knowledge-answer/1")||raw.purpose!=="trip_planning"||raw.recipient!=="first_party"||raw.territory!=="CN-mainland"||raw.status!=="available"
  ||!record(raw.scope)||raw.scope.city!==declaration.city||raw.scope.locale!==declaration.locale||raw.scope.scene!==scene
  ||timestamp(raw.evaluatedAt)===null||timestamp(raw.evaluatedAt)!>now||now-timestamp(raw.evaluatedAt)!>=30000
  ||!Array.isArray(raw.statements)||raw.statements.length>50)return [];
 if(declaration.scenario!=="admission"&&(!record(raw.answer)||raw.answer.questionId!==question?.questionId||raw.answer.questionVersion!==1
  ||raw.answer.outcome!=="answered"||!Array.isArray(raw.answer.claims)||raw.answer.claims.length!==definition?.claims.length))return [];
 const rawRows=raw.statements;
 const rows:ReadinessEvidence[]=[];
 for(const entry of raw.statements){
  if(!record(entry)||!record(entry.assertion)||!uuid(entry.factId)||!uuid(entry.assertionId)||!positive(entry.version)||!positive(entry.assertionRevision)
   ||!text(entry.text,1000)||!strings(entry.conditions)||!strings(entry.exclusions)||!Array.isArray(entry.sources)||entry.sources.length<1||entry.sources.length>3
   ||!entry.sources.every(source)||new Set(entry.sources.map(s=>s.sourceRevisionId)).size!==entry.sources.length)continue;
  const assertion=entry.assertion,relation=typeof assertion.predicate==="string"&&resolveOntologyRelation(assertion.predicate);
  const expected=declaration.scenario==="admission"?assertion.subjectId===declaration.subjectId&&assertion.predicate==="permits_admission"
   :definition?.claims.some(claim=>assertion.subjectId===claim.subjectId&&assertion.predicate===claim.predicate&&assertion.objectId===claim.objectId);
  if(!relation||!expected||!strings(assertion.conditions)||!strings(assertion.exclusions)
   ||entry.conditions.length!==assertion.conditions.length||entry.exclusions.length!==assertion.exclusions.length)continue;
  const reviewed=timestamp(entry.reviewedAt),published=timestamp(entry.publishedAt),expires=timestamp(entry.expiresAt);
  if(reviewed===null||published===null||expires===null||reviewed>published||published>timestamp(raw.evaluatedAt)!||expires<=now)continue;
  if(declaration.scenario!=="admission"){
   const coverage=(raw.answer as Record<string,unknown>).claims as unknown[];
   if(!coverage.some(c=>record(c)&&c.id===assertion.objectId&&c.status==="covered"&&Array.isArray(c.reasons)&&c.reasons.length===0
     &&Array.isArray(c.factIds)&&c.factIds.includes(entry.factId)))continue;
  }
  rows.push({factId:entry.factId,publicationVersion:entry.version,assertionId:entry.assertionId,assertionRevision:entry.assertionRevision,
    text:entry.text,conditions:entry.conditions,exclusions:entry.exclusions,sources:entry.sources,expiresAt:entry.expiresAt as string});
 }
 if(new Set(rows.map(r=>r.factId)).size!==rows.length)return [];
 if(declaration.scenario!=="admission"&&definition){
  const answer=raw.answer as Record<string,unknown>,claims=answer.claims as Record<string,unknown>[];
  if(definition.claims.some(required=>!claims.some(c=>c.id===required.objectId&&c.status==="covered"&&Array.isArray(c.factIds)
    &&c.factIds.some(id=>rows.some(r=>r.factId===id)&&rawRows.some(s=>record(s)&&s.factId===id&&record(s.assertion)
      &&s.assertion.subjectId===required.subjectId&&s.assertion.predicate===required.predicate&&s.assertion.objectId===required.objectId)))))return [];
  if(claims.some(c=>c.status!=="covered"||!Array.isArray(c.factIds)||c.factIds.length===0||c.factIds.some(id=>!rows.some(r=>r.factId===id))))return [];
 }
 return rows;
}
export function assessPreparation(
 saved:ReadinessDeclarationRead,selection:Pick<ReadinessDeclaration,"scenario"|"city"|"locale"|"subjectId">,knowledge:unknown,now:Date,
 proposal?:{proposalId:string;proposalRevision:number;proposalDigest:string},
):ReadinessAssessment {
 const declaration=saved.declarations.find(d=>d.scenario===selection.scenario&&d.city===selection.city&&d.locale===selection.locale&&d.subjectId===selection.subjectId)
  ??{...selection,applies:"unknown" as const,resourcesReady:"unknown" as const,conditionsChecked:"unknown" as const,checkAt:"unknown"};
 const evidence=qualifiedEvidence(knowledge,declaration,now.getTime()),available=evidence.length>0;
 const userReadiness=declaration.applies==="no"?"not_applicable":!available||declaration.applies==="unknown"?"unknown"
  :declaration.resourcesReady==="no"||declaration.conditionsChecked==="no"?"not_satisfied"
  :declaration.resourcesReady==="yes"&&declaration.conditionsChecked==="yes"?"satisfied":"unknown";
 const actionTiming=userReadiness==="not_applicable"?"not_applicable":declaration.checkAt==="unknown"?"unknown"
  :declaration.checkAt!=="now"&&timestamp(declaration.checkAt)!>now.getTime()?"not_yet":"now";
 const evidenceDigest=digest(evidence),ontologyVersion=QUESTION_ONTOLOGY_VERSION+"/readiness-relations-1";
 const basis:ReadinessActionBasis={...saved.basis,declarationRevision:saved.revision,ruleVersion:READINESS_ACTION_RULE_VERSION,ontologyVersion,evidenceDigest};
 const actions:ReadinessAction[]=[];
 if(userReadiness!=="not_applicable"&&userReadiness!=="satisfied"){
  const fact=evidence[0],receipt=fact?.sources[0];
  const payload={target:available?"declaration" as const:"sources" as const,factId:fact?.factId??null,publicationVersion:fact?.publicationVersion??null,sourceRevisionId:receipt?.sourceRevisionId??null};
  actions.push({kind:"verify_entry",actionId:readinessActionId(basis,payload),basis,...payload});
  if(fact&&receipt)actions.push({kind:"read_material",actionId:readinessActionId(basis,{kind:"read_material",factId:fact.factId,sourceRevisionId:receipt.sourceRevisionId}),basis,factId:fact.factId,publicationVersion:fact.publicationVersion,sourceRevisionId:receipt.sourceRevisionId});
  if(fact&&declaration.subjectId&&["address","admission"].includes(declaration.scenario)){
   const payload={subjectId:declaration.subjectId,factId:fact.factId,publicationVersion:fact.publicationVersion};
   actions.push({kind:"conditional_candidate",actionId:readinessActionId(basis,{kind:"conditional_candidate",...payload}),basis,...payload});
  }
  if(proposal)actions.push({kind:"trip_proposal",actionId:readinessActionId(basis,{kind:"trip_proposal",...proposal}),basis,...proposal});
 }
 return {schemaVersion:"readiness/2",basis:saved.basis,scenario:declaration.scenario,ruleVersion:READINESS_ACTION_RULE_VERSION,ontologyVersion,
  declarationRevision:saved.revision,assessmentDigest:digest([basis,declaration,actions]),evaluatedAt:now.toISOString(),
  expiresAt:new Date(Math.min(now.getTime()+30000,...evidence.map(e=>Date.parse(e.expiresAt)),...(record(knowledge)&&timestamp(knowledge.evaluatedAt)!==null&&now.getTime()-timestamp(knowledge.evaluatedAt)!<30000&&timestamp(knowledge.evaluatedAt)!<=now.getTime()?[timestamp(knowledge.evaluatedAt)!+30000]:[]))).toISOString(),
  knowledgeAvailability:available?"available":"unknown",userReadiness,actionTiming,declaration,declarationBasis:"explicit_user_report",declarationState:saved.state,evidence,actions};
}
