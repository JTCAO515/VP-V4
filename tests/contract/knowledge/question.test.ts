import assert from "node:assert/strict";
import test from "node:test";
import { knowledgeQuestionScope } from "../../../lib/server/knowledge/claim/question.ts";

test("explicit question binds version, city and language without accepting free text or extra scope", () => {
  const query = "questionId=rail_boarding_documents&questionVersion=1&city=shanghai&locale=en";
  assert.deepEqual(knowledgeQuestionScope(new URL("https://example.test/?" + query)), {
    questionId: "rail_boarding_documents", questionVersion: 1, city: "shanghai", locale: "en",
  });
  for (const invalid of [query + "&text=Also+buy+a+ticket", query + "&locale=zh", query + "&scene=rail", query.replace("Version=1", "Version=2"),
    query.replace("shanghai", "unknown"), query.replace("locale=en", "locale=ar"), query.replace("rail_boarding_documents", "anything")]) {
    assert.equal(knowledgeQuestionScope(new URL("https://example.test/?" + invalid)), null);
  }
});
