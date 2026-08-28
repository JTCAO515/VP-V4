import type { DialogHTMLAttributes, ReactNode } from "react";

type DialogDrawerProps = DialogHTMLAttributes<HTMLDialogElement> & {
  children: ReactNode;
  title: string;
};

export function DialogDrawer({ children, className = "", title, ...props }: DialogDrawerProps) {
  return <dialog {...props} aria-modal="true" className={`vp-dialog ${className}`.trim()}>
    <section aria-label={title}>{children}</section>
  </dialog>;
}
