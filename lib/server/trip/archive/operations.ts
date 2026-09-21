import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdapterResult } from "../../identity/user-data-adapter.ts";
import { type ArchiveInput, type TripArchive, readArchive } from "./contract.ts";

export function tripArchiveOperations(client: SupabaseClient, authenticated: () => Promise<AdapterResult<string>>) {
  return {
    async readArchive(tripId: string): Promise<AdapterResult<TripArchive | null>> {
      const actor = await authenticated();
      if ("error" in actor) return actor;
      const trip = await client.from("trips").select("id").eq("id", tripId).maybeSingle();
      if (trip.error) return { error: "PROVIDER_UNAVAILABLE" };
      if (!trip.data) return { error: "FORBIDDEN" };
      const result = await client.from("trip_archives").select("trip_id,archived_version,archived_at").eq("trip_id", tripId).maybeSingle();
      if (result.error) return { error: "PROVIDER_UNAVAILABLE" };
      if (!result.data) return { data: null };
      const archive = readArchive(result.data);
      return archive?.tripId === tripId ? { data: archive } : { error: "INTERNAL_ERROR" };
    },
    async archiveTrip(tripId: string, input: ArchiveInput): Promise<AdapterResult<{ archive: TripArchive; reused: boolean }>> {
      const actor = await authenticated();
      if ("error" in actor) return actor;
      const result = await client.rpc("archive_trip_v1", {
        p_trip_id: tripId, p_expected_version: input.expectedVersion,
        p_idempotency_key: input.idempotencyKey, p_confirmed: input.confirmed,
      });
      if (result.error) {
        const message = result.error.message;
        if (message.includes("SESSION_REPLACED")) return { error: "UNAUTHENTICATED" };
        for (const code of ["FORBIDDEN", "INVALID_INPUT", "STALE_TRIP_VERSION", "PROPOSAL_NOT_CONFIRMABLE", "IDEMPOTENCY_KEY_REUSE"] as const) {
          if (message.includes(code)) return { error: code };
        }
        return { error: "PROVIDER_UNAVAILABLE" };
      }
      const row = result.data?.[0];
      const archive = readArchive(row);
      return archive?.tripId === tripId && archive.archivedVersion === input.expectedVersion && typeof row.reused === "boolean"
        ? { data: { archive, reused: row.reused } } : { error: "INTERNAL_ERROR" };
    },
  };
}
