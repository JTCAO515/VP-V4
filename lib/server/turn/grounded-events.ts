import { encodeTurnSseReplay, type TurnSseReplayEvent } from "./sse-replay.ts";

export type GroundedEventSnapshot = {
  kind: "grounded_events"; schemaVersion: "grounded-events/1";
  turn: Record<string, unknown>; events: TurnSseReplayEvent[]; lastSequence: number;
};
const terminal = ["completed", "unavailable", "failed", "cancelled"];
/** SQL authorizes the whole projection; native additionally validates its typed
 * factual contract before display. Never expose an internal classification chunk. */
export function groundedEventFrames(value: unknown, turnId: string, after: number): { text: string; cursor: number; terminal: boolean } {
  if (!record(value) || value.kind !== "grounded_events" || value.schemaVersion !== "grounded-events/1"
    || !record(value.turn) || value.turn.kind !== "grounded_turn" || value.turn.schemaVersion !== "grounded-turn/1"
    || value.turn.turnId !== turnId || !Array.isArray(value.events) || value.events.length > 200
    || !Number.isSafeInteger(value.lastSequence) || (value.lastSequence as number) < after) throw new Error("Invalid grounded replay");
  // Reuse canonical event validation (closed fields, order, terminal last).
  encodeTurnSseReplay(turnId, value.events);
  const events = value.events as TurnSseReplayEvent[];
  if (events.some(event => event.sequence <= after) || (events.at(-1)?.sequence ?? after) !== value.lastSequence) throw new Error("Invalid grounded cursor");
  const done = terminal.includes(String(value.turn.status));
  const last = events.at(-1);
  // A failed/cancelled lease can finish without a persisted Turn terminal when
  // its original session lost authority. Only the empty unfinished projection
  // may end that stream; the replay cursor and stored history remain unchanged.
  const result = value.turn.result;
  const unfinishedTerminal = ["cancelled", "failed"].includes(String(value.turn.status))
    && value.turn.outcome === null && value.turn.output === null && record(result)
    && result.projection === "pending" && result.completedAt === null
    && result.intent === null && result.requestScope === null
    && result.originalOutcome === null && result.knowledge === null;
  if (last && !(unfinishedTerminal && last.type !== "terminal") && ((last.type === "terminal") !== done || (done && last.state !== value.turn.status))) throw new Error("Invalid grounded terminal");
  const frame = (event: string, data: unknown, sequence?: number) => `${sequence === undefined ? "" : `id: ${sequence}\n`}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  let text = events.map(event => frame("turn", {
    schemaVersion: "grounded-events/1", turnId, ...event,
    // One indivisible frame contains terminal state and its complete current card.
    turn: event.type === "terminal" ? value.turn : null,
  }, event.sequence)).join("");
  // A cursor is not a cache. An id-less projection restores the current answer
  // after process loss/TTL expiry even when the terminal event was acknowledged.
  if (!last || last.type !== "terminal") text += frame("projection", { schemaVersion: "grounded-events/1", turnId, afterSequence: value.lastSequence, turn: value.turn });
  if (!done) text += `retry: 2000\nevent: heartbeat\ndata: ${JSON.stringify({ afterSequence: value.lastSequence })}\n\n`;
  if (Buffer.byteLength(text) > 262_144) throw new Error("Grounded replay capacity");
  return { text, cursor: value.lastSequence as number, terminal: done };
}
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
