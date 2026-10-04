import type { ReadinessEvidence } from "./index.ts";
import type { ReadinessAction } from "./actions-contract.ts";
import type { ReadinessDeclaration,ReadinessTaskBasis } from "./declarations-contract.ts";
export type ReadinessAssessment={
 schemaVersion:"readiness/2";basis:ReadinessTaskBasis;scenario:ReadinessDeclaration["scenario"];
 ruleVersion:string;ontologyVersion:string;declarationRevision:number;assessmentDigest:string;evaluatedAt:string;expiresAt:string;
 knowledgeAvailability:"available"|"unknown";userReadiness:"unknown"|"satisfied"|"not_satisfied"|"not_applicable";
 actionTiming:"now"|"not_yet"|"unknown"|"not_applicable";declaration:ReadinessDeclaration;
 declarationBasis:"explicit_user_report";declarationState:"empty"|"current"|"stale";evidence:ReadinessEvidence[];actions:ReadinessAction[];
};
export type ReadinessActionResult=
 | {kind:"material";evidence:ReadinessEvidence}
 | {kind:"verification_entry";target:"declaration"|"sources";sources:ReadinessEvidence["sources"]}
 | {kind:"conditional_candidate";subjectId:string;evidence:ReadinessEvidence}
 | {kind:"trip_proposal_reference";proposalId:string;proposalRevision:number;proposalDigest:string};
