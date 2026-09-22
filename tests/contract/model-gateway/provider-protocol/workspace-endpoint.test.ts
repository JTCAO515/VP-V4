import test from "node:test";
import assert from "node:assert/strict";
import { createProviderHttpTransport, type HttpProviderConfiguration, type DestinationReceipt } from "../../../../lib/server/model-gateway/adapters/http-transport.ts";
import { LEGACY_QWEN_ENDPOINT, readQwenEndpoint } from "../../../../lib/server/model-gateway/adapters/provider-endpoints.ts";
import { groundedAiAssistProviderConfig } from "../../../../lib/server/turn/ai-assist-provider-config.ts";
import { invokeProviderProtocol, invokeTextProviderProtocol } from "../../../../lib/server/model-gateway/adapters/provider-protocol.ts";
import { budget, completion, request } from "./fixtures.ts";

const endpoint = "https://llm-fixture.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions";
const config: HttpProviderConfiguration = { provider: "qwen", endpoint, configurationId: "10000000-0000-4000-8000-000000000001", configurationVersion: 2, timeoutMs: 1000 };
const env = { VISEPANDA_QWEN_ENDPOINT: endpoint, VISEPANDA_GROUNDED_AI_ASSIST_PROVIDER: "qwen", VISEPANDA_GROUNDED_AI_ASSIST_CONFIG_ID: config.configurationId, VISEPANDA_GROUNDED_AI_ASSIST_CONFIG_VERSION: "2" };
const signal = () => new AbortController().signal;

test("workspace migration preserves protocol payload/usage/receipts and explicit legacy rollback", async () => {
  for (const selected of [endpoint, LEGACY_QWEN_ENDPOINT]) {
    const receipts: DestinationReceipt[] = [];
    const transport = createProviderHttpTransport({ ...config, endpoint: selected }, {
      qwenEndpoint: selected, credential: () => "SECRET_CANARY", recordDestination: async r => { receipts.push(r); },
      fetch: async (url, init) => {
        assert.equal(url, selected); assert.equal(init?.redirect, "manual");
        assert.equal(JSON.parse(String(init?.body)).model, "qwen3.7-plus-2026-05-26");
        return Response.json(completion("qwen"));
      },
    });
    const result = await invokeProviderProtocol(request("qwen"), budget(), transport, signal());
    assert.equal(result.kind, "protocol_validated"); assert.ok(result.usage);
    assert.deepEqual(receipts.map(r => r.phase), ["configured", "attempted", "response_buffered"]);
    assert.ok(receipts.every(r => r.endpoint === selected && r.configurationVersion === 2));
    assert.doesNotMatch(JSON.stringify(receipts), /SECRET_CANARY/);
  }
});

test("workspace allowlist rejects all unselected targets before credentials or dispatch", () => {
  let calls = 0;
  const deps = { qwenEndpoint: endpoint, credential: () => { calls++; return "key"; }, recordDestination: async () => {}, fetch: async () => { calls++; return Response.json({}); } };
  const bad = [LEGACY_QWEN_ENDPOINT, endpoint.replace("llm-fixture", "llm-foreign"), endpoint.replace("cn-beijing", "ap-southeast-1"), endpoint.replace("https:", "http:"), endpoint.replace("llm-fixture", "user@llm-fixture"), endpoint.replace(".com/", ".com:443/"), endpoint.replace(".com/", ".com.evil.invalid/"), endpoint + "?key=SECRET_CANARY", endpoint + "#x", endpoint + "/", endpoint + "\n", endpoint.replace("llm-fixture", "trial"), "http://127.0.0.1/", "https://169.254.169.254/"];
  for (const candidate of bad) assert.throws(() => createProviderHttpTransport({ ...config, endpoint: candidate }, deps), /configuration unavailable/);
  assert.throws(() => createProviderHttpTransport(config, { ...deps, qwenEndpoint: undefined }), /configuration unavailable/);
  assert.throws(() => createProviderHttpTransport({ ...config, provider: "toString" as "qwen" }, deps), /configuration unavailable/);
  for (const candidate of bad.filter(v => v !== LEGACY_QWEN_ENDPOINT && !v.includes("llm-foreign"))) {
    assert.throws(() => readQwenEndpoint({ VISEPANDA_QWEN_ENDPOINT: candidate }), /configuration unavailable/);
    assert.throws(() => createProviderHttpTransport({ ...config, endpoint: candidate }, { ...deps, qwenEndpoint: candidate }), /configuration unavailable/);
  }
  assert.equal(calls, 0);
});

test("server config retains legacy during rollout but rejects invalid explicit values", () => {
  assert.equal(readQwenEndpoint({}), LEGACY_QWEN_ENDPOINT);
  assert.equal(groundedAiAssistProviderConfig(env)?.endpoint, endpoint);
  assert.equal(groundedAiAssistProviderConfig(env)?.configurationVersion, 2);
  assert.equal(groundedAiAssistProviderConfig({ ...env, VISEPANDA_QWEN_ENDPOINT: undefined })?.endpoint, LEGACY_QWEN_ENDPOINT);
  for (const candidate of ["", " ", endpoint + "\n", "https://evil.invalid"]) assert.equal(groundedAiAssistProviderConfig({ ...env, VISEPANDA_QWEN_ENDPOINT: candidate }), null);
  for (const version of ["0", "-1", "1.5", "2e1", "9007199254740992"]) assert.equal(groundedAiAssistProviderConfig({ ...env, VISEPANDA_GROUNDED_AI_ASSIST_CONFIG_VERSION: version }), null);
  assert.equal(groundedAiAssistProviderConfig({ ...env, VISEPANDA_GROUNDED_AI_ASSIST_PROVIDER: "deepseek", VISEPANDA_QWEN_ENDPOINT: "bad" })?.endpoint, "https://api.deepseek.com/chat/completions");
});

test("old policy cannot authorize new workspace dispatch; matched policy still needs authorization", async () => {
  let calls = 0;
  const transport = createProviderHttpTransport(config, { qwenEndpoint: endpoint, credential: () => "key", recordDestination: async () => {}, fetch: async () => { calls++; return Response.json(completion("qwen")); } });
  for (const [policyEndpoint, authorized, expected] of [[LEGACY_QWEN_ENDPOINT, true, "unavailable"], [endpoint, false, "unavailable"], [endpoint, true, "protocol_validated"]] as const) {
    const before = calls;
    const rpc = async (name: string) => name === "read_text_work" ? { kind: "input", provider: "qwen", endpoint: policyEndpoint, policyId: "synthetic-policy", text: "Synthetic" } : { kind: authorized ? "authorized" : "denied" };
    const result = await invokeTextProviderProtocol({ turnId: "synthetic-turn", leaseToken: "synthetic-lease" }, { provider: "qwen", endpoint, maxOutputTokens: 10, timeoutMs: 1000 }, rpc, budget(), transport, signal());
    assert.equal(result.kind, expected); assert.equal(calls - before, expected === "protocol_validated" ? 1 : 0);
  }
});

test("workspace HTTP failure never retries shared host or follows redirects", async () => {
  for (const status of [307, 401, 429, 500]) {
    const urls: string[] = [];
    const transport = createProviderHttpTransport(config, { qwenEndpoint: endpoint, credential: () => "key", recordDestination: async () => {}, fetch: async url => { urls.push(String(url)); return new Response("SECRET_CANARY", { status, headers: { location: LEGACY_QWEN_ENDPOINT } }); } });
    const result = await invokeProviderProtocol(request("qwen"), budget(), transport, signal());
    assert.equal(result.kind, "unavailable"); assert.deepEqual(urls, [endpoint]); assert.doesNotMatch(JSON.stringify(result), /SECRET_CANARY/);
  }
});
