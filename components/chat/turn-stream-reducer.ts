export type TurnStreamState = "accepted" | "planning" | "retrieving" | "generating" | "validating" | "completed" | "proposal_ready" | "unavailable" | "failed" | "cancelled";
export type TurnStreamEvent = Readonly<{
  schemaVersion: "turn-sse-v1";
  turnId: string;
  eventId: string;
  sequence: number;
  type: "accepted" | "phase" | "progress" | "answer" | "card" | "proposal" | "terminal";
  state: TurnStreamState;
}>;
export type TurnStreamRecord = Readonly<{ events: readonly TurnStreamEvent[]; cursor: number; state: TurnStreamState; terminal: boolean }>;
export type TurnStreamStore = Readonly<{ byTurn: Readonly<Record<string, TurnStreamRecord>> }>;
export type TurnStreamAction = Readonly<{ type: "events"; turnId: string; events: readonly TurnStreamEvent[] }> | Readonly<{ type: "reset" }>;

export const initialTurnStreamState: TurnStreamStore = Object.freeze({ byTurn: Object.freeze({}) });

export function turnStreamReducer(store: TurnStreamStore, action: TurnStreamAction): TurnStreamStore {
  if (action.type === "reset") return initialTurnStreamState;
  const prior = store.byTurn[action.turnId] ?? emptyRecord();
  let next = prior;
  for (const event of action.events) {
    if (event.turnId !== action.turnId || event.sequence <= next.cursor || next.terminal) continue;
    if (event.sequence !== next.cursor + 1) break;
    next = Object.freeze({
      events: Object.freeze([...next.events, event]),
      cursor: event.sequence,
      state: event.state,
      terminal: event.type === "terminal",
    });
  }
  if (next === prior) return store;
  return Object.freeze({ byTurn: Object.freeze({ ...store.byTurn, [action.turnId]: next }) });
}

function emptyRecord(): TurnStreamRecord {
  return Object.freeze({ events: Object.freeze([]), cursor: 0, state: "accepted", terminal: false });
}
