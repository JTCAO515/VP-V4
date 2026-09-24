/** Profile is the only authority; this notice grants on-device planning only. */
export const TRAVEL_PACE_NOTICE = "local-planning-cross-trip-v1";
export const TRAVEL_PACES = ["relaxed", "balanced", "packed"] as const;
export type TravelPace = (typeof TRAVEL_PACES)[number];
type Mutation = { operationId: string; expectedRevision: number };
export type TravelPaceCommand = Readonly<Mutation & (
  { action: "save"; travelPace: TravelPace; noticeVersion: typeof TRAVEL_PACE_NOTICE }
  | { action: "pause" | "revoke" | "undo" }
)>;
export type TaskTravelPaceInput = Readonly<{
  tripId: string; currentPace: TravelPace | null; useSaved: boolean;
  expectedSourceRevision?: number;
}>;
export type TaskTravelPace = Readonly<{
  schemaVersion: "task-travel-pace/1"; tripId: string;
  travelPace: TravelPace | null; source: "profile" | "current_input" | "none";
  sourceRevision: number | null; sourceOperationId: string | null;
  purpose: "local_trip_planning";
}>;
const uuid = (value: unknown): value is string => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const revision = (value: unknown): value is number => Number.isSafeInteger(value)
  && (value as number) >= 0 && (value as number) <= 9007199254740990;
const pace = (value: unknown): value is TravelPace => TRAVEL_PACES.some(item => item === value);
const record = (value: unknown): value is Record<string, unknown> => value !== null
  && typeof value === "object" && !Array.isArray(value);

export function isTravelPaceCommand(value: unknown): value is TravelPaceCommand {
  if (!record(value) || !uuid(value.operationId) || !revision(value.expectedRevision)) return false;
  if (value.action === "save") return Object.keys(value).sort().join() === "action,expectedRevision,noticeVersion,operationId,travelPace"
    && pace(value.travelPace) && value.noticeVersion === TRAVEL_PACE_NOTICE;
  return ["pause", "revoke", "undo"].includes(String(value.action))
    && Object.keys(value).sort().join() === "action,expectedRevision,operationId";
}

export function isTaskTravelPaceInput(value: unknown): value is TaskTravelPaceInput {
  return record(value) && uuid(value.tripId) && typeof value.useSaved === "boolean"
    && (value.currentPace === null || pace(value.currentPace))
    && Object.keys(value).every(key => ["tripId", "currentPace", "useSaved", "expectedSourceRevision"].includes(key))
    && (!Object.hasOwn(value, "expectedSourceRevision") || revision(value.expectedSourceRevision));
}
