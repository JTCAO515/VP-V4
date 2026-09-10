import { NextRequest, NextResponse } from "next/server";
import { createWebRpc } from "@/lib/server/identity/web-rpc";
import { isSameOriginMutation } from "@/lib/server/identity/request-guards";
import { isOpsInput, opsLocalConfig } from "@/lib/server/knowledge/review/local-workspace";
export const dynamic = "force-dynamic";
const statuses: Record<string, number> = { UNAUTHENTICATED: 401, OPS_FORBIDDEN: 403, OPS_DISABLED: 503, OPS_SELF_REVIEW: 403, OPS_CONFLICT: 409, OPS_NOT_FOUND: 404, INVALID_INPUT: 400, SESSION_REPLACED: 401 };
function respond(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Content-Type-Options": "nosniff" } });
}
async function execute(request: NextRequest, input: Record<string, unknown>) {
  const config = opsLocalConfig();
  if (!config) return respond({ error: "OPS_DISABLED" }, 503);
  const rpc = createWebRpc(request, config);
  try {
    const { data, error } = await rpc.call("ops_review_workspace", { p_input: input });
    if (error) {
      const code = Object.hasOwn(statuses, error.message) ? error.message : "OPS_UNAVAILABLE";
      return rpc.applyCookies(respond({ error: code }, statuses[code] ?? 503));
    }
    return rpc.applyCookies(respond({ data }));
  } catch { return rpc.applyCookies(respond({ error: "OPS_UNAVAILABLE" }, 503)); }
}
export async function GET(request: NextRequest) {
  if (request.nextUrl.search) return respond({ error: "INVALID_INPUT" }, 400);
  return execute(request, { action: "list" });
}
export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) return respond({ error: "OPS_FORBIDDEN" }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return respond({ error: "INVALID_INPUT" }, 400);
  // Bound streamed bytes before JSON parsing, including requests without Content-Length.
  const reader = request.body?.getReader();
  if (!reader) return respond({ error: "INVALID_INPUT" }, 400);
  let length = 0; const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > 24000) { await reader.cancel(); return respond({ error: "INVALID_INPUT" }, 413); }
      chunks.push(chunk.value);
    }
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!isOpsInput(body)) return respond({ error: "INVALID_INPUT" }, 400);
    return execute(request, body);
  } catch { return respond({ error: "INVALID_INPUT" }, 400); }
}
