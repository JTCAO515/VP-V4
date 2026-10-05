/** Provider acceptance is a handoff acknowledgement, never device delivery. */
export type DeliveryOutcome = Readonly<
  | { kind: 'accepted'; apnsId: string; acceptedAt: string }
  | { kind: 'unknown'; code: 'ACK_UNKNOWN' }
  | { kind: 'error'; code: 'TOKEN_REVOKED' | 'PROVIDER_REJECTED' | 'TRANSPORT_UNAVAILABLE' }
>;
export type ReminderPurpose = 'user_set_travel' | 'accepted_task_result' | 'qualified_watch';
export type QuietHours = Readonly<{ startMinute: number; endMinute: number }>;
/** An explicit disabled factory is the only default; configuration is injected. */
export type ReminderTransport = Readonly<{
  available: boolean;
  send(input: Readonly<{ token: string; apnsId: string; notificationId: string; environment: 'sandbox' | 'production'; expiresAt: string }>): Promise<DeliveryOutcome>;
}>;
export const unavailableReminderTransport: ReminderTransport = Object.freeze({
  available: false,
  async send() { return { kind: 'error', code: 'TRANSPORT_UNAVAILABLE' }; },
});
