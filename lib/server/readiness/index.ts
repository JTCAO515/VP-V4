import { createHash } from "node:crypto";
import { QUESTION_DEFINITIONS, QUESTION_ONTOLOGY_VERSION } from "../knowledge/claim/questions.ts";
import { resolveOntologyRelation } from "../knowledge/provenance/ontology.ts";
import { record, timestamp, type ReadinessInput } from "./contract.ts";

export const RULE_VERSION = "sim-documents/1";
const claim = QUESTION_DEFINITIONS.connectivity_sim_documents.claims[0];
const conditions = ["mainland_guidance", "current_operator_check", "branch_device_plan_check"];
const exclusions = ["no_esim_or_unrestricted_internet", "no_instant_all_branch_fixed_tariff"];
export type ReadinessTrip = Readonly<{ id: string; headVersion: number; dates: readonly Readonly<{ date: string; timeZone?: string | null }>[] }>;
type Source = Readonly<{ sourceRevisionId: string; publisher: string; uri: string; locator: string }>;
export type ReadinessEvidence = Readonly<{
  factId: string; publicationVersion: number; assertionId: string; assertionRevision: number;
  text: string; conditions: readonly string[]; exclusions: readonly string[]; sources: readonly Source[]; expiresAt: string;
}>;
export type ReadinessResult = Readonly<{
  schemaVersion: "readiness/1"; taskId: string; tripId: string; tripVersion: number; dateBasis: string;
  ruleVersion: string; ontologyVersion: string; evaluatedAt: string; expiresAt: string;
  knowledgeAvailability: "available" | "unknown";
  userReadiness: "unknown" | "satisfied" | "not_satisfied" | "not_applicable";
  actionTiming: "now" | "not_yet" | "unknown" | "not_applicable";
  nextStep: { kind: "verify_evidence" | "clarify_applicability" | "check_document" | "prepare_document" | "verify_conditions" | "choose_time" | "return_at_time" | "none"; text: string; at: string | null };
  evidence: readonly ReadinessEvidence[];
  declarationBasis: "request_only_user_report";
}>;

/** Consumes only a freshly authorized knowledge_answer_v1 result. No cached result is an input. */
export function evaluateReadiness(input: ReadinessInput, trip: ReadinessTrip, knowledge: unknown, now: Date): ReadinessResult {
  if (!Number.isFinite(now.getTime()) || input.tripVersion !== trip.headVersion) throw new Error("STALE_TRIP_VERSION");
  const evidence = eligibleEvidence(knowledge, input, now.getTime());
  const available = evidence.length > 0;
  const userReadiness = input.applies === "no" ? "not_applicable" : !available || input.applies === "unknown" ? "unknown"
    : input.documentReady === "no" || input.conditionsChecked === "no" ? "not_satisfied"
      : input.documentReady === "yes" && input.conditionsChecked === "yes" ? "satisfied" : "unknown";
  // A selected check time is a user's scheduling choice, never a carrier opening/booking window.
  const actionTiming = userReadiness === "not_applicable" ? "not_applicable" : input.checkAt === "unknown" ? "unknown"
    : input.checkAt !== "now" && timestamp(input.checkAt)! > now.getTime() ? "not_yet" : "now";
  const kind = userReadiness === "not_applicable" ? "none" : !available ? "verify_evidence"
    : input.applies === "unknown" ? "clarify_applicability" : userReadiness === "satisfied" ? "none"
      : actionTiming === "unknown" ? "choose_time" : actionTiming === "not_yet" ? "return_at_time"
        : input.documentReady === "unknown" ? "check_document" : input.documentReady === "no" ? "prepare_document" : "verify_conditions";
  const copy = {
    verify_evidence: ["Refresh the reviewed guidance before checking preparation. No current requirement can be confirmed.", "请先刷新已审核指引，再检查准备情况。目前无法确认适用要求。"],
    clarify_applicability: ["Are you planning to apply for a mainland China carrier SIM at an outlet?", "你是否打算到中国大陆运营商营业厅申请 SIM 卡？"],
    check_document: ["Check whether you have the document described in the current guidance. Do not upload its number or photo.", "请检查是否已备妥当前指引所列证件，无需上传号码或照片。"],
    prepare_document: ["Prepare the document described below; if unavailable, check acceptable options with the carrier before visiting.", "请准备下方指引所列证件；如无法提供，请先向运营商核实可接受的方案再前往。"],
    verify_conditions: ["Check current carrier guidance, branch service, handset compatibility and plan details using the sources below.", "请通过下方来源核对运营商最新指引、营业厅办理能力、手机兼容性和套餐细节。"],
    choose_time: ["Choose when you want to check this item. No official opening or booking time has been inferred.", "请选择何时检查此项；这里尚未确定官方营业或预约时间。"],
    return_at_time: ["Return at your selected check time and refresh the evidence. No reminder has been scheduled.", "请在你选定的检查时间返回并刷新依据。尚未安排提醒。"],
    none: userReadiness === "not_applicable"
      ? ["You said this does not apply. No preparation task is added.", "你已说明此项不适用，不添加准备待办。"]
      : ["You report that this document check and its conditions are satisfied. This does not confirm SIM activation or complete connectivity preparation.", "你已声明证件检查及适用条件已满足。这不代表 SIM 已开通，也不代表全部网络准备完成。"],
  };
  return {
    schemaVersion: "readiness/1", taskId: input.taskId, tripId: trip.id, tripVersion: trip.headVersion,
    dateBasis: createHash("sha256").update(JSON.stringify(trip.dates)).digest("hex"),
    ruleVersion: RULE_VERSION, ontologyVersion: `${QUESTION_ONTOLOGY_VERSION}/relation-${resolveOntologyRelation(claim.predicate)!.schemaVersion}`,
    evaluatedAt: now.toISOString(), expiresAt: new Date(Math.min(now.getTime() + 30_000,
      ...(available && record(knowledge) ? [timestamp(knowledge.evaluatedAt)! + 30_000] : []), ...evidence.map(e => Date.parse(e.expiresAt)))).toISOString(),
    knowledgeAvailability: available ? "available" : "unknown", userReadiness, actionTiming,
    nextStep: { kind, text: copy[kind][input.locale === "zh" ? 1 : 0], at: kind === "return_at_time" ? input.checkAt : null },
    evidence, declarationBasis: "request_only_user_report",
  };
}

function eligibleEvidence(raw: unknown, input: ReadinessInput, now: number): ReadinessEvidence[] {
  if (!record(raw) || raw.schemaVersion !== "knowledge-answer/1" || raw.purpose !== "trip_planning"
    || raw.recipient !== "first_party" || raw.territory !== "CN-mainland" || raw.status !== "available"
    || !record(raw.scope) || raw.scope.city !== input.city || raw.scope.locale !== input.locale || raw.scope.scene !== "connectivity"
    || timestamp(raw.evaluatedAt) === null || timestamp(raw.evaluatedAt)! > now || now - timestamp(raw.evaluatedAt)! >= 30_000
    || !record(raw.answer) || raw.answer.questionId !== "connectivity_sim_documents" || raw.answer.questionVersion !== 1
    || raw.answer.outcome !== "answered" || !Array.isArray(raw.answer.claims) || raw.answer.claims.length !== 1
    || !Array.isArray(raw.statements) || raw.statements.length !== 1) return [];
  const coverage = raw.answer.claims[0], row = raw.statements[0];
  if (!record(coverage) || coverage.id !== claim.objectId || coverage.status !== "covered" || !same(coverage.reasons, [])
    || !record(row) || !same(coverage.factIds, [row.factId]) || !id(row.factId) || !id(row.assertionId)
    || row.version !== 1 || row.assertionRevision !== 1 || !record(row.assertion)
    || row.assertion.subjectId !== claim.subjectId || row.assertion.predicate !== claim.predicate || row.assertion.objectId !== claim.objectId
    || !same(row.assertion.conditions, conditions) || !same(row.assertion.exclusions, exclusions)
    || !text(row.text, 1000) || !texts(row.conditions, conditions.length) || !texts(row.exclusions, exclusions.length)
    || !validTimes(row, timestamp(raw.evaluatedAt)!, now) || !Array.isArray(row.sources) || row.sources.length < 1 || row.sources.length > 3) return [];
  const sources: Source[] = [];
  for (const source of row.sources) {
    if (!record(source) || !id(source.sourceRevisionId) || !text(source.publisher, 160) || !text(source.locator, 240) || !safeURL(source.uri)) return [];
    sources.push({ sourceRevisionId: source.sourceRevisionId, publisher: source.publisher, locator: source.locator, uri: source.uri });
  }
  if (new Set(sources.map(s => s.sourceRevisionId)).size !== sources.length) return [];
  return [{ factId: row.factId, publicationVersion: row.version, assertionId: row.assertionId, assertionRevision: row.assertionRevision,
    text: row.text, conditions: row.conditions, exclusions: row.exclusions, sources, expiresAt: row.expiresAt as string }];
}
function validTimes(row: Record<string, unknown>, evaluated: number, now: number): boolean {
  const reviewed = timestamp(row.reviewedAt), published = timestamp(row.publishedAt), expires = timestamp(row.expiresAt);
  return reviewed !== null && published !== null && expires !== null && reviewed <= published && published <= evaluated && expires > now;
}
function id(v: unknown): v is string { return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v); }
function text(v: unknown, max: number): v is string { return typeof v === "string" && v.trim().length > 0 && v.length <= max; }
function texts(v: unknown, count: number): v is string[] { return Array.isArray(v) && v.length === count && v.every(t => text(t, 240)); }
function same(a: unknown, b: readonly unknown[]): boolean { return Array.isArray(a) && a.length === b.length && a.every((v, i) => v === b[i]); }
function safeURL(v: unknown): v is string { try { if (!text(v, 2000)) return false; const u = new URL(v); return ["https:", "http:"].includes(u.protocol) && !!u.hostname && !u.username && !u.password; } catch { return false; } }
