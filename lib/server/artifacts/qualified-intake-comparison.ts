import type { ComparisonContent } from "./result-contract.ts";

const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: readonly string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const integer = (v: unknown, min: number, max: number) => Number.isSafeInteger(v) && Number(v) >= min && Number(v) <= max;
const text = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max && v === v.trim();
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const digest = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const intakeKeys = ["schemaVersion", "city", "comparisonTarget", "durationDays", "partySize", "interests", "pace", "lodgingBudget", "dates", "mobilityConstraints"] as const;
export type ExplicitIntake = Readonly<{
  schemaVersion: "stay-area-intake/1"; city: string | null; comparisonTarget: "area_transport" | "lodging_budget_filter" | null;
  durationDays: number | null; partySize: number | null; interests: readonly ("food" | "photography" | "culture" | "nature")[] | null;
  pace: "relaxed" | "balanced" | "fast" | null;
  lodgingBudget: Readonly<{ currency: "CNY" | "USD" | "EUR" | "GBP"; perNightMinorUnits: number }> | null;
  dates: Readonly<{ startDate: string; endDate: string }> | null; mobilityConstraints: readonly string[] | null;
}>;
export type IntakeBinding = Readonly<{ conversationId: string; goalId: string; goalVersion: number; messageId: string;
  messageSequence: number; intakeRevision: number; contextDigest: string; memoryBasis: readonly Readonly<{ id: string; revision: number }>[] }>;
export type RailObservation = Readonly<{ schemaVersion: "planning-place/1"; source: "amap" | "synthetic_fixture"; observedAt: string; providerCalls: number;
  areas: readonly Readonly<{ id: "jingan" | "peoples_square"; label: string; railMinutes: number | null; transfers: number | null }>[] }>;
export type QualifiedComparisonProjection = Readonly<{ schemaVersion: "qualified-intake-comparison-projection/1";
  request: ExplicitIntake; binding: IntakeBinding; observation: RailObservation;
  coverage: Readonly<{ scope: "transport_screening"; evidence: "not_integrated"; observedFields: readonly string[]; unknown: readonly string[] }>;
  content: ComparisonContent; readyForProvider: false; readyForPublication: false }>;

function validIntake(v: unknown): v is ExplicitIntake {
  if (!record(v) || !exact(v, intakeKeys) || v.schemaVersion !== "stay-area-intake/1") return false;
  if (v.city !== null && !text(v.city, 80) || v.comparisonTarget !== null && (typeof v.comparisonTarget !== "string" || !["area_transport", "lodging_budget_filter"].includes(v.comparisonTarget))
    || v.pace !== null && (typeof v.pace !== "string" || !["relaxed", "balanced", "fast"].includes(v.pace)) || v.durationDays !== null && !integer(v.durationDays, 1, 30)
    || v.partySize !== null && !integer(v.partySize, 1, 10)) return false;
  for (const key of ["interests", "mobilityConstraints"] as const) {
    const list = v[key]; if (list === null) continue;
    if (!Array.isArray(list) || list.length > (key === "interests" ? 8 : 6) || new Set(list).size !== list.length
      || list.some(x => !text(x, key === "interests" ? 40 : 120) || key === "interests" && !["food", "photography", "culture", "nature"].includes(x))) return false;
  }
  if (v.lodgingBudget !== null && (!record(v.lodgingBudget) || !exact(v.lodgingBudget, ["currency", "perNightMinorUnits"])
    || typeof v.lodgingBudget.currency !== "string" || !["CNY", "USD", "EUR", "GBP"].includes(v.lodgingBudget.currency) || !integer(v.lodgingBudget.perNightMinorUnits, 1, 10000000))) return false;
  if (v.dates !== null) {
    if (!record(v.dates) || !exact(v.dates, ["startDate", "endDate"])) return false;
    const dates = [v.dates.startDate, v.dates.endDate];
    if (dates.some(x => typeof x !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(x) || !Number.isFinite(Date.parse(x)) || new Date(x).toISOString().slice(0, 10) !== x)) return false;
    const span = Date.parse(String(dates[1])) - Date.parse(String(dates[0])); if (span < 0 || span > 30 * 86400000) return false;
  }
  return true;
}
function validMemories(v: unknown): v is IntakeBinding["memoryBasis"] {
  return Array.isArray(v) && v.length <= 3 && v.every(x => record(x) && exact(x, ["id", "revision"]) && uuid(x.id) && integer(x.revision, 1, 999999999999999))
    && new Set(v.map(x => x.id)).size === v.length;
}
function validBinding(v: unknown): v is IntakeBinding {
  return record(v) && exact(v, ["conversationId", "goalId", "goalVersion", "messageId", "messageSequence", "intakeRevision", "contextDigest", "memoryBasis"])
    && [v.conversationId, v.goalId, v.messageId].every(uuid) && integer(v.goalVersion, 1, 10000) && integer(v.messageSequence, 1, 1000000)
    && integer(v.intakeRevision, 1, 1000) && digest(v.contextDigest) && validMemories(v.memoryBasis);
}
function validBasis(v: unknown): v is IntakeBinding & { intake: ExplicitIntake } {
  if (!record(v) || !exact(v, ["version", "kind", "schemaVersion", "conversationId", "goalId", "goalVersion", "messageId", "messageSequence", "intakeRevision", "sourceKind", "intake", "memoryBasis", "contextDigest", "readiness", "readyForProvider"])
    || v.version !== 5 || v.kind !== "travel_intake" || v.schemaVersion !== "assistant-travel-current-basis/1" || v.sourceKind !== "explicit_current_input"
    || v.readyForProvider !== false || !validIntake(v.intake) || !record(v.readiness) || !exact(v.readiness, ["kind", "scope", "unknown"])
    || v.readiness.kind !== "ready" || v.readiness.scope !== "transport_screening" || v.intake.city !== "shanghai" || v.intake.comparisonTarget !== "area_transport") return false;
  const binding = Object.fromEntries(["conversationId", "goalId", "goalVersion", "messageId", "messageSequence", "intakeRevision", "contextDigest", "memoryBasis"].map(k => [k, v[k]]));
  const intake = v.intake;
  const unknowns = intakeKeys.filter(k => intake[k] === null);
  return validBinding(binding) && Array.isArray(v.readiness.unknown) && new Set(v.readiness.unknown).size === v.readiness.unknown.length
    && unknowns.length === v.readiness.unknown.length && v.readiness.unknown.every(k => unknowns.includes(k));
}
function validRail(v: unknown, now: number, environment: "local_synthetic" | "staging"): v is RailObservation {
  if (!record(v) || !exact(v, ["schemaVersion", "source", "observedAt", "providerCalls", "areas"]) || v.schemaVersion !== "planning-place/1"
    || v.source !== (environment === "local_synthetic" ? "synthetic_fixture" : "amap") || typeof v.observedAt !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(v.observedAt) || !Number.isFinite(Date.parse(v.observedAt)) || new Date(v.observedAt).toISOString().slice(0, 19) !== v.observedAt.slice(0, 19)
    || now - Date.parse(v.observedAt) > 300000 || Date.parse(v.observedAt) - now > 5000 || !integer(v.providerCalls, 0, 13)
    || !Array.isArray(v.areas) || v.areas.length !== 2 || new Set(v.areas.map(x => record(x) ? x.id : null)).size !== 2) return false;
  return v.areas.every(x => record(x) && exact(x, ["id", "label", "railMinutes", "transfers"]) && (x.id === "jingan" || x.id === "peoples_square")
    && (x.id === "jingan" || x.id === "peoples_square") && text(x.label, 80)
    && (x.railMinutes === null || integer(x.railMinutes, 0, 180)) && (x.transfers === null || integer(x.transfers, 0, 5)));
}

/** Pure preparation only: caller must supply a qualified read and its independently captured binding.
 * This cannot authorize dispatch/publication or solve the planning-admission source transition. */
export function projectQualifiedIntakeComparison(basis: unknown, expected: unknown, place: unknown,
  locale: "zh" | "en", now: number, environment: "local_synthetic" | "staging"): QualifiedComparisonProjection | null {
  if (!["zh", "en"].includes(locale) || !["local_synthetic", "staging"].includes(environment) || !Number.isFinite(now)
    || !validBasis(basis) || !validBinding(expected) || !validRail(place, now, environment)) return null;
  const binding: IntakeBinding = { conversationId: basis.conversationId, goalId: basis.goalId, goalVersion: basis.goalVersion, messageId: basis.messageId,
    messageSequence: basis.messageSequence, intakeRevision: basis.intakeRevision, contextDigest: basis.contextDigest, memoryBasis: basis.memoryBasis };
  if (!equal(binding, expected)) return null;
  const input = basis.intake, zh = locale === "zh";
  const interests = input.interests === null ? (zh ? "未知" : "unknown") : input.interests.length === 0 ? (zh ? "未选择" : "none selected") : input.interests.map(x => zh ? ({ food: "美食", photography: "摄影", culture: "文化", nature: "自然" }[x]) : x).join(zh ? "、" : ", ");
  const pace = input.pace === null ? (zh ? "未知" : "unknown") : zh ? ({ relaxed: "轻松", balanced: "均衡", fast: "紧凑" }[input.pace]) : input.pace;
  const source = place.source === "synthetic_fixture" ? (zh ? "合成样例" : "synthetic fixture") : "AMap";
  const summary = zh ? `显式输入：${input.durationDays ?? "未知"}天；${input.partySize ?? "未知"}人；关注${interests}；节奏${pace}。交通观察：${source}，${place.observedAt}。美食、摄影、区域节奏适配、安全、安静程度、酒店价格与空房均未核实；不能据此推荐住宿。`
    : `Explicit input: ${input.durationDays ?? "unknown"} days; ${input.partySize ?? "unknown"} travellers; interests ${interests}; pace ${pace}. Rail observation: ${source}, ${place.observedAt}. Food, photography, pace suitability, safety, quietness, hotel prices and availability are unverified; this cannot recommend lodging.`;
  const options = ["jingan", "peoples_square"].map(id => {
    const area = place.areas.find(x => x.id === id)!;
    const fact = area.railMinutes === null ? (zh ? "到上海站交通时间未知" : "Travel time to Shanghai Railway Station is unknown")
      : zh ? `到上海站约${area.railMinutes}分钟，${area.transfers ?? "未知"}次换乘` : `About ${area.railMinutes} minutes and ${area.transfers ?? "unknown"} transfers to Shanghai Railway Station`;
    return { id, title: zh ? (id === "jingan" ? "静安寺" : "人民广场") : id === "jingan" ? "Jing'an Temple" : "People's Square",
      tradeoff: fact + (zh ? "；美食/摄影/节奏适配与住宿条件未知。" : "; food/photography/pace suitability and lodging conditions are unknown.") };
  });
  const observation: RailObservation = { ...place, areas: place.areas.map(a => ({ ...a,
    label: a.id === "jingan" ? "Jing'an Temple" : "People's Square" })) };
  return structuredClone({ schemaVersion: "qualified-intake-comparison-projection/1", request: input, binding, observation,
    coverage: { scope: "transport_screening", evidence: "not_integrated", observedFields: ["railMinutes", "transfers"].filter(k => place.areas.some(a => a[k as "railMinutes" | "transfers"] !== null)),
      unknown: ["food", "photography", "pace_suitability", "safety", "quietness", "hotel_price", "availability", ...(place.areas.some(a => a.railMinutes === null) ? ["rail_minutes"] : []), ...(place.areas.some(a => a.transfers === null) ? ["transfers"] : [])] },
    content: { schemaVersion: "comparison/1", title: zh ? "上海两区域交通初筛（非住宿推荐）" : "Shanghai two-area rail screening (not a lodging recommendation)", summary, options, actions: [] },
    readyForProvider: false, readyForPublication: false });
}
function equal(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => equal(v, b[i]));
  if (record(a) && record(b)) return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => Object.hasOwn(b, k) && equal(a[k], b[k]));
  return a === b;
}
export function validatesQualifiedIntakeComparison(content: unknown, basis: unknown, expected: unknown, place: unknown,
  locale: "zh" | "en", now: number, environment: "local_synthetic" | "staging"): boolean {
  const projected = projectQualifiedIntakeComparison(basis, expected, place, locale, now, environment);
  return projected !== null && equal(content, projected.content);
}
