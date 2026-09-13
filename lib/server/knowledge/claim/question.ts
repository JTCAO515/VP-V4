import { reviewedQuestionId, type ReviewedQuestionId } from "./questions.ts";
import { KNOWLEDGE_CITIES, type KnowledgeCity } from "../publication/statement.ts";

/** Explicit first-party question, not free-form Ask interpretation or a task admission. */
export type KnowledgeQuestion = Readonly<{
  questionId: ReviewedQuestionId;
  questionVersion: 1;
  city: KnowledgeCity;
  locale: "zh" | "en";
}>;
export function knowledgeQuestionScope(url: URL): KnowledgeQuestion | null {
  if (url.searchParams.size !== 4 || [...url.searchParams.keys()].some(key => !["questionId", "questionVersion", "city", "locale"].includes(key))
    || reviewedQuestionId(url.searchParams.get("questionId")) === null || url.searchParams.get("questionVersion") !== "1") return null;
  const city = url.searchParams.get("city") as KnowledgeCity, locale = url.searchParams.get("locale");
  return KNOWLEDGE_CITIES.includes(city) && (locale === "zh" || locale === "en")
    ? { questionId: reviewedQuestionId(url.searchParams.get("questionId"))!, questionVersion: 1, city, locale } : null;
}
