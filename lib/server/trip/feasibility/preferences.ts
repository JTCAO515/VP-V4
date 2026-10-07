import type { AdapterResult, UserProfileRead } from "../../identity/user-data-adapter.ts";
import { profileHasSavedField } from "../../privacy/profile-data/saved-fields.ts";
import type { ExplicitPlanNeeds } from "./assembly.ts";

export type PreferenceContext = {
  kind: "profile_preference_context/1"; status: "current"|"unknown"|"unavailable";
  travelPace: "relaxed"|"balanced"|"packed"|null; currency:string|null;
  defaultDepartureTime:string|null; updatedAt:string|null;
  influence:"soft_reference_only"; explicitInputPriority:"current_explicit_input"; hints:string[];
};
/** Current owner Profile is a visible, correctable soft reference. Never changes
 * explicit needs or qualifies place/route/opening/reservation feasibility. */
export function planPreferenceContext(read: AdapterResult<UserProfileRead|null>, needs:ExplicitPlanNeeds):PreferenceContext {
  const empty:PreferenceContext={kind:"profile_preference_context/1",status:"unknown",travelPace:null,currency:null,
    defaultDepartureTime:null,updatedAt:null,influence:"soft_reference_only",explicitInputPriority:"current_explicit_input",hints:[]};
  if("error"in read)return {...empty,status:"unavailable"};
  const profile=read.data;
  if(!profile || !["relaxed","balanced","packed"].includes(profile.travelPace)
    || !["CNY","USD","EUR","RUB","SAR"].includes(profile.currency)
    || !/^([01]\d|2[0-3]):[0-5]\d$/.test(profile.defaultDepartureTime)
    || !Number.isFinite(Date.parse(profile.updatedAt)))return empty;
  const pace = profileHasSavedField(profile, "travel_pace"), currency = profileHasSavedField(profile, "currency"), departure = profileHasSavedField(profile, "default_departure_time");
  return {...empty,status:pace || currency || departure ? "current" : "unknown",travelPace:pace ? profile.travelPace : null,currency:currency ? profile.currency : null,
    defaultDepartureTime:departure ? profile.defaultDepartureTime : null,updatedAt:profile.updatedAt,
    hints:[...(pace ? [`PROFILE_PACE_${profile.travelPace.toUpperCase()}_SOFT_REFERENCE`] : []),
      ...(currency ? [needs.currency===profile.currency?"EXPLICIT_CURRENCY_MATCHES_PROFILE":"EXPLICIT_CURRENCY_OVERRIDES_PROFILE"] : []),
      ...(departure ? ["PROFILE_DEPARTURE_REFERENCE_ONLY"] : [])]};
}
