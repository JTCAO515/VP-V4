import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server, type RequestListener } from "node:http";
import { createProviderHttpTransport, type DestinationReceipt } from "../../../../lib/server/model-gateway/adapters/http-transport.ts";
import { invokeProviderProtocol } from "../../../../lib/server/model-gateway/adapters/provider-protocol.ts";
import { budget, completion, request } from "../../../contract/model-gateway/provider-protocol/fixtures.ts";

// Only this explicit test seam remaps a validated logical URL to an owned loopback server.
// It tests real Node HTTP cancellation/redirect behavior, not TLS, DNS or supplier identity.
const configuration = { provider: "deepseek" as const, endpoint: "https://api.deepseek.com/chat/completions", configurationId: "10000000-0000-4000-8000-000000000002", configurationVersion: 1, timeoutMs: 1000 };
async function listen(handler: RequestListener): Promise<{ server: Server; url: string }> {
  const server = createServer(handler);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  return { server, url: `http://127.0.0.1:${address.port}/controlled` };
}
async function close(server: Server) {
  server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
const wire = (signal = new AbortController().signal) => ({ provider: "deepseek" as const, method: "POST" as const, body: JSON.stringify({ model: "deepseek-v4-flash", messages: [{ role: "user", content: "Synthetic HTTP fixture" }] }), signal });
const mappedFetch = (url: string): typeof fetch => async (target, init) => {
  assert.equal(target, configuration.endpoint);
  assert.equal(init?.redirect, "manual");
  return fetch(url, init);
};

test("real loopback HTTP completes the admitted protocol and captures only destination metadata", async () => {
  let received = 0;
  const endpoint = await listen(async (req, res) => {
    received++; assert.equal(req.method, "POST"); assert.equal(req.headers.authorization, "Bearer SYNTHETIC_CREDENTIAL");
    let body = ""; for await (const chunk of req) body += chunk;
    assert.equal(JSON.parse(body).model, "deepseek-v4-flash");
    res.writeHead(200, { "content-type": "application/json", "x-private": "HEADER_CANARY" }); res.end(JSON.stringify(completion("deepseek")));
  });
  try {
    const receipts: DestinationReceipt[] = [];
    const transport = createProviderHttpTransport(configuration, { credential: () => "SYNTHETIC_CREDENTIAL", recordDestination: async receipt => { receipts.push(receipt); }, fetch: mappedFetch(endpoint.url) });
    const result = await invokeProviderProtocol(request("deepseek"), budget(), transport, new AbortController().signal);
    assert.equal(result.kind, "protocol_validated"); assert.equal(received, 1);
    assert.deepEqual(receipts.map(r => r.phase), ["configured", "attempted", "response_buffered"]);
    assert.doesNotMatch(JSON.stringify(receipts), /SYNTHETIC_CREDENTIAL|HEADER_CANARY|Synthetic HTTP fixture|Synthetic answer/);
  } finally { await close(endpoint.server); }
});

test("real 307 redirect never forwards credentials or request body to the destination", async () => {
  let forwarded = 0, initial = 0;
  const destination = await listen((_req, res) => { forwarded++; res.end("must not reach"); });
  const source = await listen((_req, res) => { initial++; res.writeHead(307, { location: destination.url }); res.end("ERROR_BODY_CANARY"); });
  try {
    const phases: string[] = [];
    const transport = createProviderHttpTransport(configuration, { credential: () => "SYNTHETIC_CREDENTIAL", recordDestination: async receipt => { phases.push(receipt.phase); }, fetch: mappedFetch(source.url) });
    await assert.rejects(transport(wire()), { message: "Provider transport unavailable." });
    assert.equal(initial, 1); assert.equal(forwarded, 0); assert.deepEqual(phases, ["configured", "attempted"]);
  } finally { await close(source.server); await close(destination.server); }
});

test("real hanging response body is cancelled by deadline and caller cancellation", async () => {
  for (const mode of ["deadline", "caller"]) {
    let started: () => void = () => {}, stopped: () => void = () => {};
    const ready = new Promise<void>(resolve => { started = resolve; });
    const closed = new Promise<void>(resolve => { stopped = resolve; });
    const endpoint = await listen((_req, res) => {
      res.once("close", stopped); res.writeHead(200, { "content-type": "application/json" }); res.write("{"); started();
    });
    try {
      const controller = new AbortController();
      const transport = createProviderHttpTransport({ ...configuration, timeoutMs: mode === "deadline" ? 200 : 1000 }, { credential: () => "SYNTHETIC_CREDENTIAL", recordDestination: async () => {}, fetch: mappedFetch(endpoint.url) });
      const pending = transport(wire(controller.signal));
      const rejected = assert.rejects(pending, { message: "Provider transport unavailable." });
      await ready;
      if (mode === "caller") controller.abort();
      await rejected;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try { await Promise.race([closed, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error("HTTP body was not cancelled")), 1000); })]); }
      finally { clearTimeout(timer); }
    } finally { await close(endpoint.server); }
  }
});

test("real oversized HTTP response is rejected without output or success evidence", async () => {
  const endpoint = await listen((_req, res) => { res.writeHead(200, { "content-type": "application/json" }); res.end("x".repeat(262145)); });
  try {
    const phases: string[] = [];
    const transport = createProviderHttpTransport(configuration, { credential: () => "SYNTHETIC_CREDENTIAL", recordDestination: async receipt => { phases.push(receipt.phase); }, fetch: mappedFetch(endpoint.url) });
    await assert.rejects(transport(wire()), { message: "Provider transport unavailable." });
    assert.deepEqual(phases, ["configured", "attempted"]);
  } finally { await close(endpoint.server); }
});
