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

  invalidate() {
    this.generation++;
    this.context = null;
    this.abort?.abort();
    this.abort = null;
  }

  async load(context: AddressContext, read: AddressReader, publish: (state: AddressState) => void): Promise<void> {
    this.invalidate();
    const generation = this.generation;
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
      publish(value ? { kind: "ready", context, value } : { kind: "unavailable", context });
    } catch {
      if (current()) publish({ kind: "unavailable", context });
    } finally { clearTimeout(timeout); }
  }
}
