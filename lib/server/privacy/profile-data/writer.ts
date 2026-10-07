import { exact, record } from '../../guide/contract.ts';
import { revision } from './contract.ts';

/** Additive Web save binding. Existing fields and non-consenting pace semantics stay intact. */
export type ProfileSaveBinding = Readonly<{ expectedProfileRevision: number }>;
export const validProfileSaveBinding = (v: unknown): v is ProfileSaveBinding => record(v)
  && exact(v, ['expectedProfileRevision']) && revision(v.expectedProfileRevision);
export function profileSaveParameters(input: Readonly<{ displayName: string; travelPace: string; locale: string; currency: string;
  distanceUnit: string; temperatureUnit: string; defaultDepartureTime: string }>, expected: number): Record<string, unknown> {
  if (!revision(expected)) throw Error('INVALID_INPUT');
  return { p_display_name: input.displayName, p_travel_pace: input.travelPace, p_locale: input.locale, p_currency: input.currency,
    p_distance_unit: input.distanceUnit, p_temperature_unit: input.temperatureUnit, p_default_departure_time: input.defaultDepartureTime,
    p_expected_profile_revision: expected };
}
