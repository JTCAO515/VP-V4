export const TURN_SCHEMA_VERSION = "turn-sse-v1";
export type TurnPhase = "accepted"|"planning"|"retrieving"|"generating"|"validating";
export type TurnTerminal = "completed"|"proposal_ready"|"unavailable"|"failed"|"cancelled";
export type TurnState = TurnPhase|TurnTerminal;
export type TurnEvent = Readonly<{turnId:string;eventId:string;sequence:number;schemaVersion:typeof TURN_SCHEMA_VERSION;type:"accepted"|"phase"|"progress"|"answer"|"card"|"proposal"|"terminal";state:TurnState}>;
const terminal = new Set<TurnTerminal>(["completed","proposal_ready","unavailable","failed","cancelled"]);
const isTerminal = (state: TurnState): state is TurnTerminal => terminal.has(state as TurnTerminal);
const order: TurnState[] = ["accepted","planning","retrieving","generating","validating","completed","proposal_ready","unavailable","failed","cancelled"];
export class TurnContractError extends Error {}
export class IdempotencyConflictError extends TurnContractError {}
export class TurnRequestRegistry { #requests=new Map<string,{digest:string;turnId:string}>();
  register(key:string,digest:string,turnId:string):{turnId:string;reused:boolean}{const prior=this.#requests.get(key);if(!prior){this.#requests.set(key,{digest,turnId});return{turnId,reused:false}}if(prior.digest!==digest)throw new IdempotencyConflictError("idempotency key reuse with different digest");return{turnId:prior.turnId,reused:true}}
}
export class TurnEventLog {
  #events: TurnEvent[]=[]; #terminal=false;
  append(event: Omit<TurnEvent,"sequence"|"schemaVersion">): TurnEvent {
    if(this.#terminal) throw new TurnContractError("terminal turn cannot emit events");
    const previous=this.#events.at(-1); const next={...event,sequence:this.#events.length+1,schemaVersion:TURN_SCHEMA_VERSION} as TurnEvent;
    if(previous && order.indexOf(next.state)<order.indexOf(previous.state)) throw new TurnContractError("turn state must be monotonic");
    if(next.type==="terminal" !== isTerminal(next.state)) throw new TurnContractError("only terminal events may use terminal states");
    this.#terminal=isTerminal(next.state); this.#events.push(Object.freeze(next)); return next;
  }
  replay(afterSequence=0): readonly TurnEvent[]{return this.#events.filter(event=>event.sequence>afterSequence)}
}
