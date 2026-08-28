import {
  IdempotencyConflictError,
  TurnContractError,
  TurnEventLog,
  TurnRequestRegistry,
  type TurnEvent,
  type TurnState,
} from "./contract.ts";

const terminalStates = new Set<TurnState>(["completed", "proposal_ready", "unavailable", "failed", "cancelled"]);

export type ChatThread = Readonly<{ id: string; ownerId: string; tripId?: string; createdAt: string }>;
export type ThreadTurn = Readonly<{ id: string; threadId: string; ownerId: string; tripId?: string; state: TurnState; events: readonly TurnEvent[] }>;

export class ThreadAccessError extends Error {}
export class ThreadConflictError extends Error {}
export class TurnAlreadyTerminalError extends Error {}

type StoredTurn = { thread: ChatThread; turnId: string; log: TurnEventLog };

/**
 * Deterministic repository adapter for contract and UI integration tests.
 * A production adapter must preserve these owner, sequence, replay, and terminal invariants in storage.
 */
export class InMemoryThreadStore {
  #threads = new Map<string, ChatThread>();
  #turns = new Map<string, StoredTurn>();
  #requests = new TurnRequestRegistry();

  createThread(input: Readonly<{ id: string; ownerId: string; tripId?: string }>): ChatThread {
    if (this.#threads.has(input.id)) throw new ThreadConflictError("thread already exists");
    const thread = Object.freeze({ ...input, createdAt: new Date().toISOString() });
    this.#threads.set(thread.id, thread);
    return thread;
  }

  startTurn(input: Readonly<{ id: string; threadId: string; ownerId: string; idempotencyKey: string; digest: string }>): Readonly<{ turnId: string; reused: boolean }> {
    const thread = this.#threadFor(input.threadId, input.ownerId);
    const registered = this.#requests.register(`${thread.id}:${input.idempotencyKey}`, input.digest, input.id);
    if (registered.reused) return registered;
    if (this.#turns.has(input.id)) throw new ThreadConflictError("turn already exists");
    const log = new TurnEventLog();
    log.append({ turnId: input.id, eventId: "accepted", type: "accepted", state: "accepted" });
    this.#turns.set(input.id, { thread, turnId: input.id, log });
    return registered;
  }

  append(input: Readonly<{ ownerId: string; turnId: string; eventId: string; type: "phase" | "progress" | "answer" | "card" | "proposal"; state: TurnState }>): TurnEvent {
    const turn = this.#turnFor(input.turnId, input.ownerId);
    if (this.#isTerminal(turn)) throw new TurnAlreadyTerminalError("turn is already terminal");
    return turn.log.append({ turnId: input.turnId, eventId: input.eventId, type: input.type, state: input.state });
  }

  replay(input: Readonly<{ ownerId: string; turnId: string; afterSequence?: number }>): readonly TurnEvent[] {
    return this.#turnFor(input.turnId, input.ownerId).log.replay(input.afterSequence);
  }

  cancel(input: Readonly<{ ownerId: string; turnId: string }>): TurnEvent {
    const turn = this.#turnFor(input.turnId, input.ownerId);
    const last = turn.log.replay().at(-1);
    if (last?.state === "cancelled") return last;
    if (this.#isTerminal(turn)) throw new TurnAlreadyTerminalError("turn is already terminal");
    return turn.log.append({ turnId: input.turnId, eventId: `cancelled-${last?.sequence ?? 0}`, type: "terminal", state: "cancelled" });
  }

  history(input: Readonly<{ ownerId: string; threadId: string }>): readonly ThreadTurn[] {
    const thread = this.#threadFor(input.threadId, input.ownerId);
    return [...this.#turns.values()]
      .filter((turn) => turn.thread.id === thread.id)
      .map((turn) => {
        const events = turn.log.replay();
        return Object.freeze({ id: turn.turnId, threadId: thread.id, ownerId: thread.ownerId, tripId: thread.tripId, state: events.at(-1)?.state ?? "accepted", events });
      });
  }

  #threadFor(threadId: string, ownerId: string): ChatThread {
    const thread = this.#threads.get(threadId);
    if (!thread || thread.ownerId !== ownerId) throw new ThreadAccessError("thread not found or forbidden");
    return thread;
  }

  #turnFor(turnId: string, ownerId: string): StoredTurn {
    const turn = this.#turns.get(turnId);
    if (!turn || turn.thread.ownerId !== ownerId) throw new ThreadAccessError("turn not found or forbidden");
    return turn;
  }

  #isTerminal(turn: StoredTurn): boolean {
    return terminalStates.has(turn.log.replay().at(-1)?.state ?? "accepted");
  }
}

export { IdempotencyConflictError, TurnContractError };
