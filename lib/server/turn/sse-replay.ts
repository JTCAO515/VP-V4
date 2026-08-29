import { TURN_SCHEMA_VERSION, type TurnState } from "./contract.ts";

const EVENT_TYPES = ["accepted", "phase", "progress", "answer", "card", "proposal", "terminal"] as const;
const TERMINAL_STATES = ["completed", "proposal_ready", "unavailable", "failed", "cancelled"] as const;
const STATES = ["accepted", "planning", "retrieving", "generating", "validating", ...TERMINAL_STATES] as const;
const PHASE_STATES = ["accepted", "planning", "retrieving", "generating", "validating"] as const;
const IDENTIFIER = /^[A-Za-z0-9._:-]{1,160}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const TURN_SSE_CONTENT_TYPE = "text/event-stream; charset=utf-8";
export const TURN_SSE_RETRY_MS = 2_000;

export type TurnSseReplayEvent = Readonly<{
  eventId: string;
  sequence: number;
  type: (typeof EVENT_TYPES)[number];
  state: TurnState;
}>;

export class TurnSseReplayError extends Error {}

/**
 * Resolves the canonical replay cursor without accepting a second, conflicting transport cursor.
 * `Last-Event-ID` is deliberately the monotonic sequence, never a user-provided identifier.
 */
export function resolveTurnReplayCursor(value: Readonly<{ afterSequence: string | null; lastEventId: string | null }>): number {
  const queryCursor = value.afterSequence === null ? null : parseCursor(value.afterSequence);
  const headerCursor = value.lastEventId === null ? null : parseCursor(value.lastEventId);
  if (queryCursor !== null && headerCursor !== null && queryCursor !== headerCursor) {
    throw new TurnSseReplayError("Replay cursors conflict.");
  }
  return headerCursor ?? queryCursor ?? 0;
}

/**
 * Formats an already owner-authorized canonical replay as a finite SSE snapshot. It intentionally
 * sends only state metadata. A non-terminal snapshot ends in a heartbeat so the client can use
 * bounded polling when a serverless runtime cannot keep a live subscription open.
 */
export function encodeTurnSseReplay(turnId: string, values: readonly unknown[]): string {
  if (!UUID.test(turnId)) throw new TurnSseReplayError("Turn ID is invalid.");
  const events = values.map((value) => validateEvent(value));
  assertCanonicalHistory(events);
  const blocks = events.map((event) => formatTurnEvent(turnId, event));
  const terminal = events.at(-1)?.type === "terminal";
  if (!terminal) {
    const afterSequence = events.at(-1)?.sequence ?? 0;
    blocks.push(`retry: ${TURN_SSE_RETRY_MS}\nevent: heartbeat\ndata: ${JSON.stringify({ afterSequence })}\n\n`);
  }
  return blocks.join("");
}

function parseCursor(value: string): number {
  if (!/^(?:0|[1-9]\d{0,14})$/.test(value)) throw new TurnSseReplayError("Replay cursor is invalid.");
  const cursor = Number(value);
  if (!Number.isSafeInteger(cursor)) throw new TurnSseReplayError("Replay cursor is invalid.");
  return cursor;
}

function validateEvent(value: unknown): TurnSseReplayEvent {
  if (!isRecord(value) || !hasExactKeys(value, ["eventId", "sequence", "type", "state"])) {
    throw new TurnSseReplayError("Replay event is invalid.");
  }
  if (typeof value.eventId !== "string" || !IDENTIFIER.test(value.eventId) || typeof value.sequence !== "number" || !Number.isSafeInteger(value.sequence) || value.sequence < 1) {
    throw new TurnSseReplayError("Replay event is invalid.");
  }
  if (!EVENT_TYPES.includes(value.type as TurnSseReplayEvent["type"]) || !STATES.includes(value.state as TurnState)) {
    throw new TurnSseReplayError("Replay event is invalid.");
  }
  const type = value.type as TurnSseReplayEvent["type"];
  const state = value.state as TurnState;
  if ((type === "terminal") !== TERMINAL_STATES.includes(state as (typeof TERMINAL_STATES)[number])) {
    throw new TurnSseReplayError("Replay event terminal shape is invalid.");
  }
  return Object.freeze({ eventId: value.eventId, sequence: value.sequence, type, state });
}

function assertCanonicalHistory(events: readonly TurnSseReplayEvent[]): void {
  let previousSequence = 0;
  let previousPhase = -1;
  let terminal = false;
  for (const event of events) {
    if (terminal || event.sequence <= previousSequence) throw new TurnSseReplayError("Replay event order is invalid.");
    if (event.type !== "terminal") {
      const phase = PHASE_STATES.indexOf(event.state as (typeof PHASE_STATES)[number]);
      if (phase < previousPhase) throw new TurnSseReplayError("Replay state order is invalid.");
      previousPhase = phase;
    }
    previousSequence = event.sequence;
    terminal = event.type === "terminal";
  }
}

function formatTurnEvent(turnId: string, event: TurnSseReplayEvent): string {
  const data = {
    schemaVersion: TURN_SCHEMA_VERSION,
    turnId,
    eventId: event.eventId,
    sequence: event.sequence,
    type: event.type,
    state: event.state,
  };
  return `id: ${event.sequence}\nevent: turn\ndata: ${JSON.stringify(data)}\n\n`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}
