import type { GroundedAddressClaim } from "../../contracts/index.ts";
/** Pending content only; deliberately not a GroundedClaim or EvidenceReceipt. */
export type SourceDeclaration = Readonly<{
  sourceKey: string; revisionLabel: string; publisher: string; uri: string;
  locator: string; snippet: string; usageDeclaration: string;
}>;
export type CandidateAddressAssertion = Readonly<{
  subjectId: string; claimType: "address"; value: GroundedAddressClaim["value"];
}>;
export type SourcedCandidateInput = Readonly<{
  action: "submit_assertion"; operationId: string; candidateId: string; title: string;
  source: SourceDeclaration; assertion: CandidateAddressAssertion;
  expressions: Readonly<{ zh: string; en: string }>;
}>;
export type SourcedCandidateRead = Readonly<{
  source: SourceDeclaration & { revisionId: string; snippetHash: string; locatorStatus: "unverified"; usageStatus: "unverified" };
  assertion: CandidateAddressAssertion & { assertionId: string; revision: 1; expressions: Readonly<{ zh: string; en: string }> };
}>;
const token = /^[a-z][a-z0-9_-]{0,127}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function record(value: unknown, keys: string[]): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
}
function text(value: unknown, max: number): value is string { return typeof value === "string" && value.trim().length > 0 && value.length <= max; }
export function isSourceUri(value: unknown): value is string {
  if (!text(value, 1000) || /[\s\\]/u.test(value)) return false;
  if (/^urn:vpj15:synthetic:[a-z0-9:_-]+$/.test(value)) return true;
  if (!/^https?:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?(?:\/[^?#\s\\]*)?$/.test(value)) return false;
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash; } catch { return false; }
}
export function isSourcedCandidateInput(value: unknown): value is SourcedCandidateInput {
  if (!record(value, ["action", "operationId", "candidateId", "title", "source", "assertion", "expressions"]) || value.action !== "submit_assertion") return false;
  if (typeof value.operationId !== "string" || !uuid.test(value.operationId) || typeof value.candidateId !== "string" || !uuid.test(value.candidateId) || !text(value.title, 160)) return false;
  const s = value.source, a = value.assertion, e = value.expressions;
  if (!record(s, ["sourceKey", "revisionLabel", "publisher", "uri", "locator", "snippet", "usageDeclaration"]) || !text(s.sourceKey, 128) || !token.test(s.sourceKey) || !text(s.revisionLabel, 120) || !text(s.publisher, 160) || !isSourceUri(s.uri) || !text(s.locator, 240) || !text(s.snippet, 2000) || !text(s.usageDeclaration, 500)) return false;
  if (!record(a, ["subjectId", "claimType", "value"]) || !text(a.subjectId, 128) || !token.test(a.subjectId) || a.claimType !== "address") return false;
  const v = a.value;
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const address = v as Record<string, unknown>;
  if (!Object.keys(address).every(key => ["lines", "locality", "countryCode"].includes(key)) || !Array.isArray(address.lines) || address.lines.length < 1 || address.lines.length > 3 || !address.lines.every(line => text(line, 160)) || typeof address.countryCode !== "string" || !/^[A-Z]{2}$/.test(address.countryCode) || (address.locality !== undefined && !text(address.locality, 120))) return false;
  if (!record(e, ["zh", "en"]) || !text(e.zh, 1000) || !text(e.en, 1000)) return false;
  return new TextEncoder().encode(JSON.stringify(value)).byteLength <= 24000;
}
