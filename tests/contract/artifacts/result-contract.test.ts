import test from "node:test";
import assert from "node:assert/strict";
import { parseResultArtifactRead } from "../../../lib/server/artifacts/result-contract.ts";

const id = "11111111-1111-4111-8111-111111111111";
const read = () => ({
  kind: "result_artifact", artifactId: id, revision: 1, currentRevision: 1, current: true,
  historicalReadable: true, lifecycle: "active", createdAt: "2026-09-27T00:00:00Z",
  source: { taskId: id, taskTurnId: id, goalId: id, goalVersion: 1, inputMessageId: id, inputSequence: 1, tripId: null, tripVersion: null },
  basis: { memories: [], evidence: [] },
  content: { schemaVersion: "comparison/1", title: "Synthetic comparison", summary: "Two unverified options.",
    options: [{ id: "a", title: "A", tradeoff: "Unknown time" }, { id: "b", title: "B", tradeoff: "Unknown availability" }], actions: [] },
});

test("comparison renderer accepts only a closed, inert revision", () => {
  assert.equal(parseResultArtifactRead(read())?.artifactId, id);
  assert.equal(parseResultArtifactRead({ ...read(), content: { ...read().content, schemaVersion: "comparison/2" } }), null);
  assert.equal(parseResultArtifactRead({ ...read(), content: { ...read().content, actions: [{ kind: "open_url", url: "https://example.test" }] } }), null);
  assert.equal(parseResultArtifactRead({ ...read(), content: { ...read().content, html: "<script>bad</script>" } }), null);
  assert.equal(parseResultArtifactRead({ ...read(), currentRevision: 2 }), null);
  assert.equal(parseResultArtifactRead({ ...read(), basis: { memories: [], evidence: [{ id }] } }), null);
});
