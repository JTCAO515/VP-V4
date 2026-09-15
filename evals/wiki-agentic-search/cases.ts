import { QUESTION_DEFINITIONS, PLACE_QUESTION_IDS, QUESTION_ONTOLOGY_VERSION, type QuestionClaim } from "../../lib/server/knowledge/claim/questions.ts";

/**
 * VPJ-76 (#360) slice 11: the frozen zh/en question-family set the
 * acceptance criteria requires ("冻结复用加新增的中英问题族与qrels/必要claim
 * 真值，调参和保留集按来源版本/问题族隔离"). Narrowly scoped to this
 * feature's own real question definitions -- not a claim to establish
 * AI-42's general qrels/eval-runner infrastructure (evals/qrels/README.md,
 * evals/runners/README.md both say that is explicitly out of this
 * directory's scope). Follows the VPJ-66 harness's own house style
 * (evals/harness/cases.ts): `group: "development" | "holdout"`, a frozen
 * `versions` stamp, synthetic-only content, no private payloads.
 *
 * Every real `QUESTION_DEFINITIONS` key plus every `PLACE_QUESTION_IDS`
 * entry gets exactly one zh and one en case (28 "primary" cases) -- claims
 * are imported from `questions.ts`, never re-typed by hand, so this suite
 * cannot silently drift from what the product actually resolves. Six
 * additional "diversity" cases (one per non-answered terminal this module
 * can reach) round the set to 34, holding development/holdout roughly
 * even and isolated: no case ever appears in both groups, and holdout
 * cases are never referenced by name anywhere the fixture-authoring code
 * itself is tuned against (this file *is* both -- an accepted limitation
 * of a narrow, self-authored eval; see the eval's own README).
 */

export const versions = Object.freeze({ corpus: "wiki-agentic-search-eval/1", claims: QUESTION_ONTOLOGY_VERSION });

export type ScenarioKind = "full_coverage" | "partial_coverage" | "missing_content" | "retrieval_miss" | "provider_failure" | "budget_exhausted";

export type CorpusStatement = Readonly<{ factId: string; assertionId: string; predicate: string; objectId: string; sourceId: string; text: Readonly<{ zh: string; en: string }> }>;

export type Scenario = Readonly<{
  id: string;
  group: "development" | "holdout";
  questionId: string;
  locale: "zh" | "en";
  city: string;
  question: string;
  kind: ScenarioKind;
  claims: readonly QuestionClaim[];
  corpus: readonly CorpusStatement[];
  citedFactIds: readonly string[];
  expected: Readonly<{ kind: "answered" | "unavailable" | "budget_exhausted"; reason?: string }>;
}>;

const CITIES = ["shanghai", "beijing", "guangzhou", "chongqing"] as const;

const QUESTION_TEXT: Readonly<Record<string, Readonly<{ zh: string; en: string }>>> = {
  rail_boarding_documents: { zh: "乘车需要哪些证件？", en: "What documents do I need to board the train?" },
  payment_card_acceptance: { zh: "这里能刷外卡吗？", en: "Can I pay by international card here?" },
  payment_mobile_setup: { zh: "怎么开始用手机扫码支付？", en: "How do I start using mobile QR payments?" },
  payment_cash_access: { zh: "怎么取到人民币现金？", en: "How can I get RMB cash?" },
  payment_card_and_mobile: { zh: "能刷外卡也能用手机支付吗？", en: "Can I pay by card and use mobile payments?" },
  payment_card_and_cash: { zh: "能刷外卡也能取现金吗？", en: "Can I pay by card and get cash?" },
  payment_mobile_and_cash: { zh: "能用手机支付也能取现金吗？", en: "Can I use mobile payments and get cash?" },
  payment_getting_started: { zh: "这里有哪些支付方式？", en: "What are my payment options here?" },
  connectivity_sim_documents: { zh: "办本地SIM卡需要哪些证件？", en: "What documents do I need for a local SIM card?" },
  connectivity_plan_allowances: { zh: "SIM套餐额度要注意什么？", en: "What should I check about my SIM plan allowances?" },
  connectivity_getting_started: { zh: "怎么开始办理本地SIM卡？", en: "How do I get started with a local SIM?" },
  place_address: { zh: "这个景点的地址在哪？", en: "Where is the named attraction located?" },
  place_opening_hours: { zh: "这个景点今天几点开门？", en: "What time does the named attraction open today?" },
  place_address_and_hours: { zh: "这个景点的地址和今天开放时间是？", en: "Where is the named attraction and what are today's hours?" },
};

function corpusFor(questionId: string, claims: readonly QuestionClaim[], index: number): readonly CorpusStatement[] {
  if (claims.length === 0) {
    // Place questions: this module never resolves a placeSubjectId (slice 6), so there
    // is no fixed claim to check coverage against -- still needs a real, findable
    // statement so the search loop has something to retrieve and cite.
    const predicate = questionId === "place_address" ? "located_at" : "opens_during";
    const objectId = questionId === "place_address" ? "place_address" : "opening_hours";
    return [{
      factId: `fact-${questionId}-${index}`, assertionId: `assertion-${questionId}-${index}`, predicate, objectId,
      sourceId: `source-${questionId}-${index}`,
      text: { zh: "已审核信息：地址与开放时间见官方标识。", en: "Reviewed information: see official signage for address and opening hours." },
    }];
  }
  return claims.map((claim, claimIndex) => ({
    factId: `fact-${questionId}-${index}-${claimIndex}`, assertionId: `assertion-${questionId}-${index}-${claimIndex}`,
    predicate: claim.predicate, objectId: claim.objectId, sourceId: `source-${questionId}-${index}-${claimIndex}`,
    text: { zh: `已审核信息：满足 ${claim.objectId} 的具体要求。`, en: `Reviewed information satisfying the ${claim.objectId} requirement.` },
  }));
}

function primaryCase(questionId: string, claims: readonly QuestionClaim[], index: number): readonly [Scenario, Scenario] {
  const city = CITIES[index % CITIES.length];
  const corpus = corpusFor(questionId, claims, index);
  const citedFactIds = corpus.map((entry) => entry.factId);
  const base = { questionId, city, kind: "full_coverage" as const, claims, corpus, citedFactIds, expected: { kind: "answered" as const } };
  return [
    { id: `${questionId}-zh`, group: index % 2 === 0 ? "development" : "holdout", locale: "zh", question: QUESTION_TEXT[questionId].zh, ...base },
    { id: `${questionId}-en`, group: index % 2 === 0 ? "holdout" : "development", locale: "en", question: QUESTION_TEXT[questionId].en, ...base },
  ];
}

const nonPlace = Object.entries(QUESTION_DEFINITIONS).flatMap(([id, definition], index) => primaryCase(id, definition.claims, index));
const place = PLACE_QUESTION_IDS.flatMap((id, index) => primaryCase(id, [], nonPlace.length / 2 + index));

// Six diversity cases: one per non-"answered" terminal runGroundedWikiSearch can
// reach for a *supported* intent (missing_content is the only one requiring an
// intentionally empty corpus; capability_unsupported/user_input_missing/policy_denied
// are gate checks already covered directly in wiki-grounded-search.test.mjs, not
// re-tested here to keep this set about the search loop's own behavior).
const cardClaim = QUESTION_DEFINITIONS.payment_card_acceptance.claims;
const simClaim = QUESTION_DEFINITIONS.connectivity_sim_documents.claims;
const railClaims = QUESTION_DEFINITIONS.rail_boarding_documents.claims;
const gettingStartedClaims = QUESTION_DEFINITIONS.payment_getting_started.claims;
const diversity: readonly Scenario[] = [
  {
    id: "diversity-missing-content-zh", group: "development", questionId: "payment_card_acceptance", locale: "zh", city: "shanghai",
    question: QUESTION_TEXT.payment_card_acceptance.zh, kind: "missing_content", claims: cardClaim, corpus: [], citedFactIds: [],
    expected: { kind: "unavailable", reason: "missing_content" },
  },
  {
    id: "diversity-retrieval-miss-en", group: "holdout", questionId: "payment_card_acceptance", locale: "en", city: "beijing",
    question: QUESTION_TEXT.payment_card_acceptance.en, kind: "retrieval_miss", claims: cardClaim,
    corpus: corpusFor("payment_card_acceptance", cardClaim, 100), citedFactIds: [],
    expected: { kind: "unavailable", reason: "retrieval_miss" },
  },
  {
    id: "diversity-partial-coverage-zh", group: "holdout", questionId: "rail_boarding_documents", locale: "zh", city: "guangzhou",
    question: QUESTION_TEXT.rail_boarding_documents.zh, kind: "partial_coverage", claims: railClaims,
    corpus: corpusFor("rail_boarding_documents", railClaims, 101), citedFactIds: [`fact-rail_boarding_documents-101-0`],
    expected: { kind: "answered" },
  },
  {
    id: "diversity-provider-failure-en", group: "development", questionId: "connectivity_sim_documents", locale: "en", city: "chongqing",
    question: QUESTION_TEXT.connectivity_sim_documents.en, kind: "provider_failure", claims: simClaim,
    corpus: corpusFor("connectivity_sim_documents", simClaim, 102), citedFactIds: [],
    expected: { kind: "unavailable", reason: "provider_failure" },
  },
  {
    id: "diversity-budget-exhausted-zh", group: "holdout", questionId: "place_opening_hours", locale: "zh", city: "shanghai",
    question: QUESTION_TEXT.place_opening_hours.zh, kind: "budget_exhausted", claims: [],
    corpus: corpusFor("place_opening_hours", [], 103), citedFactIds: [],
    expected: { kind: "budget_exhausted" },
  },
  {
    id: "diversity-getting-started-partial-en", group: "development", questionId: "payment_getting_started", locale: "en", city: "beijing",
    // Simulates a revoked/expired statement: knowledge_read_v1 would simply omit it from
    // an already-scoped response (its own SQL filters expiry/status before this module
    // ever sees the row), so "one required claim's statement was revoked" looks
    // identical, from this module's side, to "the corpus never had it" -- corpus
    // includes only 2 of the 4 required claims' statements.
    question: QUESTION_TEXT.payment_getting_started.en, kind: "partial_coverage", claims: gettingStartedClaims,
    corpus: corpusFor("payment_getting_started", gettingStartedClaims, 104).slice(0, 2),
    citedFactIds: corpusFor("payment_getting_started", gettingStartedClaims, 104).slice(0, 2).map((s) => s.factId),
    expected: { kind: "answered" },
  },
];

export const scenarios: readonly Scenario[] = [...nonPlace, ...place, ...diversity];
