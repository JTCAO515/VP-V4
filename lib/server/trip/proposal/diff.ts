import { applyPatch, type TripItem, type TripPatch, type TripSnapshot } from "../patch/contract.ts";

export type ProposalItemDiff = Readonly<{ kind: "added" | "removed" | "changed"; itemId: string; title: string }>;
export type ProposalDayDiff = Readonly<{ kind: "added" | "removed" | "changed"; dayId: string; date: string; items: readonly ProposalItemDiff[] }>;
export type ProposalDiff = Readonly<{ next: TripSnapshot; dayDiffs: readonly ProposalDayDiff[] }>;

export function describeProposalDiff(current: TripSnapshot, patch: TripPatch): ProposalDiff {
  const next = applyPatch(current, patch);
  const beforeDays = new Map(current.days.map((day) => [day.id, day]));
  const afterDays = new Map(next.days.map((day) => [day.id, day]));
  const order = new Map<string, number>();
  patch.operations.forEach((operation, index) => {
    if ("dayId" in operation && !order.has(operation.dayId)) order.set(operation.dayId, index);
  });
  const ids = new Set([...beforeDays.keys(), ...afterDays.keys()]);
  const dayDiffs = [...ids].map((id) => {
    const before = beforeDays.get(id);
    const after = afterDays.get(id);
    if (!before && after) return freezeDay({ kind: "added", dayId: id, date: after.date, items: after.items?.map((item) => freezeItem("added", item)) ?? [] });
    if (before && !after) return freezeDay({ kind: "removed", dayId: id, date: before.date, items: before.items?.map((item) => freezeItem("removed", item)) ?? [] });
    if (!before || !after) throw new Error("unreachable day state");
    const items = itemDiffs(before.items ?? [], after.items ?? []);
    return freezeDay({ kind: "changed", dayId: id, date: after.date, items });
  }).filter((diff) => diff.kind !== "changed" || diff.items.length > 0 || beforeDays.get(diff.dayId)?.date !== afterDays.get(diff.dayId)?.date || beforeDays.get(diff.dayId)?.timeZone !== afterDays.get(diff.dayId)?.timeZone)
    .sort((left, right) => (order.get(left.dayId) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.dayId) ?? Number.MAX_SAFE_INTEGER) || left.dayId.localeCompare(right.dayId));
  return Object.freeze({ next, dayDiffs: Object.freeze(dayDiffs) });
}

function itemDiffs(before: readonly TripItem[], after: readonly TripItem[]): readonly ProposalItemDiff[] {
  const left = new Map(before.map((item) => [item.id, item]));
  const right = new Map(after.map((item) => [item.id, item]));
  return Object.freeze([...new Set([...left.keys(), ...right.keys()])].flatMap((id) => {
    const previous = left.get(id); const next = right.get(id);
    if (!previous && next) return [freezeItem("added", next)];
    if (previous && !next) return [freezeItem("removed", previous)];
    if (!previous || !next || (previous.title === next.title && previous.startsAt === next.startsAt && previous.endsAt === next.endsAt)) return [];
    return [freezeItem("changed", next)];
  }));
}

function freezeItem(kind: ProposalItemDiff["kind"], item: TripItem): ProposalItemDiff { return Object.freeze({ kind, itemId: item.id, title: item.title }); }
function freezeDay(day: ProposalDayDiff): ProposalDayDiff { return Object.freeze({ ...day, items: Object.freeze([...day.items]) }); }
