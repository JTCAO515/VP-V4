/** Content-free, tab-scoped recovery metadata. Never persist text/digests/auth. */
export const PENDING_IDENTITY_KEY = "vp.qa.pending-identity/v1";
export type PendingIdentity = Readonly<{ sessionId: string; requestId: string }>;
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const uuid = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
export class PendingIdentityStorageError extends Error {
  constructor() { super("Pending request recovery storage unavailable"); }
}
function storage(store?: Store): Store { return store ?? window.sessionStorage; }
export function clearPendingIdentities(store?: Store): void {
  try {
    const target = storage(store); target.removeItem(PENDING_IDENTITY_KEY);
    if (target.getItem(PENDING_IDENTITY_KEY) !== null) throw new PendingIdentityStorageError();
  } catch { throw new PendingIdentityStorageError(); }
}
function read(actorId: string, store: Store | undefined, clearOtherActor: boolean): PendingIdentity[] {
  try {
    if (!uuid(actorId)) throw new PendingIdentityStorageError();
    const target = storage(store), raw = target.getItem(PENDING_IDENTITY_KEY);
    if (raw === null) return [];
    const value: unknown = JSON.parse(raw);
    if (!record(value) || !exact(value, ["version", "actorId", "requests"]) || value.version !== 1 || !uuid(value.actorId)) throw new PendingIdentityStorageError();
    if (value.actorId !== actorId) {
      if (!clearOtherActor) throw new PendingIdentityStorageError();
      clearPendingIdentities(target); return [];
    }
    if (!Array.isArray(value.requests) || value.requests.length > 64) throw new PendingIdentityStorageError();
    const seen = new Set<string>();
    return value.requests.map((entry: unknown) => {
      if (!record(entry) || !exact(entry, ["sessionId", "requestId"]) || !uuid(entry.sessionId) || !uuid(entry.requestId) || seen.has(entry.sessionId)) throw new PendingIdentityStorageError();
      seen.add(entry.sessionId); return { sessionId: entry.sessionId, requestId: entry.requestId };
    });
  } catch { throw new PendingIdentityStorageError(); }
}
export function readPendingIdentities(actorId: string, store?: Store): PendingIdentity[] {
  return read(actorId, store, true);
}
function write(actorId: string, requests: PendingIdentity[], store?: Store) {
  const target = storage(store);
  if (!requests.length) { clearPendingIdentities(target); return; }
  const raw = JSON.stringify({ version: 1, actorId, requests });
  target.setItem(PENDING_IDENTITY_KEY, raw);
  if (target.getItem(PENDING_IDENTITY_KEY) !== raw) throw new PendingIdentityStorageError();
}
export function rememberPendingIdentity(actorId: string, identity: PendingIdentity, store?: Store): void {
  try {
    if (!uuid(identity.sessionId) || !uuid(identity.requestId)) throw new PendingIdentityStorageError();
    const requests = read(actorId, store, false), original = requests.find(entry => entry.sessionId === identity.sessionId);
    // An unresolved identity can only be queried/replayed, never replaced.
    if (original && original.requestId !== identity.requestId) throw new PendingIdentityStorageError();
    if (!original) requests.push({ sessionId: identity.sessionId, requestId: identity.requestId });
    if (requests.length > 64) throw new PendingIdentityStorageError();
    write(actorId, requests, store);
  } catch { throw new PendingIdentityStorageError(); }
}
export function confirmPendingIdentity(actorId: string, identity: PendingIdentity, store?: Store): void {
  try {
    const requests = read(actorId, store, false);
    write(actorId, requests.filter(entry => entry.sessionId !== identity.sessionId || entry.requestId !== identity.requestId), store);
  } catch { throw new PendingIdentityStorageError(); }
}
