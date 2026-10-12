import { record, exact, uuid, natural, positive, member, type Entry } from './contract.ts';
export type TripAnchor = Readonly<{ kind: 'trip'; tripId: string; tripVersion: number; medium: 'pdf' | 'screenshot' }>;
export type GoalAnchor = Readonly<{ kind: 'goal'; conversationId: string; goalId: string; goalVersion: number; parentMessageId: string; inputSequence: number }>;
export type Source = Readonly<{ kind: 'service_task'; id: string; revision: null }>
  | Readonly<{ kind: 'native_entry'; logicalId: string; entry: 'e2'; anchor: TripAnchor }>
  | Readonly<{ kind: 'native_entry'; logicalId: string; entry: 'e3'; anchor: GoalAnchor }>;
export function source(v: unknown, entry?: Entry): v is Source {
  if (!record(v)) return false;
  if (v.kind === 'service_task') return (!entry || entry === 'e1') && exact(v, ['kind', 'id', 'revision']) && uuid(v.id) && v.revision === null;
  if (!exact(v, ['kind', 'logicalId', 'entry', 'anchor']) || v.kind !== 'native_entry' || !uuid(v.logicalId)
    || !member(v.entry, ['e2', 'e3']) || entry && entry !== v.entry || !record(v.anchor)) return false;
  const a = v.anchor;
  if (v.entry === 'e2') return exact(a, ['kind', 'tripId', 'tripVersion', 'medium']) && a.kind === 'trip' && uuid(a.tripId)
    && natural(a.tripVersion) && ['pdf', 'screenshot'].includes(String(a.medium));
  return exact(a, ['kind', 'conversationId', 'goalId', 'goalVersion', 'parentMessageId', 'inputSequence']) && a.kind === 'goal'
    && [a.conversationId, a.goalId, a.parentMessageId].every(uuid) && positive(a.goalVersion) && a.goalVersion <= 10000
    && positive(a.inputSequence) && a.inputSequence <= 1000000 && v.logicalId === a.goalId;
}
export type ClockOrigin = Readonly<{ kind: 'unknown' }> | Readonly<{ kind: 'native_monotonic'; processId: string }>;
export const clockOrigin = (v: unknown): v is ClockOrigin => record(v) && (v.kind === 'unknown' ? exact(v, ['kind'])
  : v.kind === 'native_monotonic' && exact(v, ['kind', 'processId']) && uuid(v.processId));
const canonical = (v: unknown): string => record(v) ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}` : JSON.stringify(v);
export const sameSource = (a: Source, b: Source) => canonical(a) === canonical(b);
export const sameClockOrigin = (a: ClockOrigin, b: ClockOrigin) => canonical(a) === canonical(b);
