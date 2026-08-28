import type { HTMLAttributes } from "react";

type VisePandaMarkProps = HTMLAttributes<HTMLSpanElement> & {
  label?: string;
};

export function VisePandaMark({ label = "VisePanda", ...props }: VisePandaMarkProps) {
  return <span {...props} aria-label={label} role="img">VisePanda.</span>;
}
