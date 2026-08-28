import assert from "node:assert/strict";
import test from "node:test";
import { applyFixtureCorrection, translateFixtureDocument } from "../../../lib/server/media-translation/fixture-translation.ts";

test("AI-31 preserves missing confidence and rejects arbitrary content", () => {
  const result = translateFixtureDocument({ fixtureId: "fixture-zh" });
  assert.equal(result.kind, "fixture_translation");
  if (result.kind !== "fixture_translation") throw new Error("expected fixture translation");
  assert.deepEqual(result.fields.map((field) => [field.id, field.state, field.translation]), [["menu", "missing", null], ["address", "translated", "synthetic-zh-address"], ["money", "translated", "synthetic-zh-money"], ["station", "translated", "synthetic-zh-station"], ["ticket", "translated", "synthetic-zh-ticket"]]);
  assert.equal(translateFixtureDocument({ fixtureId: "fixture-de" }).kind, "translation_unavailable");
  assert.equal(translateFixtureDocument({ fixtureId: "fixture-zh", source: "passport-number-123" }).kind, "translation_unavailable");
});

test("AI-31 correction supersedes only a closed synthetic revision", () => {
  assert.deepEqual(applyFixtureCorrection({ fixtureId: "fixture-zh", fieldId: "menu", correctionCode: "synthetic_correction", revisionId: "revision-2" }), { kind: "corrected_revision", documentId: "fixture-zh", revision: 2, fieldId: "menu", text: "synthetic_correction", mtState: "superseded", ttsState: "superseded" });
  assert.equal(applyFixtureCorrection({ fixtureId: "fixture-zh", fieldId: "menu", correctionCode: "user-private-text", revisionId: "revision-2" }).kind, "translation_unavailable");
});
