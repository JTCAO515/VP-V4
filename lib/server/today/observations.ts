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
  const observation = input.observation;
  if (!Number.isFinite(input.now.getTime()) || !observation || observation.kind === "provider_failure" || !isRecorded(observation, input.now)) return { kind: "unavailable", state: "unavailable", canvasRecheck: true };
  const expiresAt = Date.parse(observation.expiresAt);
  return expiresAt > input.now.getTime()
    ? { ...observation, state: "current", canvasRecheck: false }
    : { ...observation, state: "stale", canvasRecheck: true };
}

function isRecorded(value: RecordedObservation, now: Date): boolean {
  const observedAt = Date.parse(value.observedAt);
  const expiresAt = Date.parse(value.expiresAt);
  return ["weather", "air_quality", "alert", "closure"].includes(value.kind) && typeof value.summary === "string" && value.summary.trim().length > 0 && Number.isFinite(observedAt) && Number.isFinite(expiresAt) && observedAt <= expiresAt && observedAt <= now.getTime();
}
