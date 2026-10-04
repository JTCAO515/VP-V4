import { isUuid } from "../../identity/request-guards.ts";
import { record, timestamp } from "../../readiness/contract.ts";

export type RecoveryReport = { source: "user_report"; kind: "fatigue" | "delay" | "closure" | "high_risk_unwell"; observedAt: string };
export type ReservationBinding = { referenceId: string; revision: number; dayId: string; itemId: string };
export type RecoveryInput = {
  operationId: string; expectedHeadVersion: number; dayId: string; selectedItemIds: string[]; fixedItemIds: string[];
  reservationBindings: ReservationBinding[]; report: RecoveryReport; locale: "zh" | "en";
};
export type ForegroundTransportScope = {
  tripId: string; expectedHeadVersion: number; dayId: string; itemId: string;
  originPlaceReferenceId: string; destinationPlaceReferenceId: string;
  mode: "walking" | "transit" | "driving"; departure: "now";
};
export type TransportRecoveryInput = Omit<RecoveryInput, "report"> & { receiptId: string; scope: ForegroundTransportScope };
export type RecoveryPreparationInput = RecoveryInput | TransportRecoveryInput;
export type RecoverySelection = { operationId: string; contextId: string; contextDigest: string; candidateId: "omit_one" | "omit_selected" };
export type RecoveryHTTPInput =
  | { operation: "preview"; input: RecoveryInput }
  | { operation: "select"; input: RecoverySelection }
  | { operation: "receipt"; operationId: string }
  | { operation: "transport"; input: TransportRecoveryInput }
  | { operation: "transport"; expectedHeadVersion: number; dayId: string; itemId: string; receiptId: string; departure: "now" };

export const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
export const uuid = (v: unknown): v is string => typeof v === "string" && isUuid(v) && v === v.toLowerCase();
export const hash = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
export const integer = (v: unknown, min = 0): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= 999999999;
export const itemId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v);
const ids = (v: unknown, min: number, max: number): v is string[] => Array.isArray(v) && v.length >= min && v.length <= max && v.every(itemId) && new Set(v).size === v.length;

export function parseRecoveryInput(v: unknown): RecoveryInput | null {
  if (!record(v) || !exact(v, ["operationId", "expectedHeadVersion", "dayId", "selectedItemIds", "fixedItemIds", "reservationBindings", "report", "locale"])
    || !uuid(v.operationId) || !integer(v.expectedHeadVersion) || !itemId(v.dayId) || !ids(v.selectedItemIds, 1, 8) || !ids(v.fixedItemIds, 0, 64)
    || !Array.isArray(v.reservationBindings) || v.reservationBindings.length > 100 || !v.reservationBindings.every(b => record(b)
      && exact(b, ["referenceId", "revision", "dayId", "itemId"]) && uuid(b.referenceId) && integer(b.revision, 1) && itemId(b.dayId) && itemId(b.itemId))
    || new Set(v.reservationBindings.map(b => b.referenceId)).size !== v.reservationBindings.length
    || !record(v.report) || !exact(v.report, ["source", "kind", "observedAt"]) || v.report.source !== "user_report"
    || !["fatigue", "delay", "closure", "high_risk_unwell"].includes(v.report.kind as string) || timestamp(v.report.observedAt) === null
    || (v.locale !== "zh" && v.locale !== "en")) return null;
  return structuredClone(v) as RecoveryInput;
}
export function parseTransportRecoveryInput(v: unknown): TransportRecoveryInput | null {
  if (!record(v) || !exact(v, ["operationId", "expectedHeadVersion", "dayId", "selectedItemIds", "fixedItemIds", "reservationBindings", "receiptId", "scope", "locale"])
    || !uuid(v.operationId) || !integer(v.expectedHeadVersion) || !itemId(v.dayId) || !ids(v.selectedItemIds, 1, 8) || !ids(v.fixedItemIds, 0, 64)
    || !Array.isArray(v.reservationBindings) || v.reservationBindings.length > 100 || !v.reservationBindings.every(b => record(b)
      && exact(b, ["referenceId", "revision", "dayId", "itemId"]) && uuid(b.referenceId) && integer(b.revision, 1) && itemId(b.dayId) && itemId(b.itemId))
    || new Set(v.reservationBindings.map(b => b.referenceId)).size !== v.reservationBindings.length
    || !uuid(v.receiptId) || !record(v.scope) || !exact(v.scope, ["tripId", "expectedHeadVersion", "dayId", "itemId", "originPlaceReferenceId", "destinationPlaceReferenceId", "mode", "departure"])
    || !uuid(v.scope.tripId) || v.scope.expectedHeadVersion !== v.expectedHeadVersion || v.scope.dayId !== v.dayId || !itemId(v.scope.itemId)
    || !uuid(v.scope.originPlaceReferenceId) || !uuid(v.scope.destinationPlaceReferenceId) || v.scope.originPlaceReferenceId === v.scope.destinationPlaceReferenceId
    || !["walking", "transit", "driving"].includes(v.scope.mode as string) || v.scope.departure !== "now" || (v.locale !== "zh" && v.locale !== "en")) return null;
  return structuredClone(v) as TransportRecoveryInput;
}
export function parseRecoveryPreparationInput(v: unknown): RecoveryPreparationInput | null {
  return parseRecoveryInput(v) ?? parseTransportRecoveryInput(v);
}
export function parseRecoverySelection(v: unknown): RecoverySelection | null {
  return record(v) && exact(v, ["operationId", "contextId", "contextDigest", "candidateId"]) && uuid(v.operationId) && uuid(v.contextId)
    && hash(v.contextDigest) && (v.candidateId === "omit_one" || v.candidateId === "omit_selected") ? structuredClone(v) as RecoverySelection : null;
}
export function parseRecoveryHTTPInput(v: unknown): RecoveryHTTPInput | null {
  if (!record(v)) return null;
  if (v.operation === "preview" && exact(v, ["operation", "input"])) {
    const input = parseRecoveryInput(v.input); return input ? { operation: "preview", input } : null;
  }
  if (v.operation === "select" && exact(v, ["operation", "input"])) {
    const input = parseRecoverySelection(v.input); return input ? { operation: "select", input } : null;
  }
  if (v.operation === "receipt" && exact(v, ["operation", "operationId"]) && uuid(v.operationId)) return { operation: "receipt", operationId: v.operationId };
  if (v.operation === "transport" && exact(v, ["operation", "input"])) {
    const input = parseTransportRecoveryInput(v.input); return input ? { operation: "transport", input } : null;
  }
  if (v.operation === "transport" && exact(v, ["operation", "expectedHeadVersion", "dayId", "itemId", "receiptId", "departure"])
    && integer(v.expectedHeadVersion) && itemId(v.dayId) && itemId(v.itemId) && uuid(v.receiptId) && v.departure === "now") return structuredClone(v) as RecoveryHTTPInput;
  return null;
}
