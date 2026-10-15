import { addressProposalReview } from "./review";
import type { PendingProposalRead } from "../../lib/server/identity/user-data-adapter";
import type { AddressContext } from "./context";
import styles from "./TripItemAddress.module.css";

/** Mount within the original pending Proposal's visible diff, beside its existing Confirm. */
export function AddressProposalDiff({ pending, context, locale }: {
  pending: PendingProposalRead; context: AddressContext; locale: "zh" | "en";
}) {
  const review = addressProposalReview(pending, context);
  if (!review) return null;
  const { before, after } = review;
  const zh = locale === "zh";
  const missing = zh ? "未提供" : "Not provided";
  return <section className={styles.panel} aria-label={zh ? "用户补充地址差异" : "User-provided address change"}>
    <strong>{zh ? "用户补充 · 未验证" : "User provided · Unverified"}</strong>
    <p>{context.dayId} / {context.itemId} · v{context.tripVersion}</p>
    <dl><dt>{zh ? "变更前" : "Before"}</dt><dd className={styles.text}>{before.kind === "provided" ? before.address.text : missing}</dd>
      <dt>{zh ? "变更后" : "After"}</dt><dd className={styles.text}>{after.kind === "provided" ? after.address.text : missing}</dd></dl>
  </section>;
}
