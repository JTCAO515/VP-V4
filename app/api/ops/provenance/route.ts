import { NextRequest, NextResponse } from "next/server";
import { createWebRpc } from "@/lib/server/identity/web-rpc";
import { opsRuntimeConfig } from "@/lib/server/knowledge/review/local-workspace";
import { handleProvenanceRequest } from "@/lib/server/knowledge/provenance/http-provenance";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const config = opsRuntimeConfig(request);
  let rpc: ReturnType<typeof createWebRpc> | undefined;
  const result = await handleProvenanceRequest(request, {
    enabled: config !== null,
    createRpc(lifetime) { rpc = createWebRpc(request, config!, lifetime); return rpc; },
  });
  const response = NextResponse.json(result.body, { status: result.status, headers: { "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Content-Type-Options": "nosniff" } });
  return rpc ? rpc.applyCookies(response) : response;
}
