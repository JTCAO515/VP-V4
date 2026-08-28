import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  tone?: "primary" | "secondary" | "quiet";
};

export function Button({ children, className = "", tone = "primary", type = "button", ...props }: ButtonProps) {
  return <button {...props} className={`vp-button vp-button--${tone} ${className}`.trim()} type={type}>{children}</button>;
}
