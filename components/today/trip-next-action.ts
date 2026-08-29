export type TodayTrip = Readonly<{ id: string; title: string; headVersion: number; updatedAt: string }>;
export type TodayItem = Readonly<{ id: string; dayId: string; title: string; startsAt?: string }>;
export type TodayDay = Readonly<{ id: string; date: string; timeZone?: string; items: readonly TodayItem[] }>;
export type TripNextAction =
  | Readonly<{ state: "available"; tripId: string; tripVersion: number; dayId: string; itemId: string; itemTitle: string; date: string; reason: "upcoming" | "today" }>
  | Readonly<{ state: "unavailable"; reason: "no_items" | "trip_complete" | "incomplete_data"; tripId: string; tripVersion: number }>;

export function selectTripNextAction(input: Readonly<{ now: Date; trip: TodayTrip; days: readonly TodayDay[] }>): TripNextAction {
  const fallback = unavailable(input?.trip, "incomplete_data");
  if (!input || !(input.now instanceof Date) || !Number.isFinite(input.now.getTime()) || !validTrip(input.trip) || !Array.isArray(input.days)) return fallback;
  if (input.days.length === 0) return unavailable(input.trip, "no_items");
  const candidates: Array<Readonly<{ day: TodayDay; item: TodayItem; today: boolean }>> = [];
  let itemCount = 0;
  for (const day of input.days) {
    if (!validDay(day)) return unavailable(input.trip, "incomplete_data");
    const today = dateInZone(input.now, day.timeZone!);
    if (!today) return unavailable(input.trip, "incomplete_data");
    for (const item of day.items) {
      itemCount += 1;
      if (!validItem(item, day.id)) return unavailable(input.trip, "incomplete_data");
      if (day.date >= today) candidates.push({ day, item, today: day.date === today });
    }
  }
  if (itemCount === 0) return unavailable(input.trip, "no_items");
  candidates.sort((left, right) => left.day.date.localeCompare(right.day.date) || (left.item.startsAt ?? "").localeCompare(right.item.startsAt ?? "") || left.item.id.localeCompare(right.item.id));
  const next = candidates[0];
  return next ? { state: "available", tripId: input.trip.id, tripVersion: input.trip.headVersion, dayId: next.day.id, itemId: next.item.id, itemTitle: next.item.title, date: next.day.date, reason: next.today ? "today" : "upcoming" } : unavailable(input.trip, "trip_complete");
}

function unavailable(trip: TodayTrip | undefined, reason: "no_items" | "trip_complete" | "incomplete_data"): TripNextAction { const tripVersion = trip && Number.isInteger(trip.headVersion) ? trip.headVersion : -1; return { state: "unavailable", reason, tripId: typeof trip?.id === "string" ? trip.id : "", tripVersion }; }
function validTrip(trip: TodayTrip): boolean { return typeof trip.id === "string" && trip.id.length > 0 && typeof trip.title === "string" && trip.title.trim().length > 0 && Number.isInteger(trip.headVersion) && trip.headVersion >= 0 && Number.isFinite(Date.parse(trip.updatedAt)); }
function validDay(day: TodayDay): boolean { return !!day && typeof day.id === "string" && day.id.length > 0 && validDate(day.date) && typeof day.timeZone === "string" && validTimeZone(day.timeZone) && Array.isArray(day.items); }
function validItem(item: TodayItem, dayId: string): boolean { return !!item && typeof item.id === "string" && item.id.length > 0 && item.dayId === dayId && typeof item.title === "string" && item.title.trim().length > 0 && (item.startsAt === undefined || Number.isFinite(Date.parse(item.startsAt))); }
function validDate(value: string): boolean { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const date = new Date(`${value}T00:00:00.000Z`); return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value; }
function validTimeZone(value: string): boolean { try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(); return true; } catch { return false; } }
function dateInZone(now: Date, timeZone: string): string | null { try { const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now); const fields = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value])); return fields.year && fields.month && fields.day ? `${fields.year}-${fields.month}-${fields.day}` : null; } catch { return null; } }
