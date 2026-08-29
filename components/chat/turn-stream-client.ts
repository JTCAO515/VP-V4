import type { TurnStreamEvent, TurnStreamState } from "./turn-stream-reducer";

const EVENT_TYPES = new Set(["accepted", "phase", "progress", "answer", "card", "proposal", "terminal"]);
const TERMINAL = new Set(["completed", "proposal_ready", "unavailable", "failed", "cancelled"]);
const STATES = new Set(["accepted", "planning", "retrieving", "generating", "validating", ...TERMINAL]);

export type TurnSseReplay = Readonly<{ events: readonly TurnStreamEvent[]; heartbeatAfterSequence: number | null }>;

export async function replayTurnSse(turnId: string, afterSequence: number, signal?: AbortSignal): Promise<TurnSseReplay> {
  const response = await fetch(`/api/chat/turns/${turnId}/events?afterSequence=${afterSequence}`, {
    cache: "no-store",
    headers: { Accept: "text/event-stream", "Last-Event-ID": String(afterSequence) },
    signal,
  });
  if (!response.ok) throw new Error(`SSE replay unavailable: ${response.status}`);
  if (!response.headers.get("content-type")?.includes("text/event-stream")) throw new Error("SSE replay content type is invalid.");
  const replay = decodeTurnSseReplay(await response.text());
  if (replay.events.some((event) => event.turnId !== turnId)) throw new Error("SSE replay Turn scope is invalid.");
  return replay;
}

export function decodeTurnSseReplay(source: string): TurnSseReplay {
  const events: TurnStreamEvent[] = [];
  let heartbeatAfterSequence: number | null = null;
  for (const frame of source.split("\n\n")) {
    if (!frame) continue;
    const values = new Map(frame.split("\n").map((line) => {
      const index = line.indexOf(": ");
      return index < 0 ? [line, ""] : [line.slice(0, index), line.slice(index + 2)];
    }));
    const event = values.get("event");
    const data = values.get("data");
    if (!event || !data) throw new Error("Malformed SSE frame.");
    if (event === "turn") {
      const parsed = JSON.parse(data) as unknown;
      if (!isTurnStreamEvent(parsed) || values.get("id") !== String(parsed.sequence)) throw new Error("Invalid SSE Turn event.");
      events.push(Object.freeze(parsed));
      continue;
    }
    if (event === "heartbeat") {
      const parsed = JSON.parse(data) as unknown;
      if (!isHeartbeat(parsed)) throw new Error("Invalid SSE heartbeat.");
      heartbeatAfterSequence = parsed.afterSequence;
      continue;
    }
    throw new Error("Unexpected SSE event.");
  }
  return Object.freeze({ events: Object.freeze(events), heartbeatAfterSequence });
}

/** Converts the owner-authorized thread snapshot into the same reducer vocabulary as SSE replay. */
export function turnEventsFromHistory(turnId: string, values: readonly unknown[]): readonly TurnStreamEvent[] {
  return Object.freeze(values.map((value) => {
    if (!isRecord(value) || !hasExactKeys(value, ["eventId", "sequence", "type", "state", "createdAt"]) || typeof value.createdAt !== "string") {
      throw new Error("Invalid stored Turn event.");
    }
    const event = { schemaVersion: "turn-sse-v1" as const, turnId, eventId: value.eventId, sequence: value.sequence, type: value.type, state: value.state };
    if (!isTurnStreamEvent(event)) throw new Error("Invalid stored Turn event.");
    return Object.freeze(event);
  }));
}

function isTurnStreamEvent(value: unknown): value is TurnStreamEvent {
  if (!isRecord(value) || !hasExactKeys(value, ["schemaVersion", "turnId", "eventId", "sequence", "type", "state"])) return false;
  const terminal = TERMINAL.has(String(value.state));
  return value.schemaVersion === "turn-sse-v1"
    && isIdentifier(value.turnId)
    && isIdentifier(value.eventId)
    && typeof value.sequence === "number"
    && Number.isSafeInteger(value.sequence)
    && value.sequence > 0
    && EVENT_TYPES.has(String(value.type))
    && STATES.has(String(value.state))
    && (value.type === "terminal") === terminal;
}

function isHeartbeat(value: unknown): value is Readonly<{ afterSequence: number }> {
  return isRecord(value) && hasExactKeys(value, ["afterSequence"]) && typeof value.afterSequence === "number" && Number.isSafeInteger(value.afterSequence) && value.afterSequence >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,160}$/.test(value);
}
