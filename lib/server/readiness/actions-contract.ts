import type { ReadinessTaskBasis } from "./declarations-contract.ts";
import { createHash } from "node:crypto";
import { questionDefinition, type ReviewedQuestionId } from "../knowledge/claim/questions.ts";
import { resolveOntologyRelation } from "../knowledge/provenance/ontology.ts";

/** Existing question/ontology producers only. Admission is a separate obligation:
 * an opening window never asserts booking availability or admission eligibility. */
export const READINESS_ACTION_RULE_VERSION = "readiness-actions/1";
export const READINESS_SCENARIOS = ["connectivity","payment","admission","address","transport"] as const;
export type ReadinessScenario = typeof READINESS_SCENARIOS[number];
export type ReadinessActionBasis = ReadinessTaskBasis & {
  declarationRevision:number; ruleVersion:string; ontologyVersion:string; evidenceDigest:string;
};
export type ReadinessAction =
  | {kind:"read_material"; actionId:string; basis:ReadinessActionBasis; factId:string; publicationVersion:number; sourceRevisionId:string}
  | {kind:"verify_entry"; actionId:string; basis:ReadinessActionBasis; target:"declaration"|"sources"; factId:string|null; publicationVersion:number|null; sourceRevisionId:string|null}
  | {kind:"conditional_candidate"; actionId:string; basis:ReadinessActionBasis; subjectId:string; factId:string; publicationVersion:number}
  | {kind:"trip_proposal"; actionId:string; basis:ReadinessActionBasis; proposalId:string; proposalRevision:number; proposalDigest:string};
export function readinessActionId(basis:ReadinessActionBasis,payload:Record<string,unknown>):string {
  return createHash("sha256").update(JSON.stringify([basis,payload])).digest("hex");
}
export function readinessQuestion(scenario:ReadinessScenario,subjectId:string|null):{questionId:ReviewedQuestionId;subjectId:string|null}|null {
  if(scenario==="connectivity")return {questionId:"connectivity_getting_started",subjectId:null};
  if(scenario==="payment")return {questionId:"payment_getting_started",subjectId:null};
  if(scenario==="transport")return {questionId:"rail_boarding_documents",subjectId:null};
  if(scenario==="admission"||!subjectId)return null;
  return {questionId:"place_address",subjectId};
}
export function readinessRelations(scenario:ReadinessScenario,subjectId:string|null) {
  if(scenario==="admission")return subjectId?[{subjectId,...resolveOntologyRelation("permits_admission")}]:[];
  const question=readinessQuestion(scenario,subjectId);
  const definition=question && questionDefinition(question.questionId,question.subjectId);
  return definition?.claims.map(claim=>({claim,...resolveOntologyRelation(claim.predicate)}))??[];
}
