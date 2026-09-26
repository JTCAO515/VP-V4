/** Server clock decides current eligibility; clients only display this result. */
export function presentGrant<T extends { state: string; starts_at: string; ends_at: string }>(grant: T, now = Date.now()) {
  const start = Date.parse(grant.starts_at);
  const end = Date.parse(grant.ends_at);
  return { ...grant, effective_state: grant.state === "revoked" ? "revoked"
    : grant.state !== "active" || !Number.isFinite(start) || !Number.isFinite(end) ? "unavailable"
    : now < start ? "queued" : now >= end ? "expired" : "active" };
}
