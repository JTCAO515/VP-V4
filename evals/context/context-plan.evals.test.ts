import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { assembleContext, createContextPlan, type ContextCandidate } from "../../lib/server/context/index.ts";

const fixture = JSON.parse(readFileSync(new URL("../../artifacts/V4-02/context-fixtures.json", import.meta.url), "utf8")) as {
  readonly fixtureVersion: string;
  readonly containsRawPersonalData: boolean;
  readonly actorId: string;
  readonly fullHistory: readonly ContextCandidate[];
  readonly compacted: readonly ContextCandidate[];
  readonly prohibitedIds: readonly string[];
};

const plan = createContextPlan({ taskProfile: "trip_planning", riskClass: "elevated" });

test("V4-02 preserves hard constraints across full-history and compacted thread contexts", () => {
  const fullHistory = assembleContext({ plan, actorId: fixture.actorId, candidates: fixture.fullHistory });
  const compacted = assembleContext({ plan, actorId: fixture.actorId, candidates: fixture.compacted });

  assert.equal(fixture.fixtureVersion, "v4-02-context-1");
  assert.equal(fixture.containsRawPersonalData, false);
  assert.deepEqual(
    fullHistory.sections.find((section) => section.kind === "constraints"),
    compacted.sections.find((section) => section.kind === "constraints"),
  );
  assert.equal(compacted.sections.at(-1)?.kind, "user_message");
});

test("V4-02 context eval records zero prohibited source leaks", () => {
  const assembled = assembleContext({ plan, actorId: fixture.actorId, candidates: fixture.fullHistory });
  const includedIds = new Set(assembled.manifest.sourceRefs.map((ref) => ref.id));

  for (const prohibitedId of fixture.prohibitedIds) assert.equal(includedIds.has(prohibitedId), false, prohibitedId);
  assert.equal(JSON.stringify(assembled.manifest).includes(fixture.actorId), false);
  assert.equal(assembled.manifest.omittedReasons.length, fixture.prohibitedIds.length);
});
