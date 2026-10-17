import { sameAddressContext, type AddressContext } from "./context.ts";
import { decodeAddressRead, type AddressRead, type AddressReader } from "./read.ts";

export type AddressState =
  | Readonly<{ kind: "loading" | "unavailable"; context: AddressContext }>
  | Readonly<{ kind: "ready"; context: AddressContext; value: AddressRead }>;

/** An instance belongs to one mounted consumer. Nothing survives route/actor replacement. */
export class AddressReadController {
  private generation = 0;
  private abort: AbortController | null = null;
  private context: AddressContext | null = null;
  private referenceExpiry: ReturnType<typeof setTimeout> | null = null;

  invalidate() {
    this.generation++;
    if (this.referenceExpiry !== null) clearTimeout(this.referenceExpiry);
    this.referenceExpiry = null;
    this.context = null;
    this.abort?.abort();
    this.abort = null;
  }

  async load(context: AddressContext, read: AddressReader, publish: (state: AddressState) => void): Promise<void> {
    this.invalidate();
    const generation = this.generation;
    const startedAt = performance.now();
    this.context = context;
    const abort = new AbortController();
    this.abort = abort;
    const current = () => generation === this.generation && this.context !== null && sameAddressContext(this.context, context);
    publish({ kind: "loading", context });
    const timeout = setTimeout(() => {
      if (current()) { this.invalidate(); publish({ kind: "unavailable", context }); }
    }, 8000);
    try {
      const raw = await read(context, abort.signal);
      if (!current()) return;
      const value = decodeAddressRead(raw, context);
      if (!value) { publish({ kind: "unavailable", context }); return; }
      if (value.references.length === 0) { publish({ kind: "ready", context, value }); return; }
      const remaining = Math.max(0, Math.min(30000 - (performance.now() - startedAt),
        ...value.references.map(reference => Date.parse(reference.expiresAt) - Date.now())));
      const expire = () => {
        this.referenceExpiry = null;
        if (current()) publish({ kind: "ready", context, value: { ...value, references: [], referencesUnavailable: true } });
      };
      // Display eligibility only: no automatic network read and no change to confirmed manual text.
      if (remaining <= 0) { expire(); return; }
      publish({ kind: "ready", context, value });
      this.referenceExpiry = setTimeout(expire, remaining);
    } catch {
      if (current()) publish({ kind: "unavailable", context });
    } finally { clearTimeout(timeout); }
  }
}
