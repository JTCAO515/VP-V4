import { randomBytes, randomUUID, createHash } from "node:crypto";
import { getNativeRuntimeConfig } from "../identity/native-config.ts";
import { verifyNativeCredentials } from "../identity/native-credentials.ts";
import { nativeRequestScope } from "../identity/native-request.ts";
import { parseExportJob, exportRecord, exportExact, exportUUID, exportUTC, exportSHA } from "./export-contract.ts";
import { parseExportPolicy } from "./export-policy.ts";
import { parseExportKey, decryptExportArtifact } from "./export-artifact.ts";
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
const failure = (code: string, status = 503) => json({ error: { code } }, status);
const hash = (v: string) => createHash("sha256").update(v, "utf8").digest("hex");

type ExportHTTPConfiguration = { policy: () => string | undefined; key: () => string | undefined };
const serverConfiguration: ExportHTTPConfiguration = { policy: () => process.env.VISEPANDA_CORE_EXPORT_POLICY, key: () => process.env.VISEPANDA_CORE_EXPORT_KEY };
export async function coreExportHTTP(request: Request, action: "request" | "read" | "ticket" | "download", pathRequestId?: string, configuration: ExportHTTPConfiguration = serverConfiguration) {
  if (request.headers.has("cookie") || request.headers.has("origin")) return failure("AMBIGUOUS_CREDENTIALS", 400);
  if (request.method !== (["request", "ticket"].includes(action) ? "POST" : "GET")) return failure("METHOD_NOT_ALLOWED", 405);
  const config = getNativeRuntimeConfig(request, "trip");
  if (!config) return failure("UNAVAILABLE");
  const policy = parseExportPolicy(configuration.policy(), config.environment ?? "local");
  if (!policy) return failure("UNAVAILABLE"); // Does not read key/provider or execute when missing/disabled.
  const scope = nativeRequestScope(request.signal);
  try {
    return await scope.run(async () => {
      const params = new URL(request.url).searchParams;
      let requestId: string;
      if (action === "read") {
        const id = params.get("requestId");
        if (!exportUUID(id) || [...params].length !== 1) return failure("INVALID_INPUT", 400);
        requestId = id;
      } else if (pathRequestId !== undefined) {
        if (!exportUUID(pathRequestId) || [...params].length) return failure("INVALID_INPUT", 400);
        requestId = pathRequestId;
      } else {
        if ([...params].length) return failure("INVALID_INPUT", 400);
        const raw = await scope.body(request, 4096);
        let body: unknown;
        try { body = JSON.parse(raw ?? "null"); } catch { return failure("INVALID_INPUT", 400); }
        if (!exportRecord(body) || !exportExact(body, ["requestId", "confirmed"]) || !exportUUID(body.requestId) || body.confirmed !== true) return failure("INVALID_INPUT", 400);
        requestId = body.requestId;
      }
      if (action === "ticket") {
        const raw = await scope.body(request, 4096);
        if (raw !== "" && raw !== "{}") return failure("INVALID_INPUT", 400);
      }
      const credentials = await verifyNativeCredentials(request, config, scope.fetch, scope.unavailable);
      scope.check();
      if (!credentials) return failure("UNAUTHENTICATED", 401);
      const rpc = async (name: string, input: Record<string, unknown>) => {
        const result = await credentials.client.rpc("privacy_core_export_v1", { p_action: name, p_input: input }).abortSignal(scope.signal);
        scope.check();
        if (result.error) {
          const message = result.error.message;
          for (const [code, status] of [["REAUTHENTICATION_REQUIRED", 401], ["SESSION_REPLACED", 401], ["UNAUTHENTICATED", 401], ["FORBIDDEN", 403], ["INVALID_INPUT", 400], ["IDEMPOTENCY_KEY_REUSE", 409], ["TOKEN_EXPIRED", 410], ["TOKEN_CONSUMED", 410]] as const) if (new RegExp(`\\b${code}\\b`).test(message)) return { failure: failure(code, status) };
          return { failure: failure("UNAVAILABLE") };
        }
        return { data: result.data as unknown };
      };
      if (action === "request" || action === "read") {
        const result = await rpc(action, action === "request" ? { requestId, confirmed: true } : { requestId });
        if (result.failure) return result.failure;
        const receipt = parseExportJob(result.data, requestId);
        return receipt ? json(receipt, action === "request" && receipt.state === "queued" ? 202 : 200) : failure("UNAVAILABLE");
      }
      if (action === "ticket") {
        const operationId = randomUUID(), token = randomBytes(32).toString("base64url");
        const result = await rpc("ticket", { requestId, operationId, tokenHash: hash(token), ticketTtlMs: policy.downloadTicketTtlMs });
        if (result.failure) return result.failure;
        const v = result.data;
        if (!exportRecord(v) || !exportExact(v, ["kind", "requestId", "operationId", "generation", "artifactDigest", "expiresAt"]) || v.kind !== "privacy_export_ticket/1" || v.requestId !== requestId || v.operationId !== operationId
          || typeof v.generation !== "number" || !Number.isSafeInteger(v.generation) || v.generation < 1 || !exportSHA(v.artifactDigest) || !exportUTC(v.expiresAt) || Date.parse(v.expiresAt) <= Date.now() || Date.parse(v.expiresAt) - Date.now() > policy.downloadTicketTtlMs) return failure("UNAVAILABLE");
        return json({ ...v, token });
      }
      const token = request.headers.get("X-Export-Download-Token"), operationId = request.headers.get("X-Export-Operation-ID");
      if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token) || Buffer.from(token, "base64url").toString("base64url") !== token || !exportUUID(operationId)) return failure("INVALID_INPUT", 400);
      let rawKey: unknown;
      try { rawKey = JSON.parse(configuration.key() ?? "null"); } catch { return failure("UNAVAILABLE"); }
      const key = parseExportKey(rawKey);
      if (!key) return failure("UNAVAILABLE");
      const prepared = await rpc("download_prepare", { requestId, operationId, tokenHash: hash(token) });
      if (prepared.failure) return prepared.failure;
      const v = prepared.data;
      if (!exportRecord(v) || !exportExact(v, ["kind", "requestId", "operationId", "generation", "ownerId", "artifactDigest", "artifact", "ticketExpiresAt"])
        || v.kind !== "privacy_export_download/1" || v.requestId !== requestId || v.operationId !== operationId || v.ownerId !== credentials.subject
        || typeof v.generation !== "number" || !Number.isSafeInteger(v.generation) || v.generation < 1 || !exportSHA(v.artifactDigest) || !exportUTC(v.ticketExpiresAt) || Date.parse(v.ticketExpiresAt) <= Date.now()) return failure("UNAVAILABLE");
      if (!exportRecord(v.artifact) || !exportUTC(v.artifact.expiresAt) || Date.parse(v.ticketExpiresAt) > Date.parse(v.artifact.expiresAt)) return failure("UNAVAILABLE");
      const bytes = decryptExportArtifact(v.artifact, { requestId, ownerId: credentials.subject, generation: v.generation, leaseId: operationId, expiresAt: v.ticketExpiresAt }, key);
      if (!bytes || bytes.length > policy.maxBytes || createHash("sha256").update(bytes).digest("hex") !== v.artifactDigest) return failure("UNAVAILABLE");
      const consumed = await rpc("download_consume", { requestId, operationId, tokenHash: hash(token), artifactDigest: v.artifactDigest, generation: v.generation });
      if (consumed.failure) return consumed.failure;
      const ack = consumed.data;
      if (!exportRecord(ack) || !exportExact(ack, ["kind", "requestId", "operationId", "generation", "artifactDigest"]) || ack.kind !== "privacy_export_download_consumed/1"
        || ack.requestId !== requestId || ack.operationId !== operationId || ack.generation !== v.generation || ack.artifactDigest !== v.artifactDigest) return failure("UNAVAILABLE");
      scope.check();
      return new Response(new Uint8Array(bytes), { headers: { "Cache-Control": "private, no-store", "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="visepanda-export-${requestId}.json"`, "X-Content-Type-Options": "nosniff" } });
    });
  } catch { return failure("UNAVAILABLE"); }
  finally { scope.dispose(); }
}
