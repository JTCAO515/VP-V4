import { isPlaceQuestionId, questionDefinition } from "../server/knowledge/claim/questions.ts";
import { validPlaceFields } from "../server/knowledge/publication/place.ts";
/** Browser projection of the existing grounded-turn/1 contract. No inference or persistence. */
export type SavedSource = { id: string; publisher: string; locator: string; href: string | null };
export type SavedFact = { id: string; text: string; placeDetails?: string[]; conditions: string[]; exclusions: string[]; sources: SavedSource[] };
export type SavedClaimGap = { id: string; reasons: string[] };
export type SavedTurn = {
  id: string; taskId: string; parentId: string | null; threadId: string; relationship: string;
  claimGaps?: SavedClaimGap[]; unansweredNeeds?: string[]; questionId?: string | null; placeName?: string; placeResolution?: "matched" | "ambiguous" | "unavailable"; missingClaims?: string[]; input: string; city: string; locale: "zh" | "en"; createdAt: string;
  status: string; outcome: string | null; coverage: string | null; projection: string; facts: SavedFact[];
};
export type SavedHistory = { ownerId: string; turns: SavedTurn[]; lifetimeMs: number };
const cities = ["shanghai", "beijing", "guangzhou", "chongqing"];

function requireValue(value: unknown): asserts value { if (!value) throw new Error("Invalid saved answer"); }
function record(value: unknown): Record<string, unknown> {
  requireValue(value && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}
function string(value: unknown, maximum = 4000): string {
  requireValue(typeof value === "string" && value.trim() && value.length <= maximum && !value.includes("\0"));
  return value;
}
function id(value: unknown): string {
  const result = string(value, 36);
  requireValue(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result));
  return result;
}
function date(value: unknown): number {
  const result = string(value, 40);
  requireValue(/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(result) && Number.isFinite(Date.parse(result)));
  return Date.parse(result);
}
function list(value: unknown, maximum: number): unknown[] { requireValue(Array.isArray(value) && value.length <= maximum); return value; }
function strings(value: unknown, maximum = 12, length = 240): string[] { return list(value, maximum).map(v => string(v, length)); }
function unique(values: string[]) { requireValue(new Set(values).size === values.length); }
export function sourceLink(value: unknown): string | null {
  try { const url = new URL(string(value, 2000)); return ["http:", "https:"].includes(url.protocol) && url.hostname && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}

/** Subtract the entire request duration, including policy/auth reads, from every evidence lease. */
export function parseGroundedHistory(owner: unknown, policyReply: unknown, historyReply: unknown, policyId: string, elapsedMs: number): SavedHistory {
  requireValue(Number.isFinite(elapsedMs) && elapsedMs >= 0 && elapsedMs < 30_000);
  const ownerId = id(owner), envelope = record(policyReply), policy = record(envelope.policy), history = record(historyReply);
  requireValue(envelope.kind === "policy" && policy.id === policyId && policy.consentState === "accepted");
  requireValue(history.kind === "grounded_history");
  let lifetimeMs = 30_000;
  const turns = list(history.turns, 20).map(raw => {
    const turn = record(raw), result = record(turn.result);
    const placeResolution = result.placeResolution == null ? undefined : string(result.placeResolution, 20);
    const placeName = result.placeName == null ? undefined : string(result.placeName, 160);
    if (placeResolution !== undefined || placeName !== undefined || result.placeSubjectId != null) {
      requireValue(placeName && typeof turn.input === "string" && turn.input.includes(placeName) && result.completedAt !== null);
      requireValue(placeResolution === "matched" ? isPlaceQuestionId(result.intent) && questionDefinition(result.intent, result.placeSubjectId) !== null
        : result.placeSubjectId == null && (placeResolution === "ambiguous" ? result.intent === "clarification" : placeResolution === "unavailable" && result.intent === "unsupported"));
    }
    const unansweredNeeds = result.unansweredNeeds == null ? undefined : list(result.unansweredNeeds, 6).map(v => {
      const excerpt = string(v, 480);
      requireValue([...excerpt].length <= 240 && !/[\uD800-\uDFFF]/u.test(excerpt) && typeof turn.input === "string" && turn.input.includes(excerpt));
      return excerpt;
    });
    if (unansweredNeeds) {
      unique(unansweredNeeds);
      requireValue(result.completedAt !== null && (result.requestScope === "additional_needs") === (unansweredNeeds.length > 0));
    }
    const turnId = id(turn.turnId), taskId = id(turn.serviceTaskId), threadId = id(turn.threadId);
    requireValue(turn.kind === "grounded_turn" && turn.schemaVersion === "grounded-turn/1" && turn.scopeVersion === 1);
    const parentId = turn.parentTurnId === null ? null : id(turn.parentTurnId);
    const relationship = string(turn.relationship, 30);
    requireValue(relationship === "new_goal" ? parentId === null : ["clarification", "repair"].includes(relationship) && parentId !== null && parentId !== turnId);
    requireValue(turn.locale === "zh" || turn.locale === "en");
    const city = string(result.city, 20);
    requireValue(cities.includes(city) && result.type === "reviewed_answer" && result.originalOutcome === turn.outcome);
    date(turn.createdAt);
    const outcome = turn.outcome === null ? null : string(turn.outcome, 30);
    const waiting = ["accepted", "planning", "retrieving", "generating", "validating"].includes(String(turn.status));
    requireValue(outcome === null ? waiting || ["cancelled", "failed"].includes(String(turn.status))
      : turn.status === ({ answered: "completed", partial: "completed", clarification: "completed", blocked: "unavailable", technical_failure: "failed" } as Record<string, string>)[outcome]);
    const facts: SavedFact[] = [];
    let coverage: string | null = null;
    let missingClaims: string[] | undefined;
    let claimGaps: SavedClaimGap[] | undefined;
    if (result.completedAt === null) {
      requireValue(result.intent === null && result.requestScope === null && outcome === null && turn.output === null && result.knowledge === null && result.projection === "pending");
    } else {
      date(result.completedAt);
      requireValue(turn.output === "reviewed-answer-v1" && ["current", "unavailable"].includes(String(result.projection)));
      const definition = questionDefinition(result.intent, result.placeSubjectId);
      if (definition) {
        const requiredClaims = definition.claims.map(claim => claim.objectId);
        requireValue(["single", "additional_needs"].includes(String(result.requestScope)) && ["answered", "partial", "blocked"].includes(outcome ?? "") && !(result.requestScope === "additional_needs" && outcome === "answered"));
        if (result.projection === "unavailable") requireValue(result.knowledge === null);
        else {
          const knowledge = record(result.knowledge), scope = record(knowledge.scope), answer = record(knowledge.answer);
          requireValue(knowledge.schemaVersion === "knowledge-answer/1" && knowledge.purpose === "trip_planning" && knowledge.recipient === "first_party" && knowledge.territory === "CN-mainland");
          requireValue(scope.city === city && scope.locale === turn.locale && scope.scene === definition.scene);
          const evaluated = date(knowledge.evaluatedAt), assertions = new Map<string, string>();
          for (const rawFact of list(knowledge.statements, 50)) {
            const fact = record(rawFact), assertion = record(fact.assertion);
            const factId = id(fact.factId); id(fact.assertionId);
            requireValue(fact.version === 1 && fact.assertionRevision === 1 && !assertions.has(factId));
            requireValue(definition.claims.some(claim => assertion.subjectId === claim.subjectId && assertion.predicate === claim.predicate && assertion.objectId === claim.objectId));
            if (isPlaceQuestionId(result.intent)) {
              requireValue(placeResolution === "matched" && validPlaceFields(fact.place, fact.value, assertion.predicate, assertion.objectId));
              const factScope = record(fact.scope);
              requireValue(factScope.scene === "attraction" && factScope.audience === "international_independent_traveler"
                && Array.isArray(factScope.cities) && factScope.cities.length === 1 && factScope.cities[0] === city);
              if (assertion.predicate === "opens_during") {
                const startsAt = date(record(fact.value).startsAt), localDay = (t: number) => Math.floor((t + 8 * 3600000) / 86400000);
                requireValue(localDay(startsAt) === localDay(evaluated));
                lifetimeMs = Math.min(lifetimeMs, (localDay(evaluated) + 1) * 86400000 - 8 * 3600000 - evaluated);
              }
            }
            assertions.set(factId, string(assertion.objectId, 128));
            const conditions = strings(fact.conditions), exclusions = strings(fact.exclusions);
            requireValue(conditions.length === strings(assertion.conditions).length && exclusions.length === strings(assertion.exclusions).length);
            requireValue(date(fact.reviewedAt) <= date(fact.publishedAt) && date(fact.publishedAt) <= evaluated && date(fact.expiresAt) > evaluated);
            lifetimeMs = Math.min(lifetimeMs, date(fact.expiresAt) - evaluated);
            const sources = list(fact.sources, 3).map(rawSource => {
              const source = record(rawSource);
              return { id: id(source.sourceRevisionId), publisher: string(source.publisher, 160), locator: string(source.locator, 240), href: sourceLink(source.uri) };
            });
            requireValue(sources.length); unique(sources.map(source => source.id));
            let placeDetails: string[] | undefined;
            if (isPlaceQuestionId(result.intent)) {
              const value = record(fact.value);
              const localTime = (instant: unknown) => new Date(date(instant) + 8 * 3600000).toISOString().slice(0, 19).replace("T", " ");
              placeDetails = assertion.predicate === "located_at"
                ? [...strings(value.lines), ...(value.locality ? [string(value.locality, 120)] : []), turn.locale === "zh" ? "中国" : "China"]
                : [`${localTime(value.startsAt)} – ${localTime(value.endsAt)} (Asia/Shanghai, UTC+08:00)`];
            }
            facts.push({ id: factId, text: string(fact.text, 1000), ...(placeDetails ? { placeDetails } : {}), conditions, exclusions, sources });
          }
          requireValue(knowledge.status === (facts.length ? "available" : "no_eligible_content"));
          requireValue(answer.questionId === result.intent && answer.questionVersion === 1);
          if (isPlaceQuestionId(result.intent)) requireValue(placeResolution === "matched" && answer.subjectId === result.placeSubjectId);
          const claims = list(answer.claims, requiredClaims.length).map(record), allIds: string[] = [];
          requireValue(claims.length === requiredClaims.length);
          claims.forEach((claim, index) => {
            requireValue(claim.id === requiredClaims[index]);
            const ids = list(claim.factIds, 50).map(id), reasons = strings(claim.reasons); unique(reasons); allIds.push(...ids);
            if (claim.status === "covered") requireValue(ids.length && !reasons.length && ids.every(factId => assertions.get(factId) === claim.id));
            else if (claim.status === "unresolved_variants") requireValue(!ids.length && reasons.length === 1 && reasons[0] === "unresolved_variants");
            else requireValue(claim.status === "unavailable" && !ids.length && reasons.length && reasons.every(reason => ["missing", "expired", "revoked", "unreviewed", ...(isPlaceQuestionId(result.intent) ? ["not_current_date"] : [])].includes(reason)) && (!reasons.includes("missing") || reasons.length === 1));
          });
          unique(allIds); requireValue(allIds.length === facts.length && allIds.every(factId => assertions.has(factId)));
          claimGaps = claims.filter(claim => claim.status !== "covered").map(claim => ({ id: String(claim.id), reasons: strings(claim.reasons) }));
          if (isPlaceQuestionId(result.intent)) missingClaims = claims.filter(claim => claim.status !== "covered").map(claim => String(claim.id));
          requireValue(answer.outcome === (claims.every(claim => claim.status === "covered") ? "answered" : facts.length ? "partial" : "no_answer"));
          coverage = String(answer.outcome);
        }
      } else {
        requireValue(["clarification", "unsupported", "technical_failure", "blocked"].includes(String(result.intent)) && result.requestScope === "unknown" && result.knowledge === null && result.projection === "current");
        requireValue(outcome === (result.intent === "clarification" ? "clarification" : result.intent === "technical_failure" ? "technical_failure" : "blocked"));
      }
    }
    return { ...(claimGaps ? { claimGaps } : {}), ...(unansweredNeeds ? { unansweredNeeds } : {}), ...(placeName ? { placeName, placeResolution: placeResolution as SavedTurn["placeResolution"] } : {}), ...(missingClaims ? { missingClaims } : {}), questionId: questionDefinition(result.intent, result.placeSubjectId) ? String(result.intent) : null, id: turnId, taskId, parentId, threadId, relationship, input: string(turn.input), city, locale: turn.locale as "zh" | "en", createdAt: string(turn.createdAt, 40), status: String(turn.status), outcome, coverage, projection: String(result.projection), facts };
  });
  unique(turns.map(turn => turn.id));
  requireValue(lifetimeMs > elapsedMs);
  return { ownerId, turns, lifetimeMs: lifetimeMs - elapsedMs };
}
