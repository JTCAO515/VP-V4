/** Internal JSON decoder. Only reflection touches the original graph; all later
 * property reads/serialization use newly constructed plain values. Reflection
 * traps can execute or throw and are handled by the caller's closed boundary. */
export function descriptorSnapshot(value: unknown, maxBytes: number, maxArray = 256): unknown {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 131072
    || !Number.isSafeInteger(maxArray) || maxArray < 1 || maxArray > 256) throw new Error("SNAPSHOT_LIMIT");
  let remaining = maxBytes;
  let nodes = 0;
  const charge = (count: number) => {
    remaining -= count;
    if (remaining < 0) throw new Error("SNAPSHOT_LIMIT");
  };
  const copy = (original: unknown, depth: number): unknown => {
    if (depth > 12 || ++nodes > 4096) throw new Error("SNAPSHOT_LIMIT");
    if (original === null || typeof original === "boolean" || typeof original === "number" || typeof original === "string") {
      if (typeof original === "number" && !Number.isFinite(original)) throw new Error("SNAPSHOT_INVALID");
      if (typeof original === "string" && Buffer.byteLength(original, "utf8") > remaining) throw new Error("SNAPSHOT_LIMIT");
      charge(Buffer.byteLength(JSON.stringify(original), "utf8"));
      return original;
    }
    if (!original || typeof original !== "object") throw new Error("SNAPSHOT_INVALID");
    const array = Array.isArray(original);
    const prototype = Object.getPrototypeOf(original);
    if (prototype !== null && prototype !== (array ? Array.prototype : Object.prototype)) throw new Error("SNAPSHOT_INVALID");
    let length = 0;
    if (array) {
      const field = Object.getOwnPropertyDescriptor(original, "length");
      if (!field || !Object.hasOwn(field, "value") || !Number.isSafeInteger(field.value)
        || field.value < 0 || field.value > maxArray) throw new Error("SNAPSHOT_LIMIT");
      length = field.value as number;
    }
    const names = Reflect.ownKeys(original);
    if (names.length > 257 || (array && names.length !== length + 1)) throw new Error("SNAPSHOT_LIMIT");
    charge(2 + Math.max(0, (array ? length : names.length) - 1));
    const result: unknown[] | Record<string, unknown> = array ? new Array<unknown>(length) : Object.create(null);
    for (const key of names) {
      if (array && key === "length") continue;
      const field = Object.getOwnPropertyDescriptor(original, key);
      if (typeof key !== "string" || !field || !field.enumerable || !Object.hasOwn(field, "value")) throw new Error("SNAPSHOT_INVALID");
      if (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= length)) throw new Error("SNAPSHOT_INVALID");
      if (!array) {
        if (Buffer.byteLength(key, "utf8") > remaining) throw new Error("SNAPSHOT_LIMIT");
        charge(Buffer.byteLength(JSON.stringify(key), "utf8") + 1);
      }
      Object.defineProperty(result, key, { value: copy(field.value, depth + 1), enumerable: true, writable: true, configurable: true });
    }
    return result;
  };
  return copy(value, 0);
}
