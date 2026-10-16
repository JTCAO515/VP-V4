import type { SupabaseClient } from "@supabase/supabase-js";
import type { FailureCode } from "../../contracts/errors/index.ts";
import { INVENTORY_CAP, INVENTORY_COVERAGE, inventoryDigest, parseInventory, stableJSON, uuid, validHeader, validTrip, type InventoryHeader, type InventoryTrip, type TripInventory } from "./contract.ts";

type Result<T> = Readonly<{ data: T }> | Readonly<{ error: FailureCode }>;
type CanonicalRead = Readonly<{ trip: InventoryHeader; content: InventoryTrip["content"]; confirmationState: InventoryTrip["confirmationState"] }>;
/** Bound once by the existing Native adapter to its ordinary RLS client and original authorities. */
export function createTripInventoryReader(client: SupabaseClient, authenticated: () => Promise<Result<string>>, readCanonicalTrip: (id: string) => Promise<Result<CanonicalRead>>) {
  return async function readInventory(signal?: AbortSignal): Promise<Result<TripInventory>> {
    const controller = new AbortController(), expires = performance.now() + 10000;
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true }); if (signal?.aborted) abort();
    const timer = setTimeout(abort, 10000);
    const check = () => { if (controller.signal.aborted || performance.now() >= expires) throw Error("Unavailable"); };
    let cancelled = () => {};
    const interrupted = new Promise<never>((_, reject) => { cancelled = () => reject(Error("Unavailable")); controller.signal.addEventListener("abort", cancelled, { once: true }); });
    const checked = async <T>(work: () => PromiseLike<T>) => { check(); const v = await Promise.race([Promise.resolve().then(work), interrupted]); check(); return v; };
    try {
      const actor = await checked(authenticated);
      if ("error" in actor) return actor;
      if (!uuid(actor.data)) throw Error("Unavailable");
      const headers = async (): Promise<readonly InventoryHeader[]> => {
        const result = await checked(() => client.from("trips").select("id,owner_id,title,head_version,updated_at", { count: "exact" }).eq("owner_id", actor.data)
          .order("id", { ascending: true }).limit(INVENTORY_CAP + 1).abortSignal(controller.signal));
        if (result.error || !Number.isSafeInteger(result.count) || result.count === null || result.count < 0 || result.count > INVENTORY_CAP
          || !Array.isArray(result.data) || result.data.length !== result.count) throw Error("Unavailable");
        if (result.data.some(r => r.owner_id !== actor.data)) throw Error("Unavailable");
        const rows = result.data.map(r => ({ id: r.id, title: r.title, headVersion: r.head_version, updatedAt: r.updated_at }));
        if (!rows.every(validHeader) || rows.some((r, i) => i > 0 && rows[i - 1].id >= r.id)) throw Error("Unavailable");
        return rows;
      };
      const before = await headers(), trips: InventoryTrip[] = [];
      for (const header of before) {
        const read = await checked(() => readCanonicalTrip(header.id));
        if ("error" in read || stableJSON(read.data.trip) !== stableJSON(header)) throw Error("Unavailable");
        const trip = JSON.parse(stableJSON({ ...header, content: read.data.content, confirmationState: read.data.confirmationState })) as InventoryTrip;
        if (!validTrip(trip)) throw Error("Unavailable");
        trips.push(trip);
        // Bound intermediate data too, and detach from a caller's mutable projection.
        if (!parseInventory({ schemaVersion: "native-trip-inventory/1", ownerId: actor.data, coverage: INVENTORY_COVERAGE, complete: true,
          trips, count: trips.length, digest: inventoryDigest(actor.data, trips) })) throw Error("Unavailable");
      }
      if (stableJSON(before) !== stableJSON(await headers())) throw Error("Unavailable");
      const current = await checked(authenticated);
      if ("error" in current) return current;
      if (current.data !== actor.data) return { error: "UNAUTHENTICATED" };
      const data = parseInventory({ schemaVersion: "native-trip-inventory/1", ownerId: actor.data, coverage: INVENTORY_COVERAGE, complete: true,
        trips, count: trips.length, digest: inventoryDigest(actor.data, trips) });
      check(); return data ? { data } : { error: "PROVIDER_UNAVAILABLE" };
    } catch { return { error: "PROVIDER_UNAVAILABLE" }; }
    finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); controller.signal.removeEventListener("abort", cancelled); abort(); }
  };
}
