import { isKnowledgeOperation, type KnowledgeStatement } from "../publication/statement.ts";
export type WikiStatementSubmit = Readonly<{
  action: "submit_wiki_statement"; operationId: string; candidateId: string; title: string;
  wikiRevisionId: string; expectedWikiVersion: number; statement: KnowledgeStatement;
}>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function isWikiStatementSubmit(value: unknown): value is WikiStatementSubmit {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).length !== 7 || v.action !== "submit_wiki_statement"
    || typeof v.wikiRevisionId !== "string" || !uuid.test(v.wikiRevisionId)
    || !Number.isSafeInteger(v.expectedWikiVersion) || (v.expectedWikiVersion as number) < 1
    || (v.expectedWikiVersion as number) > 2147483647) return false;
  return isKnowledgeOperation({ action: "submit_statement", operationId: v.operationId,
    candidateId: v.candidateId, title: v.title, statement: v.statement })
    && new TextEncoder().encode(JSON.stringify(v)).byteLength <= 24000;
}
