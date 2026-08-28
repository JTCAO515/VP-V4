import type { NextRequest } from "next/server";
import { isTurnFeedback, type TurnFeedbackKind, type TurnFeedbackReason } from "../turn/feedback/contract.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean { return UUID.test(value); }
export function isSameOriginMutation(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  return hasSameOrigin(origin, request.nextUrl) || hasForwardedOrigin(
    origin,
    request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
    request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.slice(0, -1),
  );
}
export function hasSameOrigin(origin: string | null, requestUrl: URL): boolean { return origin !== null && origin === requestUrl.origin; }
export function hasForwardedOrigin(origin: string | null, forwardedHost: string | null, forwardedProto: string | null): boolean {
  if (!origin || !forwardedHost || !forwardedProto) return false;
  if (forwardedHost.includes(",") || forwardedProto.includes(",")) return false;
  if (!/^[a-z0-9.-]+(?::\d{1,5})?$/i.test(forwardedHost)) return false;
  if (forwardedProto !== "http" && forwardedProto !== "https") return false;
  return origin === `${forwardedProto}://${forwardedHost}`;
}
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

export function isProposalRejectInput(value: unknown): value is Readonly<{ proposalId: string }> {
  if (!value || typeof value !== "object") return false;
  return isUuid(String((value as Record<string, unknown>).proposalId ?? ""));
}

export function isRollbackInput(value: unknown): value is Readonly<{ targetVersion: number }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  return typeof input.targetVersion === "number" && Number.isInteger(input.targetVersion) && input.targetVersion >= 0
    && Object.keys(input).every((key) => key === "targetVersion");
}

export function isChatThreadInput(value: unknown): value is Readonly<{ tripId?: string }> {
  if (value === undefined || value === null) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  return (input.tripId === undefined || isUuid(String(input.tripId))) && Object.keys(input).every((key) => key === "tripId");
}

export function isChatTurnStartInput(value: unknown): value is Readonly<{ turnId: string; idempotencyKey: string; digest: string }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  return isUuid(String(input.turnId ?? ""))
    && isUuid(String(input.idempotencyKey ?? ""))
    && input.digest === "chat-state-control-v1"
    && Object.keys(input).every((key) => key === "turnId" || key === "idempotencyKey" || key === "digest");
}

export function isTurnFeedbackInput(value: unknown): value is Readonly<{ kind: TurnFeedbackKind; reason: TurnFeedbackReason }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  return typeof input.kind === "string" && typeof input.reason === "string"
    && isTurnFeedback({ kind: input.kind, reason: input.reason })
    && Object.keys(input).every((key) => key === "kind" || key === "reason");
}
