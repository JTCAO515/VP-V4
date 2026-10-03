import { isUuid } from "../identity/request-guards.ts";
import { KNOWLEDGE_CITIES } from "../knowledge/publication/statement.ts";
import { record, timestamp, type Answer } from "./contract.ts";
import { READINESS_SCENARIOS, type ReadinessScenario } from "./actions-contract.ts";
export type ReadinessTaskBasis={taskId:string;taskTurnId:string;conversationId:string;goalId:string;goalVersion:number;tripId:string;tripVersion:number;dateBasis:string;taskBasisDigest:string};
export type ReadinessDeclaration={scenario:ReadinessScenario;city:string;locale:"zh"|"en";subjectId:string|null;applies:Answer;resourcesReady:Answer;conditionsChecked:Answer;checkAt:string};
export type ReadinessDeclarationRead={kind:"readiness_declarations";basis:ReadinessTaskBasis;revision:number;declarations:ReadinessDeclaration[];declarationBasis:"explicit_user_report"};
export const exact=(v:Record<string,unknown>,keys:readonly string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export const hash=(v:unknown):v is string=>typeof v==="string"&&/^[0-9a-f]{64}$/.test(v);
const integer=(v:unknown,min=0)=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=min;
export function parseReadinessDeclaration(v:unknown):ReadinessDeclaration|null {
 if(!record(v)||!exact(v,["scenario","city","locale","subjectId","applies","resourcesReady","conditionsChecked","checkAt"])
  ||typeof v.scenario!=="string"||!(READINESS_SCENARIOS as readonly string[]).includes(v.scenario)
  ||typeof v.city!=="string"||!(KNOWLEDGE_CITIES as readonly string[]).includes(v.city)||!["zh","en"].includes(v.locale as string)
  ||!(v.subjectId===null||typeof v.subjectId==="string"&&/^[a-z][a-z0-9_-]{0,127}$/.test(v.subjectId))
  ||![v.applies,v.resourcesReady,v.conditionsChecked].every(a=>a==="unknown"||a==="yes"||a==="no")
  ||!(v.checkAt==="now"||v.checkAt==="unknown"||timestamp(v.checkAt)!==null))return null;
 return v as ReadinessDeclaration;
}
export function parseReadinessTaskBasis(v:unknown):ReadinessTaskBasis|null{
 if(!record(v)||!exact(v,["taskId","taskTurnId","conversationId","goalId","goalVersion","tripId","tripVersion","dateBasis","taskBasisDigest"])
  ||![v.taskId,v.taskTurnId,v.conversationId,v.goalId,v.tripId].every(id=>typeof id==="string"&&isUuid(id))
  ||!integer(v.goalVersion,1)||!integer(v.tripVersion)||!hash(v.dateBasis)||!hash(v.taskBasisDigest))return null;
 return v as ReadinessTaskBasis;
}
export function parseReadinessDeclarationRead(v:unknown):ReadinessDeclarationRead|null{
 if(!record(v)||!exact(v,["kind","basis","revision","declarations","declarationBasis"])||v.kind!=="readiness_declarations"
  ||!parseReadinessTaskBasis(v.basis)||!integer(v.revision)||v.declarationBasis!=="explicit_user_report"
  ||!Array.isArray(v.declarations)||v.declarations.length>5||v.declarations.some(d=>!parseReadinessDeclaration(d))
  ||new Set(v.declarations.map(d=>d.scenario)).size!==v.declarations.length)return null;
 return v as ReadinessDeclarationRead;
}
