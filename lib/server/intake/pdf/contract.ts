import { createHash } from "node:crypto";
import { isUuid } from "../../identity/request-guards.ts";
import type { TripPatch } from "../../trip/patch/contract.ts";

export const PDF_INTAKE_LIMITS = Object.freeze({ bytes: 20_000_000, pages: 10, fields: 4, lifetimeSeconds: 86_400 });
export const PDF_FIELD_KINDS = ["date", "amount", "address", "status"] as const;
export type PdfFieldKind = typeof PDF_FIELD_KINDS[number];
export type PdfField = Readonly<{ kind: PdfFieldKind; value: string; locator: Readonly<{ page: number; line: number; sourceTextHash: string }> }>;
/** Metadata from the device's bounded PDFKit reader. These claims never qualify a booking or provider receipt. */
export type PdfCommand = Readonly<{
  operationId: string; expectedHeadVersion: number; contentHash: string; byteCount: number; pageCount: number;
  extraction: "pdfkit_text"; expiresAt: string; fields: readonly PdfField[];
}>;
export type PdfPreview = Readonly<{
  kind: "pdf_intake_preview/1"; operationId: string; tripId: string; headVersion: number;
  commandDigest: string; previewDigest: string; expiresAt: string;
  relation: "new" | "duplicate" | "conflict";
  fields: readonly (PdfField & Readonly<{ state: "added" | "duplicate" | "conflict" }>)[];
  patch: TripPatch | null; requiresExplicitConfirmation: true;
  evidenceTier: "user_checked_local_pdf"; sourceAvailability: "local_only"; orderVerification: "unavailable";
}>;
export type PdfOperation = Readonly<{
  kind: "pdf_intake_operation/1"; operationId: string; tripId: string; sessionEpoch: number;
  state: "absent" | "pending" | "confirmed" | "rejected" | "cancelled" | "expired";
  requestDigest: string | null; commandDigest: string | null; previewDigest: string | null; expiresAt: string | null;
  proposalId: string | null; proposalRevision: number | null; baseTripVersion: number | null;
}>;
export type PdfProposal = Readonly<{
  kind: "pdf_intake_proposal/1"; operationId: string; tripId: string; sessionEpoch: number;
  requestDigest: string; commandDigest: string; previewDigest: string; proposalId: string; proposalRevision: number;
  baseTripVersion: number; reused: boolean;
}>;
export const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
export const exact = (v: Record<string, unknown>, keys: readonly string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
export const sha256 = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
export const integer = (v: unknown, min = 0, max = 999_999_999): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
export const uuid = (v: unknown): v is string => typeof v === "string" && isUuid(v) && v === v.toLowerCase();
export function instant(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)) return false;
  const time = Date.parse(v);
  return Number.isFinite(time) && new Date(time).toISOString() === v;
}
export function parsePdfField(v: unknown, pageCount: number): PdfField | null {
  if (!object(v) || !exact(v, ["kind", "value", "locator"]) || !(PDF_FIELD_KINDS as readonly unknown[]).includes(v.kind)
    || typeof v.value !== "string" || v.value !== v.value.trim() || !v.value.length || v.value.length > 96
    || /[\u0000-\u001f\u007f]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(v.value)
    || !object(v.locator) || !exact(v.locator, ["page", "line", "sourceTextHash"])
    || !integer(v.locator.page, 1, pageCount) || !integer(v.locator.line, 1, 1000) || !sha256(v.locator.sourceTextHash)) return null;
  if (v.kind === "date") {
    const date = /^\d{4}-\d\d-\d\d$/.test(v.value) ? Date.parse(`${v.value}T00:00:00.000Z`) : NaN;
    if (!Number.isFinite(date) || new Date(date).toISOString().slice(0, 10) !== v.value) return null;
  }
  return { kind: v.kind as PdfFieldKind, value: v.value, locator: { page: v.locator.page, line: v.locator.line, sourceTextHash: v.locator.sourceTextHash } };
}
export function parsePdfCommand(v: unknown): PdfCommand | null {
  if (!object(v) || !exact(v, ["operationId", "expectedHeadVersion", "contentHash", "byteCount", "pageCount", "extraction", "expiresAt", "fields"])
    || !uuid(v.operationId) || !integer(v.expectedHeadVersion) || !sha256(v.contentHash)
    || !integer(v.byteCount, 1, PDF_INTAKE_LIMITS.bytes) || !integer(v.pageCount, 1, PDF_INTAKE_LIMITS.pages)
    || v.extraction !== "pdfkit_text" || !instant(v.expiresAt) || !Array.isArray(v.fields) || !integer(v.fields.length, 1, PDF_INTAKE_LIMITS.fields)) return null;
  const fields = v.fields.map(f => parsePdfField(f, v.pageCount as number));
  if (fields.some(f => f === null) || new Set(fields.map(f => f?.kind)).size !== fields.length || !fields.some(f => f?.kind === "date")) return null;
  return { operationId: v.operationId, expectedHeadVersion: v.expectedHeadVersion, contentHash: v.contentHash,
    byteCount: v.byteCount, pageCount: v.pageCount, extraction: "pdfkit_text", expiresAt: v.expiresAt, fields: fields as PdfField[] };
}
/** Canonical digest includes expiry, every corrected value and locator; retries retain the original command bytes. */
export function pdfCanonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(pdfCanonical).join(",")}]`;
  if (object(v)) return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${pdfCanonical(v[k])}`).join(",")}}`;
  return JSON.stringify(v);
}
export function pdfDigest(v: unknown): string { return createHash("sha256").update(pdfCanonical(v), "utf8").digest("hex"); }
