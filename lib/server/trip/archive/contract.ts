import { isUuid } from "../../identity/request-guards.ts";

export type ArchiveInput = Readonly<{ expectedVersion: number; idempotencyKey: string; confirmed: true }>;
export type TripArchive = Readonly<{ tripId: string; archivedVersion: number; archivedAt: string }>;

export function isArchiveInput(value: unknown): value is ArchiveInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  return Object.keys(input).length === 3 && input.confirmed === true &&
    Number.isSafeInteger(input.expectedVersion) && (input.expectedVersion as number) > 0 &&
    (input.expectedVersion as number) <= 2147483647 &&
    typeof input.idempotencyKey === "string" && isUuid(input.idempotencyKey);
}

export function readArchive(value: unknown): TripArchive | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.trip_id !== "string" || !isUuid(row.trip_id) ||
      !Number.isSafeInteger(row.archived_version) || (row.archived_version as number) < 1 ||
      typeof row.archived_at !== "string" || !Number.isFinite(Date.parse(row.archived_at))) return null;
  return { tripId: row.trip_id, archivedVersion: row.archived_version as number, archivedAt: row.archived_at };
}
