import type { Locale, copy } from "@/lib/i18n";

import styles from "./FirstRunState.module.css";

type FirstRunCopy = (typeof copy)[Locale]["auth"];

export function FirstRunState({ authCopy }: { authCopy: FirstRunCopy }) {
  return (
    <section className={styles.firstRun} data-empty-state="first-run" aria-labelledby="first-run-title">
      <p>{authCopy.firstRunKicker}</p>
      <h3 id="first-run-title">{authCopy.firstRunTitle}</h3>
      <p>{authCopy.firstRunBody}</p>
    </section>
  );
}
