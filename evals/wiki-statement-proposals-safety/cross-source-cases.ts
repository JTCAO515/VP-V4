/**
 * VPJ-75 (#359) frozen bilingual materials, named as missing in
 * artifacts/VPJ-75/unrun.md ("Contradiction/conflict handling... no logic
 * exists to surface 'these two sources disagree' to a reviewer", "Multi-source
 * synthesis. Every real call so far used exactly one source text", and
 * EXECUTION-CONTRACT.md#vpj-75's acceptance bullet "固定中英材料覆盖相互矛盾、
 * 条件/例外、跨城市差异及注入").
 *
 * Each case supplies TWO real ProposalSource snapshots (never a single merged
 * blob) and the two structured statements a caller would build from them, so
 * the eval test exercises the actual multi-source evidence-binding path in
 * lib/server/knowledge/wiki/proposals.ts (resolveProposalOutput) with
 * realistic bilingual travel content, plus the actual detectProposalConflicts
 * structural conflict flag on the result. This is deterministic and
 * fixture-only -- it proves the *validation/detection code* behaves
 * correctly given realistic contradictory/cross-city/condition-bearing
 * source text; it is not a test of whether a real model would faithfully
 * summarize that text (see wiki-statement-proposals-safety.evals.test.ts's
 * header comment for the same caveat applied consistently across this repo).
 */

export type CrossSourceCategory = "same_city_contradiction" | "cross_city_difference" | "condition_exception";

export type CrossSourceCase = Readonly<{
  id: string;
  locale: "zh" | "en";
  category: CrossSourceCategory;
  sourceA: Readonly<{ key: string; city: "shanghai" | "beijing"; snippet: string }>;
  sourceB: Readonly<{ key: string; city: "shanghai" | "beijing"; snippet: string }>;
  objectIdA: string;
  objectIdB: string;
  conditionsA: readonly string[];
  conditionsB: readonly string[];
  /** Whether two real proposals built from A and B ought to be flagged by
   * detectProposalConflicts, and why -- a cross-city difference must never
   * be flagged; a same-city contradiction or condition/exception disagreement
   * always must be. */
  expectConflict: boolean;
  expectedReason: "objectId" | "conditions" | null;
}>;

export const crossSourceCases: readonly CrossSourceCase[] = [
  {
    id: "same-city-contradiction-zh", locale: "zh", category: "same_city_contradiction",
    sourceA: { key: "sh-notice-1", city: "shanghai", snippet: "根据商户告示，上海地铁闸机接受非接触式银行卡入闸。" },
    sourceB: { key: "sh-notice-2", city: "shanghai", snippet: "根据最新通知，上海地铁闸机现已拒绝所有非接触式银行卡入闸。" },
    objectIdA: "contactless_bank_card", objectIdB: "no_card_accepted", conditionsA: [], conditionsB: [],
    expectConflict: true, expectedReason: "objectId",
  },
  {
    id: "same-city-contradiction-en", locale: "en", category: "same_city_contradiction",
    sourceA: { key: "sh-notice-1-en", city: "shanghai", snippet: "According to a merchant notice, Shanghai metro gates accept contactless bank cards for entry." },
    sourceB: { key: "sh-notice-2-en", city: "shanghai", snippet: "According to an updated notice, Shanghai metro gates now reject all contactless bank cards for entry." },
    objectIdA: "contactless_bank_card", objectIdB: "no_card_accepted", conditionsA: [], conditionsB: [],
    expectConflict: true, expectedReason: "objectId",
  },
  {
    id: "cross-city-difference-zh", locale: "zh", category: "cross_city_difference",
    sourceA: { key: "sh-gate", city: "shanghai", snippet: "上海地铁闸机接受非接触式银行卡入闸。" },
    sourceB: { key: "bj-gate", city: "beijing", snippet: "北京地铁闸机仅接受一卡通App入闸，不支持非接触式银行卡。" },
    objectIdA: "contactless_bank_card", objectIdB: "yikatong_app", conditionsA: [], conditionsB: [],
    expectConflict: false, expectedReason: null,
  },
  {
    id: "cross-city-difference-en", locale: "en", category: "cross_city_difference",
    sourceA: { key: "sh-gate-en", city: "shanghai", snippet: "Shanghai metro gates accept contactless bank cards for entry." },
    sourceB: { key: "bj-gate-en", city: "beijing", snippet: "Beijing metro gates only accept the Yikatong app for entry; contactless bank cards are not supported." },
    objectIdA: "contactless_bank_card", objectIdB: "yikatong_app", conditionsA: [], conditionsB: [],
    expectConflict: false, expectedReason: null,
  },
  {
    id: "condition-exception-zh", locale: "zh", category: "condition_exception",
    sourceA: { key: "sh-peak", city: "shanghai", snippet: "早高峰时段，上海地铁闸机仅接受非接触式银行卡完成入闸。" },
    sourceB: { key: "sh-offpeak", city: "shanghai", snippet: "非早高峰时段，上海地铁闸机仅接受非接触式银行卡完成入闸，且需提前登记。" },
    objectIdA: "contactless_bank_card", objectIdB: "contactless_bank_card",
    conditionsA: ["morning_peak"], conditionsB: ["off_peak_registered"],
    expectConflict: true, expectedReason: "conditions",
  },
  {
    id: "condition-exception-en", locale: "en", category: "condition_exception",
    sourceA: { key: "sh-peak-en", city: "shanghai", snippet: "During morning peak hours, Shanghai metro gates accept only contactless bank cards for entry." },
    sourceB: { key: "sh-offpeak-en", city: "shanghai", snippet: "Outside morning peak hours, Shanghai metro gates accept only contactless bank cards for entry, and prior registration is required." },
    objectIdA: "contactless_bank_card", objectIdB: "contactless_bank_card",
    conditionsA: ["morning_peak"], conditionsB: ["off_peak_registered"],
    expectConflict: true, expectedReason: "conditions",
  },
];
