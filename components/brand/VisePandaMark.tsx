import Image from "next/image";
import type { HTMLAttributes } from "react";
import styles from "./VisePandaMark.module.css";

type VisePandaMarkProps = HTMLAttributes<HTMLSpanElement> & { label?: string };

export function VisePandaMark({ label = "VisePanda", className, ...props }: VisePandaMarkProps) {
  return <span {...props} className={[styles.mark, className].filter(Boolean).join(" ")} aria-label={label} role="img">
    <Image className={styles.image} src="/assets/visepanda/brand/wordmark-20260909.png" width={1448} height={1086} sizes="(max-width: 600px) 336px, 630px" alt="" aria-hidden="true" />
  </span>;
}
