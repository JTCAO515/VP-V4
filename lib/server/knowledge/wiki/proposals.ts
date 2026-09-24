import { isKnowledgeStatement, type KnowledgeStatement } from "../publication/statement.ts";
import type { SourceDeclaration } from "../review/source-assertion.ts";
export type StatementWithoutSources = Omit<Extract<KnowledgeStatement,{schemaVersion:"knowledge-statement/1"}>,"sources">;
export type ProposalOutput = Readonly<{ summary:string; gaps:readonly string[]; proposals:readonly {
  statement:StatementWithoutSources; evidence:readonly {sourceRevisionId:string;quote:string}[];
}[] }>;
export type ProposalSource = Readonly<{id:string;declaration:SourceDeclaration}>;
export type StoredProposal = Readonly<{statement:KnowledgeStatement;evidence:readonly {
  sourceRevisionId:string;quote:string;startOffset:number;endOffset:number;
}[]}>;
export type StructuredWikiDraft = Readonly<{schemaVersion:"wiki-draft/2";summary:string;gaps:readonly string[];statementProposals:readonly StoredProposal[]}>;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validationSource:SourceDeclaration={sourceKey:"validation_only",revisionLabel:"1",publisher:"Validation only",uri:"urn:vpj15:synthetic:validation",locator:"validation",snippet:"Not evidence",usageDeclaration:"Never persisted or sent"};
const object=(v:unknown,keys:readonly string[]):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const text=(v:unknown,max:number):v is string=>typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=max;
function base(v:Record<string,unknown>){return text(v.summary,600)&&Array.isArray(v.gaps)&&v.gaps.length<=5&&v.gaps.every(g=>text(g,160));}
export function isProposalOutput(v:unknown):v is ProposalOutput {
  if(!object(v,['summary','gaps','proposals'])||!base(v)||!Array.isArray(v.proposals)||v.proposals.length>5)return false;
  return v.proposals.every(p=>object(p,['statement','evidence'])&&object(p.statement,['schemaVersion','assertion','scope','expressions'])
    &&p.statement.schemaVersion==='knowledge-statement/1'&&isKnowledgeStatement({...p.statement,sources:[validationSource]})
    &&Array.isArray(p.evidence)&&p.evidence.length>=1&&p.evidence.length<=3
    &&p.evidence.every(e=>object(e,['sourceRevisionId','quote'])&&typeof e.sourceRevisionId==='string'&&UUID.test(e.sourceRevisionId)&&text(e.quote,2000))
    &&new Set(p.evidence.map(e=>e.sourceRevisionId)).size===p.evidence.length);
}
/** Recover only an otherwise valid proposal whose city is genuinely unresolved.
 * The unsafe statement is discarded and the omission stays visible to Ops.
 * Every other invalid shape still fails closed, including a full gaps array
 * that cannot record the omission. Published statement scope is unchanged. */
export function omitUnscopedProposals(v:unknown):ProposalOutput|null {
  if(isProposalOutput(v))return v;
  if(!object(v,['summary','gaps','proposals'])||!base(v)||!Array.isArray(v.gaps)||!Array.isArray(v.proposals)||v.proposals.length>5)return null;
  const retained:ProposalOutput['proposals'][number][]=[];
  let omitted=0;
  for(const proposal of v.proposals){
    const single={summary:v.summary,gaps:[],proposals:[proposal]};
    if(isProposalOutput(single)){retained.push(proposal);continue;}
    if(!object(proposal,['statement','evidence'])||!object(proposal.statement,['schemaVersion','assertion','scope','expressions'])
      ||!object(proposal.statement.scope,['cities','scene','audience'])||!Array.isArray(proposal.statement.scope.cities)
      ||proposal.statement.scope.cities.length!==0)return null;
    const withCity={...proposal,statement:{...proposal.statement,scope:{...proposal.statement.scope,cities:['shanghai']}}};
    if(!isProposalOutput({summary:v.summary,gaps:[],proposals:[withCity]}))return null;
    omitted++;
  }
  if(omitted===0||v.gaps.length===5)return null;
  const normalized={summary:v.summary,gaps:[...v.gaps,`${omitted} statement proposal(s) omitted: city scope is unsupported by the supplied source; reviewer must verify the source before drafting a city-scoped claim.`],proposals:retained};
  return isProposalOutput(normalized)?normalized:null;
}
/** Exact quotations only. Offsets count Unicode code points in the stored snippet,
 * without normalization. Repeated quotations are ambiguous and reject. */
export function resolveProposalOutput(output:ProposalOutput,sources:readonly ProposalSource[]):StructuredWikiDraft|null {
  if(!isProposalOutput(output)||sources.length<1||sources.length>3||new Set(sources.map(s=>s.id)).size!==sources.length)return null;
  const statementProposals:StoredProposal[]=[];
  for(const p of output.proposals){
    const selected:SourceDeclaration[]=[];const evidence:StoredProposal['evidence'][number][]=[];
    for(const e of p.evidence){
      const source=sources.find(s=>s.id===e.sourceRevisionId);if(!source)return null;
      const start=source.declaration.snippet.indexOf(e.quote);
      if(start<0||source.declaration.snippet.indexOf(e.quote,start+1)!==-1)return null;
      const startOffset=Array.from(source.declaration.snippet.slice(0,start)).length;
      selected.push(source.declaration);evidence.push({...e,startOffset,endOffset:startOffset+Array.from(e.quote).length});
    }
    const statement={...p.statement,sources:selected};if(!isKnowledgeStatement(statement))return null;
    statementProposals.push({statement,evidence});
  }
  return {schemaVersion:'wiki-draft/2',summary:output.summary,gaps:output.gaps,statementProposals};
}
export function isStructuredWikiDraft(v:unknown):v is StructuredWikiDraft {
  if(!object(v,['schemaVersion','summary','gaps','statementProposals'])||v.schemaVersion!=='wiki-draft/2'||!base(v)||!Array.isArray(v.statementProposals)||v.statementProposals.length>5)return false;
  return v.statementProposals.every(p=>object(p,['statement','evidence'])&&isKnowledgeStatement(p.statement)&&p.statement.schemaVersion==='knowledge-statement/1'
    &&Array.isArray(p.evidence)&&p.evidence.length===p.statement.sources.length&&p.evidence.length>=1&&p.evidence.length<=3
    &&p.evidence.every(e=>object(e,['sourceRevisionId','quote','startOffset','endOffset'])&&typeof e.sourceRevisionId==='string'&&UUID.test(e.sourceRevisionId)&&text(e.quote,2000)
      &&Number.isSafeInteger(e.startOffset)&&Number.isSafeInteger(e.endOffset)&&(e.startOffset as number)>=0&&(e.endOffset as number)<=2000&&(e.endOffset as number)-(e.startOffset as number)===Array.from(e.quote).length)
    &&new Set(p.evidence.map(e=>e.sourceRevisionId)).size===p.evidence.length);
}
export type ProposalConflict=Readonly<{a:number;b:number;reason:'objectId'|'conditions'|'exclusions'}>;
const sameIdSet=(x:readonly string[],y:readonly string[]):boolean=>x.length===y.length&&x.every(v=>y.includes(v));
/** Purely structural, deterministic, and NOT semantic contradiction detection: it
 * cannot read prose and cannot tell whether two different {subjectId,predicate}
 * pairs disagree, or whether the free text of two quotes disagrees. It flags only
 * the case where two proposals in the SAME draft assert the same structured
 * {subjectId,predicate} for an overlapping city+scene but a different objectId,
 * conditions, or exclusions -- i.e. the model's own structured output contradicts
 * itself. Proposals whose scope.cities do not overlap are a legitimate cross-city
 * difference (e.g. Shanghai vs Beijing), never flagged. This does not resolve,
 * drop, or reorder any proposal; it only surfaces disagreement for the reviewer
 * who already sees every proposal in the existing Ops diff view. */
export function detectProposalConflicts(draft:StructuredWikiDraft):readonly ProposalConflict[] {
  const conflicts:ProposalConflict[]=[];const proposals=draft.statementProposals;
  for(let a=0;a<proposals.length;a++){
    for(let b=a+1;b<proposals.length;b++){
      const A=proposals[a].statement.assertion,B=proposals[b].statement.assertion;
      const scopeA=proposals[a].statement.scope,scopeB=proposals[b].statement.scope;
      if(A.subjectId!==B.subjectId||A.predicate!==B.predicate||scopeA.scene!==scopeB.scene)continue;
      if(!scopeA.cities.some(c=>scopeB.cities.includes(c)))continue;
      if(A.objectId!==B.objectId){conflicts.push({a,b,reason:'objectId'});continue;}
      if(!sameIdSet(A.conditions,B.conditions)){conflicts.push({a,b,reason:'conditions'});continue;}
      if(!sameIdSet(A.exclusions,B.exclusions))conflicts.push({a,b,reason:'exclusions'});
    }
  }
  return conflicts;
}
/** Reshapes a flat conflict list into a per-proposal-index lookup, so a
 * consumer (the `/ops/wiki` UI) can render "this proposal disagrees with
 * proposal N" next to each proposal without re-deriving pair symmetry itself.
 * Symmetric: if `a` conflicts with `b`, both indices get an entry pointing at
 * the other. Pure and order-preserving; does not deduplicate a proposal that
 * conflicts with several others -- each pair appears once per side. */
export function conflictsByProposal(conflicts:readonly ProposalConflict[]):ReadonlyMap<number,readonly {other:number;reason:ProposalConflict['reason']}[]> {
  const map=new Map<number,{other:number;reason:ProposalConflict['reason']}[]>();
  const push=(at:number,other:number,reason:ProposalConflict['reason'])=>{const list=map.get(at);if(list)list.push({other,reason});else map.set(at,[{other,reason}]);};
  for(const {a,b,reason} of conflicts){push(a,b,reason);push(b,a,reason);}
  return map;
}
