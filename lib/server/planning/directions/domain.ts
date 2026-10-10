import { applyPatch, assertTripSnapshot, type TripPatch, type TripPatchOperation, type TripSnapshot } from '../../trip/patch/contract.ts';
import { TRAVEL_PACES, type TaskTravelPace, type TravelPace } from '../../memory/travel-pace.ts';

/** Private typed domain. HTTP/SQL qualification and shared wire require separate approval. */
export type DirectionsInput = Readonly<{
  destinations: readonly string[]; durationDays: number | null; interests: readonly string[];
  currentPace: TravelPace | null; budgetMinorUnits: number | null;
  intent: 'explore' | 'specific'; locale: 'zh' | 'en';
}>;
export type Direction = Readonly<{ id: 'depth' | 'breadth'; title: string; tradeoff: string }>;
export type RelativeDay = Readonly<{ ordinal: number; destination: string; activities: readonly string[] }>;
export type RelativePlan = Readonly<{
  directionId: Direction['id']; requestedDays: number | null; days: readonly RelativeDay[];
  coverage: 'complete_relative' | 'partial_relative'; limitations: readonly string[];
  pace: TravelPace | null; paceSource: 'current_input' | 'profile' | 'none';
}>;
export class DirectionsError extends Error {}
const fail = (code: string): never => { throw new DirectionsError(code); };
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v === v.trim() && v.length > 0 && v.length <= max && !/[\u0000-\u001f]/.test(v);
const int = (v: unknown, min: number, max: number): v is number => Number.isSafeInteger(v) && Number(v) >= min && Number(v) <= max;
function validate(input: DirectionsInput): void {
  if (!input || Object.keys(input).sort().join() !== 'budgetMinorUnits,currentPace,destinations,durationDays,intent,interests,locale'
    || !Array.isArray(input.destinations) || input.destinations.length > 30 || input.destinations.some(v => !text(v, 80)) || new Set(input.destinations).size !== input.destinations.length
    || input.durationDays !== null && !int(input.durationDays, 1, 30)
    || !Array.isArray(input.interests) || input.interests.length > 8 || input.interests.some(v => !text(v, 40)) || new Set(input.interests).size !== input.interests.length
    || input.currentPace !== null && !TRAVEL_PACES.includes(input.currentPace)
    || input.budgetMinorUnits !== null && !int(input.budgetMinorUnits, 1, 10000000)
    || !['explore', 'specific'].includes(input.intent) || !['zh', 'en'].includes(input.locale)) fail('INVALID_INPUT');
}
export function directions(input: DirectionsInput): readonly Direction[] {
  validate(input);
  const zh = input.locale === 'zh';
  const depth: Direction = { id: 'depth', title: zh ? '留白与深入' : 'Space to explore', tradeoff: zh ? '每天少安排一项，给个人兴趣留更多时间；覆盖面较小。' : 'Fewer activities each day leave more time for your interests, with less breadth.' };
  const breadth: Direction = { id: 'breadth', title: zh ? '更多主题' : 'More variety', tradeoff: zh ? '每天多安排一个兴趣主题，探索面更广；休息和临时调整空间较少。' : 'An extra interest theme each day gives more variety, with less room for rest or changes.' };
  return input.intent === 'specific' ? [input.currentPace === 'packed' ? breadth : depth] : [depth, breadth];
}
/** Accept only the existing task-scoped Profile projection. It grants no server/model consent. */
function effectivePace(input: DirectionsInput, tripId: string | null, projection: TaskTravelPace | null): { pace: TravelPace | null; source: RelativePlan['paceSource'] } {
  if (input.currentPace !== null) return { pace: input.currentPace, source: 'current_input' };
  if (projection === null) return { pace: null, source: 'none' };
  if (Object.keys(projection).sort().join() !== 'purpose,schemaVersion,source,sourceOperationId,sourceRevision,travelPace,tripId'
    || projection.schemaVersion !== 'task-travel-pace/1' || projection.purpose !== 'local_trip_planning' || tripId === null || projection.tripId !== tripId
    || projection.source !== 'profile' || !int(projection.sourceRevision, 1, 9007199254740990)
    || !text(projection.sourceOperationId, 64) || projection.travelPace === null || !TRAVEL_PACES.includes(projection.travelPace)) fail('INVALID_PREFERENCE_PROJECTION');
  return { pace: projection.travelPace, source: 'profile' };
}
export function relativePlan(input: DirectionsInput, directionId: Direction['id'], tripId: string | null = null, projection: TaskTravelPace | null = null): RelativePlan {
  validate(input);
  if (!directions(input).some(d => d.id === directionId)) fail('DIRECTION_NOT_AVAILABLE');
  const selected = effectivePace(input, tripId, projection);
  const days: RelativeDay[] = [];
  const zh = input.locale === 'zh';
  const limitations = [zh ? '日期、交通、营业时间与价格尚未核实；这是相对日想法，不是可执行行程。' : 'Dates, transport, opening hours and prices are unverified; this is a relative-day idea, not an executable itinerary.'];
  if (input.budgetMinorUnits !== null) limitations.push(zh ? '预算已保留；没有报价依据，不能证明安排符合预算。' : 'Your budget is retained; without price evidence, affordability is unknown.');
  if (input.durationDays === null) limitations.push(zh ? '天数未定，可跳过后再补。' : 'Duration is unknown and can be added later.');
  if (!input.destinations.length) limitations.push(zh ? '目的地未定，可先选方向。' : 'Destination is unknown; you can choose a direction first.');
  if (input.durationDays !== null && input.destinations.length) {
    const used = Math.min(input.durationDays, input.destinations.length);
    if (used < input.destinations.length) limitations.push((zh ? '本草稿未分配目的地：' : 'Destinations not allocated in this draft: ') + input.destinations.slice(used).join(', '));
    for (let i = 0; i < input.durationDays; i++) {
      const destination = input.destinations[Math.min(used - 1, Math.floor(i * used / input.durationDays))];
      const count = selected.pace === 'relaxed' ? 1 : directionId === 'breadth' || selected.pace === 'packed' ? 2 : 1;
      const activities = input.interests.length ? Array.from({ length: Math.min(count, input.interests.length) }, (_, n) => (zh ? '预留主题：' : 'Time for: ') + input.interests[(i + n) % input.interests.length]) : [zh ? '预留自由探索时间' : 'Leave time for your own exploration'];
      days.push({ ordinal: i + 1, destination, activities });
    }
  }
  return { directionId, requestedDays: input.durationDays, days, coverage: days.length > 0 && input.destinations.length <= days.length ? 'complete_relative' : 'partial_relative', limitations, pace: selected.pace, paceSource: selected.source };
}
/** Only listed relative days change; no other day is regenerated. */
export function editRelativeDays(plan: RelativePlan, replacements: readonly RelativeDay[]): RelativePlan {
  if (!Array.isArray(replacements) || !replacements.length || new Set(replacements.map(d => d.ordinal)).size !== replacements.length) fail('INVALID_EDIT');
  for (const d of replacements) if (!d || Object.keys(d).sort().join() !== 'activities,destination,ordinal' || !int(d.ordinal, 1, plan.days.length) || !text(d.destination, 80) || !Array.isArray(d.activities) || !d.activities.length || d.activities.length > 8 || d.activities.some(a => !text(a, 160))) fail('INVALID_EDIT');
  return { ...plan, days: plan.days.map(day => replacements.find(r => r.ordinal === day.ordinal) ?? day) };
}
/** No writer or confirmation receipt: this only creates the existing Patch candidate. */
export function bindRelativeDates(plan: RelativePlan, snapshot: TripSnapshot, startDate: string, idPrefix: string): TripPatch {
  assertTripSnapshot(snapshot);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !Number.isFinite(Date.parse(startDate)) || new Date(startDate).toISOString().slice(0, 10) !== startDate || !/^[A-Za-z0-9_-]{1,40}$/.test(idPrefix) || !plan.days.length || plan.days.length > 30) fail('INVALID_BINDING');
  const operations: TripPatchOperation[] = [];
  const ids = new Set(snapshot.days.flatMap(d => [d.id, ...(d.items ?? []).map(i => i.id)]));
  for (const [index, day] of plan.days.entries()) {
    if (day.ordinal !== index + 1) fail('INVALID_RELATIVE_DAY');
    const date = new Date(Date.parse(startDate) + index * 86400000).toISOString().slice(0, 10);
    const dayId = `${idPrefix}_d${day.ordinal}`;
    if (snapshot.days.some(d => d.date === date) || ids.has(dayId)) fail('TRIP_DAY_CONFLICT');
    operations.push({ kind: 'upsert_day', dayId, date, timeZone: 'Asia/Shanghai' });
    for (const [n, activity] of day.activities.entries()) {
      const itemId = `${idPrefix}_d${day.ordinal}_i${n + 1}`;
      if (ids.has(itemId)) fail('TRIP_ITEM_CONFLICT');
      operations.push({ kind: 'upsert_item', dayId, itemId, title: activity });
    }
  }
  const patch = { expectedVersion: snapshot.version, operations };
  applyPatch(snapshot, patch); // Existing date/item/patch validation; no persistence.
  return patch;
}
