import assert from "node:assert/strict";
import test from "node:test";
import { translateFixtureDocument } from "../../lib/server/media-translation/fixture-translation.ts";

const locales = ["zh", "en", "es", "ru", "ar"] as const;
const kinds = ["menu", "address", "money", "station", "ticket"] as const;
test("AI-31 fixture field-exact report covers five locales and five closed field kinds", () => {
  for (const sourceLocale of locales) for (const kind of kinds) {
    const outcome = translateFixtureDocument({ fixtureId: `fixture-${sourceLocale}` });
    assert.equal(outcome.kind, "fixture_translation");
    if (outcome.kind !== "fixture_translation") throw new Error("expected fixture translation");
    const field = outcome.fields.find((candidate) => candidate.id === kind);
    assert.deepEqual(field, {
      id: kind,
      kind,
      state: sourceLocale === "zh" && kind === "menu" ? "missing" : "translated",
      translation: sourceLocale === "zh" && kind === "menu" ? null : `synthetic-${sourceLocale}-${kind}`,
      geometry: { x: kinds.indexOf(kind), y: locales.indexOf(sourceLocale), width: 1, height: 1 },
    });
  }
});
