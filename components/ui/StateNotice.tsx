import type { HTMLAttributes, ReactNode } from "react";

export function StateNotice({ children, className = "", ...props }: HTMLAttributes<HTMLParagraphElement> & { children: ReactNode }) {
  return <p {...props} className={`vp-state-notice ${className}`.trim()} role="status">{children}</p>;
}
