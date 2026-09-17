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

export const versions = Object.freeze({ corpus: "wiki-agentic-search-eval/2", claims: QUESTION_ONTOLOGY_VERSION });

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
  // v2 (2026-09-17, round 24): named a concrete, synthetic attraction
  // instead of the generic "the named attraction" placeholder -- see
  // artifacts/VPJ-76/unrun.md's item (b) and
  // wiki-frozen-eval-real-model-20260916/verification.md's category-4
  // finding. In the real product, this module's `question` input is the
  // traveler's own raw input text (grounded-ai-assist.ts's
  // `context.inputText`), which names the actual place the traveler is
  // asking about -- a generic templated question that never names any
  // place is a fixture-realism gap this eval had, not a property of real
  // traffic. "Cloudscape Pavilion" / 云境阁 is a wholly synthetic,
  // fictional attraction name (matches this repo's synthetic-only-content
  // convention), used consistently across the question text and the
  // corpus statement text below so a real model has a genuine textual
  // anchor to match, exactly like every non-place question family already
  // does (e.g. rail/payment/connectivity statements name their own real
  // concepts instead of an underscored placeholder).
  place_address: { zh: "云境阁的地址在哪？", en: "Where is Cloudscape Pavilion located?" },
  place_opening_hours: { zh: "云境阁今天几点开门？", en: "What time does Cloudscape Pavilion open today?" },
  place_address_and_hours: { zh: "云境阁的地址和今天开放时间是？", en: "Where is Cloudscape Pavilion and what are today's hours?" },
};

// Natural-language statement text per claim objectId. A real model searches
// with natural-language queries against these via the plain lexical
// primitive (search-index.ts) -- an underscored-identifier placeholder like
// "satisfying the merchant_acceptance_check requirement" is not real
// findable prose and was found, in an early real-model smoke run against
// this eval, to produce false retrieval_miss results having nothing to do
// with the pipeline's own correctness. Kept close to (not copied from) the
// phrasing already used elsewhere in this codebase's own real-model-probe
// fixtures (wiki-search-convergence-20260915) for consistency.
const STATEMENT_TEXT: Readonly<Record<string, Readonly<{ zh: string; en: string }>>> = {
  original_valid_booking_id: { zh: "乘车须出示原始有效的订票号码，复印件或截图不予认可。", en: "Boarding requires presenting the original valid booking ID; a copy or screenshot is not accepted." },
  valid_ticket_not_itinerary_or_receipt: { zh: "乘车仅认可有效车票本身，行程单或购票凭证不能作为乘车凭证。", en: "Only the valid ticket itself is accepted for boarding, not an itinerary printout or purchase receipt." },
  merchant_acceptance_check: { zh: "该地区多数大型商户接受国际信用卡，使用前建议先向商户确认是否受理外卡。", en: "Most large merchants in this area accept international credit cards; travelers should confirm card acceptance with the merchant before relying on it." },
  supported_card_merchant_qr_payment: { zh: "支付宝和微信支付均支持扫描商户二维码，为已绑定的支持卡种完成付款。", en: "Both Alipay and WeChat Pay support scanning a merchant's QR code to complete payment for a linked, supported card." },
  international_card_atm_withdrawal: { zh: "持国际银行卡可在带有银联或对应网络标识的ATM机提取人民币现金。", en: "Travelers holding an international bank card can withdraw RMB cash at ATMs marked with the matching card network logo." },
  marked_currency_exchange: { zh: "可在机场、酒店或银行网点带有外币兑换标识的柜台兑换人民币现金。", en: "RMB cash can be exchanged at marked currency exchange counters in airports, hotels, or bank branches." },
  passport_or_foreign_permanent_resident_id: { zh: "境外旅客办理本地SIM卡需出示有效护照或外国人永久居留身份证。", en: "Foreign travelers must present a valid passport or a foreign permanent resident ID card to apply for a local SIM card." },
  plan_allowance_check: { zh: "购买SIM套餐前应核实其通话分钟数与流量额度是否满足实际使用需求。", en: "Before purchasing a SIM plan, travelers should verify its call-minute and data allowances meet their actual needs." },
  place_address: { zh: "云境阁的官方地址已在入口标识及官方信息渠道公布，建议出发前再次核对。", en: "Cloudscape Pavilion's official address is posted at its entrance and through official information channels; confirm it again before setting out." },
  opening_hours: { zh: "云境阁今日的官方开放时间已在入口标识及官方信息渠道公布，节假日可能调整。", en: "Cloudscape Pavilion's official opening hours for today are posted at its entrance and through official information channels; holidays may change them." },
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
      text: STATEMENT_TEXT[objectId],
    }];
  }
  return claims.map((claim, claimIndex) => ({
    factId: `fact-${questionId}-${index}-${claimIndex}`, assertionId: `assertion-${questionId}-${index}-${claimIndex}`,
    predicate: claim.predicate, objectId: claim.objectId, sourceId: `source-${questionId}-${index}-${claimIndex}`,
    text: STATEMENT_TEXT[claim.objectId] ?? { zh: `已审核信息：满足 ${claim.objectId} 的具体要求。`, en: `Reviewed information satisfying the ${claim.objectId} requirement.` },
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
    // Genuinely off-topic content (rail boarding documents), not a payment
    // statement -- an earlier version of this scenario reused the real
    // payment_card_acceptance statement itself (matching, not irrelevant), so
    // a real model correctly found and cited it, which is not what a
    // "retrieval miss" scenario is supposed to exercise (see
    // wiki-frozen-eval-real-model-20260916/verification.md, "self-authored
    // eval bug" for the real run that caught this).
    corpus: corpusFor("rail_boarding_documents", railClaims, 100), citedFactIds: [],
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
