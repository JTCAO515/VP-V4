import type { UserArtifactImportStore } from "../../artifacts/user-artifact.ts";
type Guidance = Readonly<{ kind: "rail_guidance"; serviceId: string; timing: Readonly<{ departsAt: string; arrivesAt: string }>; officialRecheck: true }> | Readonly<{ kind: "rail_unavailable"; officialRecheck: true }>;

/** Pure C0 rail projection: only a user-confirmed artifact can supply exact timing. */
export function projectRailGuidance(input: unknown, artifacts: UserArtifactImportStore): Guidance {
  if (!input || typeof input !== "object" || Array.isArray(input)) return unavailable();
  const value = input as Record<string, unknown>;
  if (Object.keys(value).length !== 3 || !Object.keys(value).every((key) => key === "serviceId" || key === "ownerId" || key === "artifactId") || !id(value.serviceId) || !id(value.ownerId) || !id(value.artifactId)) return unavailable();
  const artifact = artifacts.getConfirmedRailArtifact(value.ownerId, value.artifactId, value.serviceId);
  if (!artifact) return unavailable();
  return freeze({ kind: "rail_guidance" as const, serviceId: value.serviceId, timing: artifact, officialRecheck: true as const });
}
function unavailable(): Guidance { return freeze({ kind: "rail_unavailable" as const, officialRecheck: true as const }); }
function id(value: unknown): value is string { return typeof value === "string" && /^[a-z][a-z0-9_-]{0,127}$/.test(value); }
function freeze<T>(value:T): Readonly<T>{if(value&&typeof value==="object")Object.values(value as object).forEach(freeze);return Object.freeze(value);}
