import { isUuid } from "../../identity/request-guards.ts";
import { resolveTurnReplayCursor } from "../sse-replay.ts";

export const ASSISTANT_EVENTS_SCHEMA = "assistant-events/1";
export const ASSISTANT_EVENTS_LIMIT = 50;
export const ASSISTANT_EVENTS_BYTES = 65_536;
const states = ["accepted", "planning", "retrieving", "generating", "validating", "completed", "proposal_ready", "unavailable", "failed", "cancelled"];
type Base = Readonly<{ eventId: string; sequence: number }>;
type LiveBase = Base & Readonly<{ taskId: string; turnId: string }>;
export type AssistantEvent =
  (Base & Readonly<{ type: "source_retired"; retiredSequence: number }>) | LiveBase & (
  Readonly<{ type: "task_status"; status: string }> |
  Readonly<{ type: "task_progress"; tool: "evidence.lookup" | "place.read" | "constraints.evaluate" | "result.prepare"; state: "started" | "completed" | "unknown" }> |
  Readonly<{ type: "artifact_ready" | "artifact_updated" | "artifact_invalidated"; artifactId: string; revision: number; availability: "recheck" | "unavailable" }>
);
export type AssistantEventsPage = Readonly<{
  kind: "assistant_events"; schemaVersion: typeof ASSISTANT_EVENTS_SCHEMA; conversationId: string;
  afterSequence: number; lastSequence: number; hasMore: boolean; events: readonly AssistantEvent[];
}>;
const uuid = (v: unknown): v is string => typeof v === "string" && isUuid(v);
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const sequence = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= 999999999999999;
export const assistantReplayCursor = (lastEventId: string | null) => resolveTurnReplayCursor({ afterSequence: null, lastEventId });

/** Validate the entire authorized page before emitting any cursor. Events are invalidation
 * hints only: an artifact always requires its original exact-revision GET before display. */
export function decodeAssistantEvents(value: unknown, conversationId: string, after: number): AssistantEventsPage {
  if (!isUuid(conversationId) || !sequence(after) || !record(value)
    || !exact(value, ["kind", "schemaVersion", "conversationId", "afterSequence", "lastSequence", "hasMore", "events"])
    || value.kind !== "assistant_events" || value.schemaVersion !== ASSISTANT_EVENTS_SCHEMA
    || value.conversationId !== conversationId || value.afterSequence !== after
    || !sequence(value.lastSequence) || typeof value.hasMore !== "boolean" || !Array.isArray(value.events)
    || value.events.length > ASSISTANT_EVENTS_LIMIT || (value.hasMore && value.events.length !== ASSISTANT_EVENTS_LIMIT)) throw new Error("Invalid assistant replay");
  let previous = after;
  const events: AssistantEvent[] = [];
  for (const event of value.events) {
    if (!record(event) || !sequence(event.sequence) || event.sequence !== previous + 1
      || event.eventId !== `${conversationId}:${event.sequence}`) throw new Error("Invalid assistant event");
    const base = ["eventId", "sequence", "taskId", "turnId", "type"];
    if (event.type === "source_retired") {
      if (!exact(event, ["eventId", "sequence", "type", "retiredSequence"])
        || !sequence(event.retiredSequence) || event.retiredSequence < 1 || event.retiredSequence > event.sequence) throw new Error("Invalid retirement event");
    } else if (!uuid(event.taskId) || !uuid(event.turnId)) {
      throw new Error("Invalid assistant source reference");
    } else if (event.type === "task_status") {
      if (!exact(event, [...base, "status"]) || typeof event.status !== "string" || !states.includes(event.status)) throw new Error("Invalid task event");
    } else if (event.type === "task_progress") {
      if (!exact(event, [...base, "tool", "state"])
        || typeof event.tool !== "string" || !["evidence.lookup", "place.read", "constraints.evaluate", "result.prepare"].includes(String(event.tool))
        || typeof event.state !== "string" || !["started", "completed", "unknown"].includes(String(event.state))) throw new Error("Invalid progress event");
    } else {
      if (!exact(event, [...base, "artifactId", "revision", "availability"])
        || typeof event.type !== "string" || !["artifact_ready", "artifact_updated", "artifact_invalidated"].includes(String(event.type))
        || !uuid(event.artifactId) || typeof event.revision !== "number" || !Number.isInteger(event.revision) || event.revision < 1 || event.revision > 1000
        || typeof event.availability !== "string" || !["recheck", "unavailable"].includes(String(event.availability))
        || (event.type === "artifact_invalidated" && event.availability !== "unavailable")) throw new Error("Invalid artifact event");
    }
    events.push(Object.freeze({ ...event }) as AssistantEvent);
    previous = event.sequence;
  }
  if (value.lastSequence !== previous) throw new Error("Invalid assistant cursor");
  const page: AssistantEventsPage = { kind: "assistant_events" as const, schemaVersion: ASSISTANT_EVENTS_SCHEMA,
    conversationId, afterSequence: after, lastSequence: previous, hasMore: value.hasMore, events: Object.freeze(events) };
  if (Buffer.byteLength(JSON.stringify(page)) > ASSISTANT_EVENTS_BYTES) throw new Error("Assistant replay capacity");
  return Object.freeze(page);
}

export function assistantEventFrames(page: AssistantEventsPage): string {
  const text = page.events.map(event => `id: ${event.sequence}\nevent: assistant\ndata: ${JSON.stringify({ schemaVersion: ASSISTANT_EVENTS_SCHEMA, conversationId: page.conversationId, ...event })}\n\n`).join("")
    + `retry: 2000\nevent: checkpoint\ndata: ${JSON.stringify({ schemaVersion: ASSISTANT_EVENTS_SCHEMA, conversationId: page.conversationId, afterSequence: page.lastSequence, hasMore: page.hasMore })}\n\n`;
  if (Buffer.byteLength(text) > ASSISTANT_EVENTS_BYTES) throw new Error("Assistant replay capacity");
  return text;
}
