import { isUuid } from "../identity/request-guards.ts";
import { record } from "./contract.ts";
import {exact,hash,parseReadinessDeclaration,parseReadinessTaskBasis,type ReadinessTaskBasis,type ReadinessDeclaration} from "./declarations-contract.ts";
type Common={schemaVersion:"readiness-request/2";taskId:string;expectedTripVersion:number;scenario:ReadinessDeclaration["scenario"];city:string;locale:"zh"|"en";subjectId:string|null};
export type ReadinessActionsInput=Common&(
 {operation:"read"}|
 {operation:"save";operationId:string;expectedRevision:number;expectedBasis:ReadinessTaskBasis;declaration:ReadinessDeclaration}|
 {operation:"execute";actionId:string;assessmentDigest:string;expectedRevision:number;expectedBasis:ReadinessTaskBasis});
export function parseReadinessActionsInput(v:unknown):ReadinessActionsInput|null {
 if(!record(v)||v.schemaVersion!=="readiness-request/2"||!["read","save","execute"].includes(v.operation as string))return null;
 const common=["schemaVersion","operation","taskId","expectedTripVersion","scenario","city","locale","subjectId"];
 const more=v.operation==="read"?[]:v.operation==="save"?["operationId","expectedRevision","expectedBasis","declaration"]:["actionId","assessmentDigest","expectedRevision","expectedBasis"];
 if(!exact(v,[...common,...more])||typeof v.taskId!=="string"||!isUuid(v.taskId)||!Number.isSafeInteger(v.expectedTripVersion)||Number(v.expectedTripVersion)<0
  ||!parseReadinessDeclaration({scenario:v.scenario,city:v.city,locale:v.locale,subjectId:v.subjectId,applies:"unknown",resourcesReady:"unknown",conditionsChecked:"unknown",checkAt:"unknown"}))return null;
 if(v.operation!=="read"&&(!Number.isSafeInteger(v.expectedRevision)||Number(v.expectedRevision)<0||!parseReadinessTaskBasis(v.expectedBasis)))return null;
 if(v.operation==="save"&&(!isUuid(v.operationId as string)||!parseReadinessDeclaration(v.declaration)
  ||["scenario","city","locale","subjectId"].some(k=>(v.declaration as Record<string,unknown>)[k]!==v[k])))return null;
 if(v.operation==="execute"&&(!hash(v.actionId)||!hash(v.assessmentDigest)))return null;
 return v as ReadinessActionsInput;
}
