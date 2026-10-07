/** Saved-field metadata distinguishes cleared system defaults from explicit user input. */
export const PROFILE_PREFERENCE_FIELDS = ['display_name', 'travel_pace', 'locale', 'currency', 'distance_unit', 'temperature_unit', 'default_departure_time'] as const;
export const validSavedFields = (v: unknown): v is string[] => Array.isArray(v) && v.length <= PROFILE_PREFERENCE_FIELDS.length
  && v.every((field, i) => typeof field === 'string' && PROFILE_PREFERENCE_FIELDS.includes(field as typeof PROFILE_PREFERENCE_FIELDS[number])
    && (i === 0 || PROFILE_PREFERENCE_FIELDS.indexOf(v[i - 1] as typeof PROFILE_PREFERENCE_FIELDS[number]) < PROFILE_PREFERENCE_FIELDS.indexOf(field as typeof PROFILE_PREFERENCE_FIELDS[number])));
export function profileHasSavedField(profile: object, field: typeof PROFILE_PREFERENCE_FIELDS[number]): boolean {
  // Old readers had no mask. On the upgraded schema the actual mask is always returned.
  if (!('savedFields' in profile)) return true;
  return validSavedFields(profile.savedFields) && profile.savedFields.includes(field);
}
