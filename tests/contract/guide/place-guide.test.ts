import test from "node:test";
import assert from "node:assert/strict";
import { parseGuideCommand, type GuideReady } from "../../../lib/server/guide/contract.ts";
import { caption, decodeGuideOutcome, decodeGuideReady, shortNarration } from "../../../lib/server/guide/projection.ts";
import { GuideError, runGuide } from "../../../lib/server/guide/service.ts";

const trip = "00000000-0000-4000-8000-000000000001", ref = "00000000-0000-4000-8000-000000000002";
const poi = "00000000-0000-4000-8000-000000000003", id = "00000000-0000-4000-8000-000000000004";
const op = "00000000-0000-4000-8000-000000000005", turn = "00000000-0000-4000-8000-000000000006";
const digest = "a".repeat(64), now = Date.parse("2026-10-05T12:00:00Z");
const read = { action: "read" as const, expectedTripVersion: 0, placeReferenceId: ref, locale: "en" as const, interest: "general" as const };
const ready = (): GuideReady => ({ kind: "ready", version: 1, tripId: trip, tripVersion: 0, placeReferenceId: ref,
  canonicalPoiId: poi, place: { en: "Synthetic place", zh: "合成地点" }, locale: "en", interest: "general", digest,
  evaluatedAt: new Date(now).toISOString(), expiresAt: new Date(now + 60000).toISOString(),
  rights: { revision: 1, display: true, tts: false, cache: false, prompt: false },
  segments: [{ id, kind: "fact", subjectId: "synthetic_place", predicate: "located_at", factId: ref, factVersion: 1,
    assertionId: id, assertionRevision: 1, text: "The synthetic place is at the reviewed address.", conditions: ["Use only this branch."],
    exclusions: ["This is not an admission guarantee."], reviewedAt: new Date(now - 60000).toISOString(), expiresAt: new Date(now + 60000).toISOString(),
    sources: [{ sourceRevisionId: op, revisionLabel: "synthetic-1", publisher: "Owned fixture", uri: "urn:vpj15:synthetic:guide", locator: "fixture:1" }] }],
  completedSegmentIds: [], replayAskUnits: 0, narration: "published_facts", unsupportedNarratives: ["history", "legend"], generationCost: null });

test("closed selection accepts real head0 and rejects caller authority / inferred interests", () => {
  assert.deepEqual(parseGuideCommand(read), read);
  for (const field of ["ownerId", "canonicalPoiId", "rights", "source", "cost", "history", "memory", "city"]) assert.equal(parseGuideCommand({ ...read, [field]: true }), null);
  for (const expectedTripVersion of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) assert.equal(parseGuideCommand({ ...read, expectedTripVersion }), null);
  for (const locale of ["es", "EN"]) assert.equal(parseGuideCommand({ ...read, locale }), null);
  assert.equal(parseGuideCommand({ ...read, interest: ["address", "history"] }), null);
  for (const key of ["locale", "interest", "action"]) {
    for (const bad of [[read[key as keyof typeof read]], {}, { toString: 42 }]) assert.equal(parseGuideCommand({ ...read, [key]: bad }), null);
  }
});
test("RL-02 / RL-06 ready requires exact selection, current projection, separate use permissions", () => {
  const source = ready(); assert.deepEqual(decodeGuideReady(source, trip, read, now), source);
  for (const change of [{ tripId: poi }, { placeReferenceId: op }, { locale: "zh" }, { interest: "opening_hours" },
    { expiresAt: new Date(now).toISOString() }, { evaluatedAt: new Date(now - 30001).toISOString() },
    { completedSegmentIds: [id] }, { rights: { ...source.rights, display: false } },
    { rights: { ...source.rights, tts: "true" } }, { generationCost: 0 }, { narration: "legend" }]) {
    assert.equal(decodeGuideReady({ ...source, ...change }, trip, read, now), null);
  }
  const stale = { ...source, segments: [{ ...source.segments[0], expiresAt: new Date(now - 1).toISOString() }] };
  assert.equal(decodeGuideReady(stale, trip, read, now), null);
  assert.equal(decodeGuideReady({ ...source, segments: [{ ...source.segments[0], sources: [] }] }, trip, read, now), null);
  assert.equal(decodeGuideReady({ ...source, segments: [source.segments[0], source.segments[0]] }, trip, read, now), null);
});
test("RL-04 subtitles retain all negations; long text is rejected whole rather than clipped", () => {
  const s = ready().segments[0];
  assert.equal(caption(s), "The synthetic place is at the reviewed address.\nUse only this branch.\nThis is not an admission guarantee.");
  assert.equal(shortNarration([s], "en"), true);
  assert.equal(shortNarration([{ ...s, text: "word ".repeat(241).trim() }], "en"), false);
  assert.equal(shortNarration([{ ...s, text: "字".repeat(481), conditions: [], exclusions: [] }], "zh"), false);
});
test("replay has zero Ask units but rechecks exact digest; progress requires cache and current segments", () => {
  const replay = { ...read, action: "replay" as const, expectedDigest: digest };
  assert.ok(decodeGuideReady(ready(), trip, replay, now));
  assert.equal(decodeGuideReady({ ...ready(), digest: "b".repeat(64) }, trip, replay, now), null);
  const progress = { ...read, action: "progress" as const, operationId: op, expectedDigest: digest, completedSegmentIds: [id] };
  const cached = { ...ready(), rights: { ...ready().rights, cache: true }, completedSegmentIds: [id] };
  assert.ok(decodeGuideReady(cached, trip, progress, now));
  assert.equal(decodeGuideReady(cached, trip, { ...progress, completedSegmentIds: [poi] }, now), null);
  assert.equal(decodeGuideReady({ ...cached, replayAskUnits: 1 }, trip, replay, now), null);
});
test("follow-up exact original task/op receipt preserves unknown cost and never accepts another turn", async () => {
  const input = { ...read, action: "follow_up" as const, operationId: op, expectedDigest: digest, question: "Where is the entrance?",
    threadId: ref, turnId: turn, policyId: poi, serviceTask: { id, scopeVersion: 1 as const, relationship: "new_goal" as const, parentTurnId: null } };
  const submitted = { kind: "submitted", version: 1, operationId: op, tripId: trip, turnId: turn, serviceTaskId: id,
    scopeVersion: 1, relationship: "new_goal", parentTurnId: null, guideDigest: digest, reused: false, generationCost: null };
  assert.deepEqual(parseGuideCommand(input), input);
  for (const relationship of [["new_goal"], {}, { toString: 42 }]) assert.equal(parseGuideCommand({ ...input, serviceTask: { ...input.serviceTask, relationship } }), null);
  assert.deepEqual(decodeGuideOutcome(submitted, trip, input, now), submitted);
  assert.equal(decodeGuideOutcome({ ...submitted, generationCost: 0 }, trip, input, now), null);
  assert.equal(decodeGuideOutcome({ ...submitted, turnId: poi }, trip, input, now), null);
  const calls: unknown[] = [];
  assert.deepEqual(await runGuide(trip, input, { current: async () => true, now: () => now, rpc: async (name, params) => {
    calls.push([name, params]); return { data: submitted, error: null };
  } }), submitted);
  assert.deepEqual(calls, [["guide_place_v1", { p_trip: trip, p_input: input }]]);
});
test("lost actor prevents output; revoked sources allow owned forget without current factual projection", async () => {
  let reads = 0;
  await assert.rejects(runGuide(trip, read, { current: async () => ++reads === 1, now: () => now,
    rpc: async () => ({ data: ready(), error: null }) }), (e: unknown) => e instanceof GuideError && e.code === "UNAUTHENTICATED");
  const forget = { ...read, action: "forget" as const, operationId: op };
  assert.deepEqual(await runGuide(trip, forget, { current: async () => true, now: () => now,
    rpc: async () => ({ data: { kind: "forgotten", operationId: op }, error: null }) }), { kind: "forgotten", operationId: op });
  const exported = { kind: "export", version: 1, scope: "guide-metadata/1", tripId: trip, placeReferenceId: ref, records: [{ digest, canonicalPoiId: poi,
    locale: "en", interest: "general", rightsRevision: 1, completedSegmentIds: [id], expiresAt: new Date(now - 1).toISOString(), updatedAt: new Date(now).toISOString() }] };
  const input = { ...read, action: "export" as const };
  assert.ok(decodeGuideOutcome(exported, trip, input, now));
  assert.equal(decodeGuideOutcome({ ...exported, scope: "all-user-data" }, trip, input, now), null);
  assert.equal(decodeGuideOutcome({ ...exported, records: [{ ...exported.records[0], text: "withdrawn content" }] }, trip, input, now), null);
});
