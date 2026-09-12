import { KNOWLEDGE_CITIES, type KnowledgeCity } from "../publication/statement.ts";

/** Explicit first-party question, not free-form Ask interpretation or a task admission. */
export type KnowledgeQuestion = Readonly<{
  questionId: "rail_boarding_documents";
  questionVersion: 1;
  city: KnowledgeCity;
  locale: "zh" | "en";
}>;
export function knowledgeQuestionScope(url: URL): KnowledgeQuestion | null {
  if (url.searchParams.size !== 4 || [...url.searchParams.keys()].some(key => !["questionId", "questionVersion", "city", "locale"].includes(key))
    || url.searchParams.get("questionId") !== "rail_boarding_documents" || url.searchParams.get("questionVersion") !== "1") return null;
  const city = url.searchParams.get("city") as KnowledgeCity, locale = url.searchParams.get("locale");
  return KNOWLEDGE_CITIES.includes(city) && (locale === "zh" || locale === "en")
    ? { questionId: "rail_boarding_documents", questionVersion: 1, city, locale } : null;
}
