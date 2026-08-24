export type FactStatus="candidate"|"draft"|"reviewed"|"deprecated";
export type FactEligibility=Readonly<{id:string;status:FactStatus;expiresAt:string;licenceAllowed:boolean}>;
export function isEligibleFact(fact:FactEligibility,now=new Date()):boolean{return fact.status==="reviewed"&&fact.licenceAllowed&&Date.parse(fact.expiresAt)>now.getTime()}
