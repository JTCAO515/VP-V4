import type { TravelAssertion } from "../publication/statement.ts";

type Predicate = TravelAssertion["predicate"];

export type OntologyType = Readonly<{ typeId: string; zhLabel: string; enLabel: string; schemaVersion: 1 }>;
export type OntologyRelation = Readonly<{
  predicate: Predicate; domainType: string; rangeType: string; zhLabel: string; enLabel: string; schemaVersion: 1;
}>;

/**
 * Mirrors supabase/migrations/20260914080000_vpj_74_ontology_provenance.sql's
 * seed rows exactly. This is the closed set statement_valid()/statement_valid_v1()
 * already enforce (7 VPJ-15 predicates + 2 VPJ-16 place predicates) — this
 * module documents it, it does not define or expand what the database accepts.
 */
export const ONTOLOGY_TYPES: readonly OntologyType[] = [
  { typeId: "service_entity", zhLabel: "服务实体", enLabel: "Service entity", schemaVersion: 1 },
  { typeId: "procedure", zhLabel: "办理流程", enLabel: "Procedure", schemaVersion: 1 },
  { typeId: "payment_method", zhLabel: "支付方式", enLabel: "Payment method", schemaVersion: 1 },
  { typeId: "document", zhLabel: "证件", enLabel: "Document", schemaVersion: 1 },
  { typeId: "action", zhLabel: "行动", enLabel: "Action", schemaVersion: 1 },
  { typeId: "contact_channel", zhLabel: "联系方式", enLabel: "Contact channel", schemaVersion: 1 },
  { typeId: "admission_scope", zhLabel: "入场范围", enLabel: "Admission scope", schemaVersion: 1 },
  { typeId: "postal_address", zhLabel: "邮寄地址", enLabel: "Postal address", schemaVersion: 1 },
  { typeId: "opening_hours_window", zhLabel: "开放时段", enLabel: "Opening hours window", schemaVersion: 1 },
];

export const ONTOLOGY_RELATIONS: readonly OntologyRelation[] = [
  { predicate: "offers_procedure", domainType: "service_entity", rangeType: "procedure", zhLabel: "提供办理流程", enLabel: "offers procedure", schemaVersion: 1 },
  { predicate: "accepts_method", domainType: "service_entity", rangeType: "payment_method", zhLabel: "接受支付方式", enLabel: "accepts payment method", schemaVersion: 1 },
  { predicate: "requires_document", domainType: "service_entity", rangeType: "document", zhLabel: "需要证件", enLabel: "requires document", schemaVersion: 1 },
  { predicate: "requires_action", domainType: "service_entity", rangeType: "action", zhLabel: "需要采取行动", enLabel: "requires action", schemaVersion: 1 },
  { predicate: "connects_to", domainType: "service_entity", rangeType: "service_entity", zhLabel: "连接至", enLabel: "connects to", schemaVersion: 1 },
  { predicate: "provides_contact", domainType: "service_entity", rangeType: "contact_channel", zhLabel: "提供联系方式", enLabel: "provides contact", schemaVersion: 1 },
  { predicate: "permits_admission", domainType: "service_entity", rangeType: "admission_scope", zhLabel: "允许入场", enLabel: "permits admission", schemaVersion: 1 },
  { predicate: "located_at", domainType: "service_entity", rangeType: "postal_address", zhLabel: "位于", enLabel: "located at", schemaVersion: 1 },
  { predicate: "opens_during", domainType: "service_entity", rangeType: "opening_hours_window", zhLabel: "开放时段", enLabel: "opens during", schemaVersion: 1 },
];

const relationByPredicate: ReadonlyMap<Predicate, OntologyRelation> = new Map(ONTOLOGY_RELATIONS.map(r => [r.predicate, r]));
const typeById: ReadonlyMap<string, OntologyType> = new Map(ONTOLOGY_TYPES.map(t => [t.typeId, t]));

/** Returns undefined for any predicate outside the closed set — never fabricates a relation. */
export function resolveOntologyRelation(predicate: string): OntologyRelation | undefined {
  return relationByPredicate.get(predicate as Predicate);
}
export function resolveOntologyType(typeId: string): OntologyType | undefined {
  return typeById.get(typeId);
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type ProvenanceReadInput = Readonly<{ factId: string }>;
/** Mirrors ops_knowledge_provenance_read_v1's own input validation exactly. */
export function isProvenanceReadInput(v: unknown): v is ProvenanceReadInput {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const keys = Object.keys(v as Record<string, unknown>);
  if (keys.length !== 1 || keys[0] !== "factId") return false;
  const factId = (v as Record<string, unknown>).factId;
  return typeof factId === "string" && uuid.test(factId);
}

export type LineageStatus = "legacy" | "tracked";
export type SourceProvenance = Readonly<{
  sourceRevisionId: string; sourceKey: string; revisionLabel: string; snippetHash: string;
  publisher: string; uri: string; locator: string;
  fetchedAt: string | null; effectiveAt: string | null; lineageStatus: LineageStatus;
}>;
export type ProvenanceAuditEntry = Readonly<{ version: number; action: "published" | "revoked"; note: string; createdAt: string }>;
export type ProvenanceRead = Readonly<{
  schemaVersion: "knowledge-provenance/1";
  factId: string;
  state: "published" | "revoked";
  publicationVersion: 1 | 2;
  assertion: TravelAssertion;
  relation: OntologyRelation | null;
  sources: readonly SourceProvenance[];
  sourceHistory: readonly SourceProvenance[];
  auditTrail: readonly ProvenanceAuditEntry[];
}>;
