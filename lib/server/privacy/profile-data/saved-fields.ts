/** Saved-field metadata distinguishes cleared system defaults from explicit user input. */
export const PROFILE_PREFERENCE_FIELDS = ['display_name', 'travel_pace', 'locale', 'currency', 'distance_unit', 'temperature_unit', 'default_departure_time'] as const;
export function profileHasSavedField(profile: Readonly<{ savedFields?: readonly string[] }>, field: typeof PROFILE_PREFERENCE_FIELDS[number]): boolean {
  // Old readers had no mask. On the upgraded schema the actual mask is always returned.
  return profile.savedFields === undefined || profile.savedFields.includes(field);
}
