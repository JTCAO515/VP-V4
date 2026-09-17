/**
 * These describe the capability of VisePanda itself, never a traveller's
 * external booking. They deliberately fail closed instead of inferring an
 * order or a user lock from an empty Trip.
 */
export const tripCapabilityState = Object.freeze({
  hardLocks: "not_enabled",
  externalOrderStatus: "not_connected",
} as const);

export type TripCapabilityState = typeof tripCapabilityState;

export function withTripCapabilityState<T extends object>(value: T): T & TripCapabilityState {
  return { ...value, ...tripCapabilityState };
}
