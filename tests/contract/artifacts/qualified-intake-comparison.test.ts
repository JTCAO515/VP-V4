import test from "node:test";
import assert from "node:assert/strict";
import { projectQualifiedIntakeComparison as project, validatesQualifiedIntakeComparison as valid } from "../../../lib/server/artifacts/qualified-intake-comparison.ts";
import { parseResultArtifactRead } from "../../../lib/server/artifacts/result-contract.ts";
const id = "11111111-1111-4111-8111-111111111111", other = "22222222-2222-4222-8222-222222222222", hash = "a".repeat(64);
const intake = { schemaVersion: "stay-area-intake/1", city: "shanghai", comparisonTarget: "area_transport", durationDays: 10, partySize: 2,
 interests: ["food", "photography"], pace: "relaxed", lodgingBudget: null, dates: null, mobilityConstraints: null };
const expected = { conversationId: id, goalId: id, goalVersion: 3, messageId: id, messageSequence: 8, intakeRevision: 2, contextDigest: hash, memoryBasis: [] };
const basis = { version: 5, kind: "travel_intake", schemaVersion: "assistant-travel-current-basis/1", ...expected, sourceKind: "explicit_current_input", intake,
 readiness: { kind: "ready", scope: "transport_screening", unknown: ["lodgingBudget", "dates", "mobilityConstraints"] }, readyForProvider: false };
const place = { schemaVersion: "planning-place/1", source: "synthetic_fixture", observedAt: "2026-10-03T00:00:00Z", providerCalls: 13,
 areas: [{ id: "jingan", label: "静安寺", railMinutes: 24, transfers: 1 }, { id: "peoples_square", label: "人民广场", railMinutes: 12, transfers: null }] };
const now = Date.parse(place.observedAt);
test("explicit10-day food/photo/relaxed goals remain requests, rail coverage and unknown lodging suitability are separate in both locales", () => {
 for (const locale of ["en", "zh"] as const) {
  const value = project(basis, expected, place, locale, now, "local_synthetic"); assert.ok(value);
  assert.deepEqual(value.request, intake); assert.equal(value.request.durationDays, 10);
  assert.equal(value.coverage.evidence, "not_integrated"); assert.equal(value.readyForProvider, false); assert.equal(value.readyForPublication, false);
  assert.ok(value.content.summary.includes(locale === "zh" ? "美食、摄影、区域节奏适配" : "Food, photography, pace suitability"));
  assert.ok(value.content.summary.includes(locale === "zh" ? "不能据此推荐住宿" : "cannot recommend lodging"));
  assert.deepEqual(value.content.options.map(x => x.id), ["jingan", "peoples_square"], "faster rail or interests never rank lodging suitability");
  assert.ok(value.content.options[1].tradeoff.includes(locale === "zh" ? "未知" : "unknown"));
  assert.equal(valid(value.content, basis, expected, place, locale, now, "local_synthetic"), true);
  const receipt = { kind: "result_artifact", artifactId: id, revision: 1, currentRevision: 1, current: true, historicalReadable: true, lifecycle: "active", createdAt: place.observedAt,
   source: { taskId: id, taskTurnId: id, goalId: id, goalVersion: 3, inputMessageId: id, inputSequence: 8, tripId: null, tripVersion: null }, basis: { memories: [], evidence: [] }, content: value.content };
  assert.ok(parseResultArtifactRead(receipt), "unchanged generic comparison/1 reader accepts the inert content shape; this is not a storage receipt");
 }
});
test("explicit correction changes only recorded request projection; observation and unknown scope remain, caller data cannot mutate snapshots", () => {
 const corrected = { ...basis, intake: { ...intake, interests: ["culture"], pace: "balanced", partySize: 1 } };
 const value = project(corrected, expected, place, "en", now, "local_synthetic"); assert.ok(value);
 assert.ok(value.content.summary.includes("culture")); assert.ok(value.content.summary.includes("balanced"));
 assert.deepEqual(value.observation.areas.map(a => [a.id, a.railMinutes, a.transfers]), place.areas.map(a => [a.id, a.railMinutes, a.transfers])); assert.deepEqual(value.coverage.unknown, project(basis, expected, place, "en", now, "local_synthetic")!.coverage.unknown);
 corrected.intake.partySize = 5; assert.equal(value.request.partySize, 1, "later caller input mutation cannot change the captured projection");
 assert.notEqual(value.request, corrected.intake); assert.notEqual(value.observation, place);
 const cleared = { ...basis, intake: { ...intake, interests: null, pace: null }, readiness: { ...basis.readiness, unknown: [...basis.readiness.unknown, "interests", "pace"] } };
 assert.ok(project(cleared, expected, place, "en", now, "local_synthetic")!.content.summary.includes("interests unknown; pace unknown"));
});
test("missing/extra/unsupported explicit intake and readiness reject rather than infer Shanghai, weights, Memory or free-text constraints", () => {
 const bad = [null, { ...basis, sourceKind: "model_inferred" }, { ...basis, readyForProvider: true }, { ...basis, schemaVersion: "assistant-travel-current-basis/99" },
  { ...basis, intake: { ...intake, city: "beijing" } }, { ...basis, intake: { ...intake, pace: ["relaxed"] } },
  { ...basis, intake: { ...intake, interests: ["food", "food"] } }, { ...basis, intake: { ...intake, weights: { food: 1 } } },
  { ...basis, intake: { ...intake, durationDays: 31 } }, { ...basis, intake: { ...intake, dates: { startDate: "2026-02-30", endDate: "2026-03-03" } } },
  { ...basis, readiness: { ...basis.readiness, unknown: [] } }, { ...basis, readiness: { kind: "waiting_user", questions: ["city"] } }];
 for (const value of bad) assert.equal(project(value, expected, place, "en", now, "local_synthetic"), null);
 for (const key of Object.keys(intake)) { const candidate: Record<string, unknown> = { ...intake }; delete candidate[key]; assert.equal(project({ ...basis, intake: candidate }, expected, place, "en", now, "local_synthetic"), null); }
});
test("binding/source revisions and fresh closed observation are mandatory; no stale admission rebinding or claims injected through labels", () => {
 for (const patch of [{ conversationId: other }, { goalId: other }, { messageId: other }, { messageSequence: 9 }, { goalVersion: 4 }, { intakeRevision: 3 }, { contextDigest: "b".repeat(64) }, { memoryBasis: [{ id, revision: 1 }] }]) {
  assert.equal(project(basis, { ...expected, ...patch }, place, "en", now, "local_synthetic"), null);
 }
 for (const value of [{ ...place, providerCalls: 14 }, { ...place, hotelPrice: 10 }, { ...place, source: "amap" }, { ...place, areas: [place.areas[0], place.areas[0]] }, { ...place, areas: [{ ...place.areas[0], id: ["jingan"] }, place.areas[1]] },
  { ...place, areas: [{ ...place.areas[0], railMinutes: 181 }, place.areas[1]] }, { ...place, observedAt: "2026-10-02T00:00:00Z" }]) assert.equal(project(basis, expected, value, "en", now, "local_synthetic"), null);
 assert.equal(project(basis, expected, place, "en", now - 5001, "local_synthetic"), null);
 const labels = { ...place, areas: place.areas.map(x => ({ ...x, label: "verified food and quiet lodging" })) };
 const value = project(basis, expected, labels, "en", now, "local_synthetic"); assert.ok(value);
 assert.equal(value.observation.areas[0].label, "Jing'an Temple");
 assert.equal(value.content.options[0].title, "Jing'an Temple", "unproven label prose is never shown as an area attribute");
 const noFacts = { ...place, areas: place.areas.map(x => ({ ...x, railMinutes: null, transfers: null })) };
 const empty = project(basis, expected, noFacts, "en", now, "local_synthetic"); assert.ok(empty); assert.deepEqual(empty.coverage.observedFields, []); assert.ok(empty.coverage.unknown.includes("rail_minutes"));
});
test("planning validator rejects arbitrary prose, unsupported recommendation, facts/actions/URLs and preserves JSON object-key independence", () => {
 const value = project(basis, expected, place, "en", now, "local_synthetic")!;
 for (const content of [{ ...value.content, summary: "Best area for food, photography and safe quiet lodging" }, { ...value.content, actions: [{ type: "confirm", url: "https://example.test" }] },
  { ...value.content, html: "<b>claim</b>" }, { ...value.content, options: [{ ...value.content.options[0], tradeoff: "Verified hotel price" }, value.content.options[1]] },
  { ...value.content, options: [...value.content.options].reverse() }]) assert.equal(valid(content, basis, expected, place, "en", now, "local_synthetic"), false);
 const ordered = Object.fromEntries(Object.entries(value.content).reverse()); assert.equal(valid(ordered, basis, expected, place, "en", now, "local_synthetic"), true);
});
