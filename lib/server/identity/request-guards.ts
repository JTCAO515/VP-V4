import type { NextRequest } from "next/server";
import {
  isTurnFeedback,
  type TurnFeedbackKind,
  type TurnFeedbackReason,
} from "../turn/feedback/contract.ts";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}
export function isSameOriginMutation(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  return (
    hasSameOrigin(origin, request.nextUrl) ||
    hasForwardedOrigin(
      origin,
      request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
      request.headers.get("x-forwarded-proto") ??
        request.nextUrl.protocol.slice(0, -1),
    )
  );
}
export function hasSameOrigin(origin: string | null, requestUrl: URL): boolean {
  return origin !== null && origin === requestUrl.origin;
}
export function hasForwardedOrigin(
  origin: string | null,
  forwardedHost: string | null,
  forwardedProto: string | null,
): boolean {
  if (!origin || !forwardedHost || !forwardedProto) return false;
  if (forwardedHost.includes(",") || forwardedProto.includes(",")) return false;
  if (!/^[a-z0-9.-]+(?::\d{1,5})?$/i.test(forwardedHost)) return false;
  if (forwardedProto !== "http" && forwardedProto !== "https") return false;
  return origin === `${forwardedProto}://${forwardedHost}`;
}
export function isConfirmInput(
  value: unknown,
): value is Readonly<{
  proposalId: string;
  idempotencyKey: string;
  digest: string;
}> {
  if (!value || typeof value !== "object") return false;
  const input = value as Record<string, unknown>;
  return (
    isUuid(String(input.proposalId ?? "")) &&
    typeof input.idempotencyKey === "string" &&
    input.idempotencyKey.length > 0 &&
    input.idempotencyKey.length <= 160 &&
    typeof input.digest === "string" &&
    input.digest.length > 0 &&
    input.digest.length <= 160
  );
}

export function isProposalRevisionInput(
  value: unknown,
): value is Readonly<{ proposalId: string; title: string }> {
  if (!value || typeof value !== "object") return false;
  const input = value as Record<string, unknown>;
  return (
    isUuid(String(input.proposalId ?? "")) &&
    typeof input.title === "string" &&
    input.title.trim().length > 0 &&
    input.title.trim().length <= 160
  );
}

export function isProposalRejectInput(
  value: unknown,
): value is Readonly<{ proposalId: string }> {
  if (!value || typeof value !== "object") return false;
  return isUuid(String((value as Record<string, unknown>).proposalId ?? ""));
}

export function isRollbackInput(
  value: unknown,
): value is Readonly<{ targetVersion: number }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  return (
    typeof input.targetVersion === "number" &&
    Number.isInteger(input.targetVersion) &&
    input.targetVersion >= 0 &&
    Object.keys(input).every((key) => key === "targetVersion")
  );
}

export function isChatThreadInput(
  value: unknown,
): value is Readonly<{ tripId?: string }> {
  if (value === undefined || value === null) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  return (
    (input.tripId === undefined || isUuid(String(input.tripId))) &&
    Object.keys(input).every((key) => key === "tripId")
  );
}

export function isChatTurnStartInput(
  value: unknown,
): value is Readonly<{
  turnId: string;
  idempotencyKey: string;
  digest: string;
}> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  return (
    isUuid(String(input.turnId ?? "")) &&
    isUuid(String(input.idempotencyKey ?? "")) &&
    input.digest === "chat-state-control-v1" &&
    Object.keys(input).every(
      (key) => key === "turnId" || key === "idempotencyKey" || key === "digest",
    )
  );
}

export function isTurnFeedbackInput(
  value: unknown,
): value is Readonly<{ kind: TurnFeedbackKind; reason: TurnFeedbackReason }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  return (
    typeof input.kind === "string" &&
    typeof input.reason === "string" &&
    isTurnFeedback({ kind: input.kind, reason: input.reason }) &&
    Object.keys(input).every((key) => key === "kind" || key === "reason")
  );
}

export type MemoryTransitionState =
  | "explicit"
  | "confirmed"
  | "rejected"
  | "paused"
  | "deleted";

export function isMemoryCreateInput(
  value: unknown,
): value is Readonly<{
  memoryId: string;
  receiptId: string;
  consentId: string;
  constraintKind: "preference" | "hard_constraint";
  summary: string;
}> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  return (
    isUuid(String(input.memoryId ?? "")) &&
    isUuid(String(input.receiptId ?? "")) &&
    isUuid(String(input.consentId ?? "")) &&
    (input.constraintKind === "preference" ||
      input.constraintKind === "hard_constraint") &&
    typeof input.summary === "string" &&
    input.summary.trim().length >= 1 &&
    input.summary.trim().length <= 500 &&
    Object.keys(input).every((key) =>
      [
        "memoryId",
        "receiptId",
        "consentId",
        "constraintKind",
        "summary",
      ].includes(key),
    )
  );
}

export function isMemoryConsentInput(
  value: unknown,
): value is Readonly<{ consentId: string; action: "grant" | "revoke" }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  return (
    isUuid(String(input.consentId ?? "")) &&
    (input.action === "grant" || input.action === "revoke") &&
    Object.keys(input).every((key) => key === "consentId" || key === "action")
  );
}

export function isMemoryTransitionInput(
  value: unknown,
): value is Readonly<{ state: MemoryTransitionState }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  return (
    (input.state === "explicit" ||
      input.state === "confirmed" ||
      input.state === "rejected" ||
      input.state === "paused" ||
      input.state === "deleted") &&
    Object.keys(input).every((key) => key === "state")
  );
}

export function isUserProfileInput(
  value: unknown,
): value is Readonly<{
  displayName: string;
  travelPace: "relaxed" | "balanced" | "packed";
  locale: "zh" | "en" | "es" | "ru" | "ar";
  currency: "CNY" | "USD" | "EUR" | "RUB" | "SAR";
  distanceUnit: "kilometre" | "mile";
  temperatureUnit: "celsius" | "fahrenheit";
  defaultDepartureTime: string;
}> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  return (
    typeof input.displayName === "string" &&
    input.displayName.trim().length <= 80 &&
    ["relaxed", "balanced", "packed"].includes(String(input.travelPace)) &&
    ["zh", "en", "es", "ru", "ar"].includes(String(input.locale)) &&
    ["CNY", "USD", "EUR", "RUB", "SAR"].includes(String(input.currency)) &&
    ["kilometre", "mile"].includes(String(input.distanceUnit)) &&
    ["celsius", "fahrenheit"].includes(String(input.temperatureUnit)) &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(String(input.defaultDepartureTime)) &&
    Object.keys(input).every((key) =>
      [
        "displayName",
        "travelPace",
        "locale",
        "currency",
        "distanceUnit",
        "temperatureUnit",
        "defaultDepartureTime",
      ].includes(key),
    )
  );
}
