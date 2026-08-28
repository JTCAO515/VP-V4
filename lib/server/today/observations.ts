export type TodayObservationKind = "weather" | "air_quality" | "alert" | "closure";

type RecordedObservation = Readonly<{
  kind: TodayObservationKind;
  observedAt: string;
  expiresAt: string;
  summary: string;
}>;
type ObservationInput = RecordedObservation | Readonly<{ kind: "provider_failure" }> | null;

export type TodayObservationProjection =
  | Readonly<{ kind: TodayObservationKind; state: "current"; summary: string; observedAt: string; expiresAt: string; canvasRecheck: false }>
  | Readonly<{ kind: TodayObservationKind; state: "stale"; summary: string; observedAt: string; expiresAt: string; canvasRecheck: true }>
  | Readonly<{ kind: "unavailable"; state: "unavailable"; canvasRecheck: true }>;

export function projectTodayObservation(input: Readonly<{ now: Date; observation: ObservationInput }>): TodayObservationProjection {
  if (!input || typeof input !== "object" || !(input.now instanceof Date) || !Number.isFinite(input.now.getTime())) return { kind: "unavailable", state: "unavailable", canvasRecheck: true };
  const observation = input.observation;
  if (!observation || observation.kind === "provider_failure" || !isRecorded(observation, input.now)) return { kind: "unavailable", state: "unavailable", canvasRecheck: true };
  const expiresAt = parseRfc3339Timestamp(observation.expiresAt);
  return expiresAt > input.now.getTime()
    ? { ...observation, state: "current", canvasRecheck: false }
    : { ...observation, state: "stale", canvasRecheck: true };
}

function isRecorded(value: RecordedObservation, now: Date): boolean {
  const observedAt = parseRfc3339Timestamp(value.observedAt);
  const expiresAt = parseRfc3339Timestamp(value.expiresAt);
  return ["weather", "air_quality", "alert", "closure"].includes(value.kind) && typeof value.summary === "string" && value.summary.trim().length > 0 && Number.isFinite(observedAt) && Number.isFinite(expiresAt) && observedAt <= expiresAt && observedAt <= now.getTime();
}

function parseRfc3339Timestamp(value: unknown): number {
  if (typeof value !== "string") return Number.NaN;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return Number.NaN;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, offset] = match;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText), hour = Number(hourText), minute = Number(minuteText), second = Number(secondText);
  const days = month === 2 ? (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31;
  if (month < 1 || month > 12 || day < 1 || day > days || hour > 23 || minute > 59 || second > 59 || (offset !== "Z" && (Number(offset.slice(1, 3)) > 23 || Number(offset.slice(4, 6)) > 59))) return Number.NaN;
  return Date.parse(value);
}
