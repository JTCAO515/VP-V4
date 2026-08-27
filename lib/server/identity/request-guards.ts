import type { NextRequest } from "next/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean { return UUID.test(value); }
export function isSameOriginMutation(request: NextRequest): boolean {
  return hasSameOrigin(request.headers.get("origin"), request.nextUrl);
}
export function hasSameOrigin(origin: string | null, requestUrl: URL): boolean { return origin !== null && origin === requestUrl.origin; }
export function isConfirmInput(value: unknown): value is Readonly<{ proposalId: string; idempotencyKey: string; digest: string }> {
  if (!value || typeof value !== "object") return false;
  const input = value as Record<string, unknown>;
  return isUuid(String(input.proposalId ?? ""))
    && typeof input.idempotencyKey === "string" && input.idempotencyKey.length > 0 && input.idempotencyKey.length <= 160
    && typeof input.digest === "string" && input.digest.length > 0 && input.digest.length <= 160;
}

export function isProposalRevisionInput(value: unknown): value is Readonly<{ proposalId: string; title: string }> {
  if (!value || typeof value !== "object") return false;
  const input = value as Record<string, unknown>;
  return isUuid(String(input.proposalId ?? ""))
    && typeof input.title === "string" && input.title.trim().length > 0 && input.title.trim().length <= 160;
}
