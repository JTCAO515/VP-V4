import { groundedEventFrames } from "../../../lib/server/turn/grounded-events.ts";
import { parseGroundedHistory, type SavedTurn } from "../../../lib/grounded/read-model.ts";
import { ownExact, record } from "../runtime-recovery/contract.ts";
import { RuntimeFailure } from "../runtime-recovery/transport.ts";
import type { AskRun } from "./contract.ts";

export function selectedTurn(value: unknown, policy: unknown, run: AskRun, elapsed: number): SavedTurn | null {
  return qualifiedTurn(value, policy, run, elapsed).turn;
}
function selectBoundTurn(turns: readonly SavedTurn[], run: AskRun): SavedTurn | null {
  const turn = turns.find(t => t.id === run.submission.turnId);
  if (!turn) return null;
  const s = run.submission;
  if (turn.threadId !== s.threadId || turn.taskId !== s.serviceTask.id || turn.parentId !== s.serviceTask.parentTurnId
    || turn.relationship !== s.serviceTask.relationship || turn.locale !== s.locale || turn.city !== s.city || turn.input !== s.text)
    throw new RuntimeFailure("SERVICE_TASK_CONFLICT");
  return turn;
}

/** Preserve the parser's remaining evidence lease, including parse time itself. */
export function qualifiedTurn(value: unknown, policy: unknown, run: AskRun, elapsed: number) {
  const observedAt = performance.now();
  if (!record(value) || value.version !== 4) throw new RuntimeFailure("MODEL_OUTPUT_INVALID");
  let history;
  try { history = parseGroundedHistory(run.context.ownerId, policy, value, run.context.policyId, elapsed); }
  catch { throw new RuntimeFailure("MODEL_OUTPUT_INVALID"); }
  const expiresAt = observedAt + history.lifetimeMs;
  const turn = selectBoundTurn(history.turns, run);
  if (performance.now() >= expiresAt) throw new RuntimeFailure("DATA_EXPIRED");
  return { turn, expiresAt };
}

/** Decode a finite Native v4 stream, then validate its current atomic snapshot
 * with the existing production grounded replay and browser projection parsers.
 * Stream contents never become display/publication authority. */
export function observeNativeEvents(text: unknown, cursor: number, policy: unknown, run: AskRun, elapsed: number, check: () => void) {
  if (typeof text !== "string") throw new RuntimeFailure("MODEL_OUTPUT_INVALID");
  const blocks = text.replaceAll("\r\n", "\n").split("\n\n").filter(b => b.trim());
  if (blocks.length < 1 || blocks.length > 256) throw new RuntimeFailure("MODEL_OUTPUT_INVALID");
  const events: { eventId: string; sequence: number; type: string; state: string }[] = [];
  let projection: unknown = null, next = cursor, terminal = false;
  for (const block of blocks) {
    check();
    const lines = block.split("\n");
    if (lines.length > 8 || lines.some(l => !l.startsWith("event: ") && !l.startsWith("data: ") && !l.startsWith("id: ") && !l.startsWith("retry: ")))
      throw new RuntimeFailure("MODEL_OUTPUT_INVALID");
    const values = (prefix: string) => lines.filter(l => l.startsWith(prefix)).map(l => l.slice(prefix.length));
    const names = values("event: "), bodies = values("data: "), ids = values("id: ");
    if (names.length !== 1 || bodies.length !== 1 || ids.length > 1) throw new RuntimeFailure("MODEL_OUTPUT_INVALID");
    let data: unknown;
    try { data = JSON.parse(bodies[0]); } catch { throw new RuntimeFailure("MODEL_OUTPUT_INVALID"); }
    if (names[0] === "unavailable") throw new RuntimeFailure("DATA_POLICY_BLOCKED");
    if (!record(data)) throw new RuntimeFailure("MODEL_OUTPUT_INVALID");
    if (names[0] === "heartbeat") {
      if (!ownExact(data, ["afterSequence"]) || data.afterSequence !== next || ids.length) throw new RuntimeFailure("MODEL_OUTPUT_INVALID");
      continue;
    }
    if (data.schemaVersion !== "grounded-events/1" || data.turnId !== run.submission.turnId) throw new RuntimeFailure("SERVICE_TASK_CONFLICT");
    if (names[0] === "projection") {
      if (!ownExact(data, ["schemaVersion", "turnId", "afterSequence", "turn"]) || data.afterSequence !== next || ids.length) throw new RuntimeFailure("MODEL_OUTPUT_INVALID");
      projection = data.turn; continue;
    }
    if (names[0] !== "turn" || !ownExact(data, ["schemaVersion", "turnId", "eventId", "sequence", "type", "state", "turn"])
      || ids.length !== 1 || typeof data.sequence !== "number" || !Number.isSafeInteger(data.sequence) || data.sequence <= next
      || ids[0] !== String(data.sequence) || typeof data.eventId !== "string" || typeof data.type !== "string" || typeof data.state !== "string" || terminal)
      throw new RuntimeFailure("MODEL_OUTPUT_INVALID");
    terminal = data.type === "terminal";
    if (terminal ? !record(data.turn) : data.turn !== null) throw new RuntimeFailure("MODEL_OUTPUT_INVALID");
    events.push({ eventId: data.eventId, sequence: data.sequence, type: data.type, state: data.state });
    next = data.sequence;
    if (terminal) projection = data.turn;
  }
  check();
  if (!record(projection)) throw new RuntimeFailure("MODEL_OUTPUT_INVALID");
  try {
    groundedEventFrames({ kind: "grounded_events", schemaVersion: "grounded-events/1", turn: projection, events, lastSequence: next }, run.submission.turnId, cursor);
  } catch { throw new RuntimeFailure("MODEL_OUTPUT_INVALID"); }
  const turn = selectedTurn({ version: 4, kind: "grounded_history", turns: [projection] }, policy, run, elapsed);
  if (!turn) throw new RuntimeFailure("SERVICE_TASK_CONFLICT");
  return { cursor: next, turn };
}
