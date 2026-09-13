/** Server-owned obligations. Definitions route reviewed relations; they contain no facts or publication IDs. */
export type QuestionClaim = Readonly<{ subjectId: string; predicate: string; objectId: string }>;
const rail = [
  { subjectId: "rail_eticket_boarding", predicate: "requires_document", objectId: "original_valid_booking_id" },
  { subjectId: "rail_eticket_boarding", predicate: "requires_document", objectId: "valid_ticket_not_itinerary_or_receipt" },
] as const;
const card = { subjectId: "international_card_payment", predicate: "requires_action", objectId: "merchant_acceptance_check" } as const;
const mobile = { subjectId: "alipay_weixin_pay", predicate: "offers_procedure", objectId: "supported_card_merchant_qr_payment" } as const;
const cash = [
  { subjectId: "rmb_cash_access", predicate: "offers_procedure", objectId: "international_card_atm_withdrawal" },
  { subjectId: "rmb_cash_access", predicate: "offers_procedure", objectId: "marked_currency_exchange" },
] as const;

const simDocuments = { subjectId: "china_carrier_sim_application", predicate: "requires_document", objectId: "passport_or_foreign_permanent_resident_id" } as const;
const simPlan = { subjectId: "china_carrier_sim_application", predicate: "requires_action", objectId: "plan_allowance_check" } as const;

/** A revoked relation remains an obligation and must produce a gap, never disappear from coverage. */
export const QUESTION_DEFINITIONS = {
  rail_boarding_documents: { scene: "rail", claims: rail },
  payment_card_acceptance: { scene: "payment", claims: [card] },
  payment_mobile_setup: { scene: "payment", claims: [mobile] },
  payment_cash_access: { scene: "payment", claims: cash },
  payment_card_and_mobile: { scene: "payment", claims: [card, mobile] },
  payment_card_and_cash: { scene: "payment", claims: [card, ...cash] },
  payment_mobile_and_cash: { scene: "payment", claims: [mobile, ...cash] },
  payment_getting_started: { scene: "payment", claims: [card, mobile, ...cash] },
  connectivity_sim_documents: { scene: "connectivity", claims: [simDocuments] },
  connectivity_plan_allowances: { scene: "connectivity", claims: [simPlan] },
  connectivity_getting_started: { scene: "connectivity", claims: [simDocuments, simPlan] },
} as const;
export type ReviewedQuestionId = keyof typeof QUESTION_DEFINITIONS;
export function reviewedQuestionId(value: unknown): ReviewedQuestionId | null {
  return typeof value === "string" && Object.hasOwn(QUESTION_DEFINITIONS, value) ? value as ReviewedQuestionId : null;
}
export function questionDefinition(value: unknown): Readonly<{ scene: "rail" | "payment" | "connectivity"; claims: readonly QuestionClaim[] }> | null {
  const id = reviewedQuestionId(value);
  return id ? QUESTION_DEFINITIONS[id] : null;
}
