import { readUserProvidedAddress, isUserAddressText } from "../../lib/trip-user-address";
import type { PendingProposalRead } from "../../lib/server/identity/user-data-adapter";
import type { AddressContext } from "./context";
import styles from "./TripItemAddress.module.css";

function itemAddress(snapshot: unknown, dayId: string, itemId: string, version: number) {
  if (!snapshot || typeof snapshot !== "object" || !("version" in snapshot) || snapshot.version !== version || !("days" in snapshot) || !Array.isArray(snapshot.days)) return null;
  const day = snapshot.days.find((day: { id?: unknown }) => day && typeof day === "object" && day.id === dayId);
  if (!day || !Array.isArray(day.items)) return null;
  const item = day.items.find((item: { id?: unknown }) => item && typeof item === "object" && item.id === itemId);
  return item ? readUserProvidedAddress(item.chineseAddress) : null;
}

/** Mount within the original pending Proposal's visible diff, beside its existing Confirm. */
export function AddressProposalDiff({ pending, context, locale }: {
  pending: PendingProposalRead; context: AddressContext; locale: "zh" | "en";
}) {
  if (pending.trip.id !== context.tripId || pending.proposal.baseTripVersion !== context.tripVersion
    || pending.proposal.stale || !pending.proposal.digest) return null;
  const patch: unknown = pending.proposal.patch;
  if (!patch || typeof patch !== "object" || !("expectedVersion" in patch) || patch.expectedVersion !== context.tripVersion || !("operations" in patch) || !Array.isArray(patch.operations)) return null;
  const operations = patch.operations.filter((operation: Record<string, unknown>) => operation && typeof operation === "object" && operation.kind === "set_item_chinese_address"
    && operation.dayId === context.dayId && operation.itemId === context.itemId);
  if (operations.length !== 1) return null;
  const operation = operations[0];
  if (Object.keys(operation).length !== 4) return null;
  if (operation.text !== null && !isUserAddressText(operation.text)) return null;
  const before = itemAddress(pending.proposal.before, context.dayId, context.itemId, context.tripVersion);
  const after = itemAddress(pending.proposal.after, context.dayId, context.itemId, context.tripVersion + 1);
  if (!before || !after || before.kind === "unsupported" || after.kind === "unsupported"
    || (after.kind === "provided" ? after.address.text : null) !== operation.text) return null;
  const zh = locale === "zh";
  const missing = zh ? "未提供" : "Not provided";
  return <section className={styles.panel} aria-label={zh ? "用户补充地址差异" : "User-provided address change"}>
    <strong>{zh ? "用户补充 · 未验证" : "User provided · Unverified"}</strong>
    <p>{context.dayId} / {context.itemId} · v{context.tripVersion}</p>
    <dl><dt>{zh ? "变更前" : "Before"}</dt><dd className={styles.text}>{before.kind === "provided" ? before.address.text : missing}</dd>
      <dt>{zh ? "变更后" : "After"}</dt><dd className={styles.text}>{after.kind === "provided" ? after.address.text : missing}</dd></dl>
  </section>;
}
