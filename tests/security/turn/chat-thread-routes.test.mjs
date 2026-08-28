import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("V4-08 chat thread routes are private, same-origin for creation, and never use a service credential", () => {
  const collection = readFileSync("app/api/chat/threads/route.ts", "utf8");
  const item = readFileSync("app/api/chat/threads/[threadId]/route.ts", "utf8");
  const turn = readFileSync("app/api/chat/threads/[threadId]/turns/route.ts", "utf8");
  const cancel = readFileSync("app/api/chat/turns/[turnId]/cancel/route.ts", "utf8");
  const events = readFileSync("app/api/chat/turns/[turnId]/events/route.ts", "utf8");
  const feedback = readFileSync("app/api/chat/turns/[turnId]/feedback/route.ts", "utf8");
  assert.match(collection, /createUserDataAdapter/);
  assert.match(collection, /isSameOriginMutation/);
  assert.match(collection, /isChatThreadInput/);
  assert.match(item, /isUuid\(threadId\)/);
  assert.match(turn, /isChatTurnStartInput/);
  assert.match(turn, /isSameOriginMutation/);
  assert.match(cancel, /isSameOriginMutation/);
  assert.match(events, /afterSequence/);
  assert.match(feedback, /isTurnFeedbackInput/);
  assert.match(feedback, /isSameOriginMutation/);
  assert.doesNotMatch(`${collection}\n${item}\n${turn}\n${cancel}\n${events}\n${feedback}`, /SERVICE_ROLE|service_role|SUPABASE_SERVICE/);
  assert.match(collection, /Cache-Control": "private, no-store/);
});
