type Decision = Readonly<{ kind: "reject"; adapter: "thin_http" }>;

/** ML-01's C0 gate: unverified local claims can never authorize an SDK adoption. */
export function decideAiSdkAdoption(_unverifiedClaims: unknown): Decision {
  return freeze({ kind: "reject" as const, adapter: "thin_http" as const });
}
function freeze<T>(value: T): Readonly<T> { return Object.freeze(value); }
