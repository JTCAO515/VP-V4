import assert from "node:assert/strict";
import test from "node:test";

import { decideAiSdkAdoption } from "../../../lib/server/model-gateway/spike/ml-01.ts";

test("AI-43 rejects unverified condition claims and retains thin HTTP adapters", () => {
  assert.deepEqual(decideAiSdkAdoption({ text: true, vision: false, strictTool: true, abortUsage: true, telemetryNoContent: true }), { kind: "reject", adapter: "thin_http" });
  assert.deepEqual(decideAiSdkAdoption({ text: true, vision: true, strictTool: true, abortUsage: true, telemetryNoContent: true }), { kind: "reject", adapter: "thin_http" });
});
