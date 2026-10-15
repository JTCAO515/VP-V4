export type AddressActor = Readonly<{ identity: string; key: string; expiresAt: number }>;
const uuid = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const row = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

/** Ephemeral display/request fence only. Cookie/RLS services remain the authority. */
export class AddressActorGate {
  private generation = 0;
  private lease: AddressActor | null = null;
  private expiry: ReturnType<typeof setTimeout> | null = null;
  private publish: (actor: AddressActor | null) => void;
  constructor(publish: (actor: AddressActor | null) => void) { this.publish = publish; }
  current(): AddressActor | null {
    return this.lease && this.lease.expiresAt > Date.now() ? this.lease : null;
  }
  invalidate() {
    this.generation++;
    this.lease = null;
    if (this.expiry !== null) clearTimeout(this.expiry);
    this.expiry = null;
    this.publish(null);
  }
  async verify(getClaims: () => Promise<unknown>): Promise<void> {
    this.invalidate();
    const generation = this.generation;
    const timeout = setTimeout(() => { if (generation === this.generation) this.invalidate(); }, 8000);
    try {
      const result = await getClaims();
      if (generation !== this.generation || !row(result) || result.error || !row(result.data) || !row(result.data.claims)) return;
      const claims = result.data.claims;
      if (!uuid(claims.sub) || !uuid(claims.session_id) || claims.role !== "authenticated" || claims.is_anonymous === true
        || typeof claims.exp !== "number" || !Number.isFinite(claims.exp) || claims.exp * 1000 <= Date.now()) return;
      const identity = `${claims.sub.toLowerCase()}:${claims.session_id.toLowerCase()}`;
      this.lease = { identity, key: `${identity}:${generation}`, expiresAt: claims.exp * 1000 };
      this.publish(this.lease);
      this.expiry = setTimeout(() => { if (generation === this.generation) this.invalidate(); }, Math.min(claims.exp * 1000 - Date.now(), 2147483647));
    } catch { /* Unknown claims remain unavailable; never fall back to cached/static identity. */ }
    finally { clearTimeout(timeout); }
  }
}
