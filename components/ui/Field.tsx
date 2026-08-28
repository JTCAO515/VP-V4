import type { InputHTMLAttributes } from "react";

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
};

export function Field({ hint, id, label, ...props }: FieldProps) {
  const hintId = hint && id ? `${id}-hint` : undefined;
  return <label className="vp-field" htmlFor={id}>
    <span>{label}</span>
    <input {...props} aria-describedby={hintId} id={id} />
    {hint ? <small id={hintId}>{hint}</small> : null}
  </label>;
}
