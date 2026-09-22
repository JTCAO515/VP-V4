export type Reminder = Readonly<{
  id: string; ownerId: string; tripId: string; sessionId: string; baseVersion: number;
  reason: string; dueAt: string; expiresAt: string; timeZone: string;
  status: 'saved' | 'cancelled' | 'completed'; purpose: 'user_set_travel';
}>;
export type SendContext = Readonly<{
  ownerId: string; tripId: string; sessionId: string; tripVersion: number;
  consent: boolean; systemPermission: boolean; timeZone: string;
  archived: boolean | null; tripEndsAt: string | null; currentSession: boolean;
}>;
/** Call with freshly read authoritative state immediately before a dispatch attempt.
 * Unknown state denies. This is not a scheduler or permission to enable APNs. */
export function reminderDecision(reminder: Reminder, current: SendContext, now: Date): string {
  const at = now.getTime(), due = Date.parse(reminder.dueAt), expiry = Date.parse(reminder.expiresAt);
  if (![at, due, expiry].every(Number.isFinite) || expiry <= due) return 'invalid_time';
  if (reminder.status !== 'saved') return reminder.status;
  if (!current.currentSession || reminder.ownerId !== current.ownerId || reminder.sessionId !== current.sessionId) return 'account_changed';
  if (reminder.tripId !== current.tripId || reminder.baseVersion !== current.tripVersion) return 'trip_changed';
  if (reminder.purpose !== 'user_set_travel' || !current.consent) return 'consent_required';
  if (current.archived !== false) return current.archived === true ? 'archived' : 'archive_unknown';
  const end = current.tripEndsAt === null ? NaN : Date.parse(current.tripEndsAt);
  if (!Number.isFinite(end)) return 'trip_end_unknown';
  if (at >= end) return 'trip_ended';
  try { new Intl.DateTimeFormat('en', { timeZone: current.timeZone }); } catch { return 'time_zone_unknown'; }
  if (reminder.timeZone !== current.timeZone) return 'time_zone_changed';
  if (at >= expiry) return 'expired';
  if (at < due) return 'not_due';
  if (!current.systemPermission) return 'system_permission_required';
  return 'eligible';
}

/** No sensitive reason, location, Trip title, account, or payload on the lock screen. */
export const privateLockScreenPayload = Object.freeze({ title: 'VisePanda', body: 'Open VisePanda to review your travel reminder.' });

/** Real transport is intentionally unavailable, regardless of policy eligibility.
 * No synthetic success, durable claim, token upload, or automatic retry is implied. */
export function deliveryAvailability(): 'unavailable' { return 'unavailable'; }
