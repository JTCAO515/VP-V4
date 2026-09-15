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
