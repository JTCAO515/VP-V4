type Segment = Readonly<{ mode: "flight" | "rail"; serviceId: string; departsAt: string; arrivesAt: string }>;
type Artifact = Readonly<{ id: string; ownerId: string; version: 1; kind: "pdf" | "image" | "ics"; segment: Segment; confirmedAt: string }>;
type Outcome = Readonly<{ kind: "confirmed"; artifact: Artifact; proposal: Readonly<{ kind: "pending_user_artifact_proposal"; tripId: string; baseTripVersion: number; artifactId: string; artifactVersion: 1 }> }> | Readonly<{ kind: "already_confirmed" | "import_conflict" | "redaction_required" }>;

export class UserArtifactImportStore {
  #imports = new Map<string, { digest: string; result: Outcome }>();
  #artifacts = new Map<string, Artifact>();
  getConfirmedRailArtifact(ownerId: string, artifactId: string, serviceId: string): Readonly<{ departsAt: string; arrivesAt: string }> | null {
    const artifact = this.#artifacts.get(`${ownerId}:${artifactId}`);
    return artifact?.segment.mode === "rail" && artifact.segment.serviceId === serviceId ? freeze({ departsAt: artifact.segment.departsAt, arrivesAt: artifact.segment.arrivesAt }) : null;
  }
  confirm(input: unknown): Outcome {
    try {
      exact(input, ["ownerId", "importId", "artifactId", "kind", "redaction", "segment", "now", "tripId", "baseTripVersion"]);
      if (!redacted(input.redaction)) return freeze({ kind: "redaction_required" as const });
      const segment = parseSegment(input.segment);
      if (!id(input.ownerId) || !id(input.importId) || !id(input.artifactId) || !id(input.tripId) || !["pdf", "image", "ics"].includes(input.kind as string) || !Number.isSafeInteger(input.baseTripVersion) || (input.baseTripVersion as number) < 0 || !instant(input.now)) return freeze({ kind: "import_conflict" as const });
      const digest = JSON.stringify([input.ownerId, input.artifactId, input.kind, segment, input.tripId, input.baseTripVersion]);
      const prior = this.#imports.get(input.importId as string);
      if (prior) return prior.digest === digest ? freeze({ kind: "already_confirmed" as const }) : freeze({ kind: "import_conflict" as const });
      const artifact = freeze({ id: input.artifactId as string, ownerId: input.ownerId as string, version: 1 as const, kind: input.kind as "pdf" | "image" | "ics", segment, confirmedAt: input.now as string });
      const result = freeze({ kind: "confirmed" as const, artifact, proposal: freeze({ kind: "pending_user_artifact_proposal" as const, tripId: input.tripId as string, baseTripVersion: input.baseTripVersion as number, artifactId: artifact.id, artifactVersion: 1 as const }) });
      this.#imports.set(input.importId as string, { digest, result }); this.#artifacts.set(`${artifact.ownerId}:${artifact.id}`, artifact); return result;
    } catch { return freeze({ kind: "import_conflict" as const }); }
  }
}
function exact(v: unknown, k: readonly string[]): asserts v is Record<string, unknown> { if (!v || typeof v !== "object" || Array.isArray(v) || Object.keys(v).length !== k.length || Object.keys(v).some(x => !k.includes(x))) throw new TypeError(); }
function id(v: unknown): v is string { return typeof v === "string" && /^[a-z][a-z0-9_-]{0,127}$/.test(v); }
function redacted(v: unknown): boolean { if (!v || typeof v !== "object" || Array.isArray(v)) return false; const r=v as Record<string,unknown>; return Object.keys(r).length===4 && ["pnr","ticketNumber","qrCode","passport"].every(k=>r[k]===true); }
function parseSegment(v: unknown): Segment { exact(v,["mode","serviceId","departsAt","arrivesAt"]); if ((v.mode!=="flight"&&v.mode!=="rail")||!id(v.serviceId)||!instant(v.departsAt)||!instant(v.arrivesAt)||Date.parse(v.departsAt as string)>=Date.parse(v.arrivesAt as string)) throw new TypeError(); return freeze({mode:v.mode,serviceId:v.serviceId as string,departsAt:v.departsAt as string,arrivesAt:v.arrivesAt as string}); }
function instant(v: unknown): v is string { if(typeof v!=="string")return false;const m=/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d{1,3})?Z$/.exec(v);if(!m)return false;const [y,mo,d,h,mi,s]=m.slice(1).map(Number);const date=new Date(Date.UTC(y,mo-1,d,h,mi,s));return date.getUTCFullYear()===y&&date.getUTCMonth()===mo-1&&date.getUTCDate()===d&&date.getUTCHours()===h&&date.getUTCMinutes()===mi&&date.getUTCSeconds()===s; }
function freeze<T>(v:T): Readonly<T>{if(v&&typeof v==="object")Object.values(v as object).forEach(freeze);return Object.freeze(v);}
