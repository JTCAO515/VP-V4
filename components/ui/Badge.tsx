import type { HTMLAttributes, ReactNode } from "react";

export function Badge({ children, className = "", ...props }: HTMLAttributes<HTMLSpanElement> & { children: ReactNode }) {
  return <span {...props} className={`vp-badge ${className}`.trim()}>{children}</span>;
}
