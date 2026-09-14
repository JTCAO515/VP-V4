import { isSourceUri, type SourceDeclaration } from "../review/source-assertion.ts";
import { validPlaceFields, type PlaceIdentity, type PlaceValue } from "./place.ts";

export const KNOWLEDGE_CITIES = ["shanghai", "beijing", "guangzhou", "chongqing"] as const;
export const KNOWLEDGE_SCENES = ["arrival", "airport_transport", "payment", "connectivity", "public_transport", "taxi", "rail", "attraction", "accommodation", "emergency"] as const;
export type KnowledgeCity = typeof KNOWLEDGE_CITIES[number];
export type KnowledgeScene = typeof KNOWLEDGE_SCENES[number];
/** Identifiers describe one atomic relation. Localized wording cannot change its scope. */
export type TravelAssertion = Readonly<{
  subjectId: string;
  predicate: "offers_procedure" | "accepts_method" | "requires_document" | "requires_action" | "connects_to" | "provides_contact" | "permits_admission" | "located_at" | "opens_during";
  objectId: string;
  conditions: readonly string[];
  exclusions: readonly string[];
}>;
export type KnowledgeStatement = Readonly<({ schemaVersion: "knowledge-statement/1" }
  | { schemaVersion: "knowledge-statement/2"; place: PlaceIdentity; value: PlaceValue }) & {
  assertion: TravelAssertion;
  scope: Readonly<{ cities: readonly KnowledgeCity[]; scene: KnowledgeScene; audience: "international_independent_traveler" }>;
  expressions: Readonly<Record<"zh" | "en", Readonly<{ text: string; conditions: readonly string[]; exclusions: readonly string[] }>>>;
  sources: readonly SourceDeclaration[];
}>;
export type KnowledgeSubmit = Readonly<{ action: "submit_statement"; operationId: string; candidateId: string; title: string; statement: KnowledgeStatement }>;
export type KnowledgePublish = Readonly<{
  action: "publish_statement"; operationId: string; candidateId: string; expectedVersion: 2;
  expiresAt: string;
  /** A recorded editorial use decision, never a claim of blanket source ownership. */
  useBasis: "original_factual_summary" | "explicit_licence";
  useNote: string;
}>;
export type KnowledgeRevoke = Readonly<{ action: "revoke_statement"; operationId: string; candidateId: string; expectedPublicationVersion: 1; note: string }>;
export type KnowledgeOperation = KnowledgeSubmit | KnowledgePublish | KnowledgeRevoke;
export type KnowledgeReadScope = Readonly<{ city: KnowledgeCity; scene: KnowledgeScene; locale: "zh" | "en" }>;
const predicates = ["offers_procedure", "accepts_method", "requires_document", "requires_action", "connects_to", "provides_contact", "permits_admission"];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const token = /^[a-z][a-z0-9_-]{0,127}$/;
const bounded = (v: unknown, max: number): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;
function record(v: unknown, keys: string[]): v is Record<string, unknown> { return !!v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k)); }
function identifiers(v: unknown): v is readonly string[] { return Array.isArray(v) && v.length <= 12 && new Set(v).size === v.length && v.every(x => typeof x === "string" && token.test(x)); }
export function isKnowledgeStatement(v: unknown): v is KnowledgeStatement {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const version = (v as Record<string, unknown>).schemaVersion;
  const place = version === "knowledge-statement/2";
  if ((!place && version !== "knowledge-statement/1") || !record(v, ["schemaVersion", "assertion", "scope", "expressions", "sources", ...(place ? ["place", "value"] : [])])) return false;
  const a=v.assertion, s=v.scope, e=v.expressions;
  if (!record(a,["subjectId","predicate","objectId","conditions","exclusions"]) || typeof a.subjectId!=="string" || !token.test(a.subjectId) || typeof a.objectId!=="string" || !token.test(a.objectId) || !(place ? validPlaceFields(v.place, v.value, a.predicate, a.objectId) : predicates.includes(a.predicate as string)) || !identifiers(a.conditions) || !identifiers(a.exclusions)) return false;
  if (!record(s,["cities","scene","audience"]) || s.audience!=="international_independent_traveler" || !KNOWLEDGE_SCENES.includes(s.scene as KnowledgeScene) || !Array.isArray(s.cities) || s.cities.length<1 || s.cities.length>4 || new Set(s.cities).size!==s.cities.length || !s.cities.every(c=>KNOWLEDGE_CITIES.includes(c))) return false;
  if (place && (s.scene !== "attraction" || s.cities.length !== 1)) return false;
  if (!record(e,["zh","en"]) || !Array.isArray(v.sources) || v.sources.length<1 || v.sources.length>3) return false;
  for (const language of ["zh","en"] as const) {
    const projection=e[language];
    if (!record(projection,["text","conditions","exclusions"]) || !bounded(projection.text,1000)) return false;
    for (const kind of ["conditions","exclusions"] as const) {
      if (!Array.isArray(projection[kind]) || projection[kind].length!==(a[kind] as readonly string[]).length || !projection[kind].every(x=>bounded(x,240))) return false;
    }
  }
  if (!v.sources.every(source=>record(source,["sourceKey","revisionLabel","publisher","uri","locator","snippet","usageDeclaration"]) && bounded(source.sourceKey,128) && token.test(source.sourceKey) && bounded(source.revisionLabel,120) && bounded(source.publisher,160) && isSourceUri(source.uri) && bounded(source.locator,240) && bounded(source.snippet,2000) && bounded(source.usageDeclaration,500))) return false;
  return new Set(v.sources.map(source=>source.sourceKey+":"+source.revisionLabel)).size===v.sources.length;
}
export function isKnowledgeOperation(v: unknown): v is KnowledgeOperation {
  if (!v || typeof v!=="object" || Array.isArray(v)) return false;
  const x=v as Record<string, unknown>;
  if (typeof x.operationId!=="string" || !uuid.test(x.operationId) || typeof x.candidateId!=="string" || !uuid.test(x.candidateId) || new TextEncoder().encode(JSON.stringify(x)).byteLength>24000) return false;
  if (x.action==="submit_statement") return record(x,["action","operationId","candidateId","title","statement"]) && bounded(x.title,160) && isKnowledgeStatement(x.statement);
  if (x.action==="publish_statement") return record(x,["action","operationId","candidateId","expectedVersion","expiresAt","useBasis","useNote"]) && x.expectedVersion===2 && typeof x.expiresAt==="string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(x.expiresAt) && Number.isFinite(Date.parse(x.expiresAt)) && (x.useBasis==="original_factual_summary" || x.useBasis==="explicit_licence") && bounded(x.useNote,1000);
  return x.action==="revoke_statement" && record(x,["action","operationId","candidateId","expectedPublicationVersion","note"]) && x.expectedPublicationVersion===1 && bounded(x.note,400);
}
export function knowledgeReadScope(url: URL): KnowledgeReadScope | null {
  if (url.searchParams.size!==3 || [...url.searchParams.keys()].some(k=>!["city","scene","locale"].includes(k))) return null;
  const city=url.searchParams.get("city") as KnowledgeCity, scene=url.searchParams.get("scene") as KnowledgeScene, locale=url.searchParams.get("locale");
  return KNOWLEDGE_CITIES.includes(city) && KNOWLEDGE_SCENES.includes(scene) && (locale==="zh" || locale==="en") ? {city,scene,locale} : null;
}
