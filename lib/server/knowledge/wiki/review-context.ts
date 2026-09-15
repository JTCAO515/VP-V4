import type {KnowledgeStatement} from "../publication/statement.ts";
import type {StoredProposal} from "./proposals.ts";
import type { SourceDeclaration } from "../review/source-assertion.ts";
import type { WikiRead } from "./read-model.ts";
export type WikiReviewContext = {
  pageKey: string; revisionId: string; version: number; summary: string; gaps: readonly string[];
  proposalIndex?: number; proposalStatement?: KnowledgeStatement; evidence?: StoredProposal["evidence"];
  sources: { id: string; declaration: SourceDeclaration }[];
};
export function wikiReviewTarget(search: string) {
  const params = new URLSearchParams(search);
  if (!["wikiPageKey", "wikiRevisionId", "wikiVersion"].some(k => params.has(k))) return undefined;
  const pageKey=params.get("wikiPageKey"), revisionId=params.get("wikiRevisionId"), version=Number(params.get("wikiVersion"));
  if (!pageKey || pageKey.length>200 || !revisionId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(revisionId)
    || !Number.isSafeInteger(version) || version<1) return null;
  const rawProposal=params.get("wikiProposalIndex");
  if(rawProposal!==null&&!/^[0-4]$/.test(rawProposal))return null;
  return { pageKey, revisionId, version, ...(rawProposal===null?{}:{proposalIndex:Number(rawProposal)}) };
}
export function wikiReviewContext(read: WikiRead, target: NonNullable<ReturnType<typeof wikiReviewTarget>>): WikiReviewContext | null {
  const r=read.revisions.find(r=>r.id===target.revisionId && r.version===target.version);
  if (read.pageKey!==target.pageKey || read.version!==target.version || !r?.draftContent || r.validationStatus==='rejected') return null;
  const sources=r.sources.flatMap(s=>{
    const d=s.declaration;
    if (s.missing || !d || !['sourceKey','revisionLabel','publisher','uri','locator','snippet','usageDeclaration'].every(k=>typeof (d as Record<string,unknown>)[k]==='string')) return [];
    return [{id:s.id,declaration:d as SourceDeclaration}];
  });
  const proposal=target.proposalIndex===undefined?undefined:('schemaVersion' in r.draftContent && r.draftContent.schemaVersion==='wiki-draft/2'?r.draftContent.statementProposals[target.proposalIndex]:undefined);
  if(target.proposalIndex!==undefined&&!proposal)return null;
  return sources.length ? { ...(proposal?{proposalIndex:target.proposalIndex,proposalStatement:proposal.statement,evidence:proposal.evidence}:{}),pageKey:read.pageKey,revisionId:r.id,version:r.version,summary:r.draftContent.summary,gaps:r.draftContent.gaps,sources} : null;
}
