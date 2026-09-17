export const INTAKE_POLICY = "research-intake/2026-09-17";
export type IntakeInput =
  | { action: "apply"; email: string; locale: "zh" | "en"; researchConsent: true; marketingConsent: boolean; policyVersion: typeof INTAKE_POLICY; token: string; website: string }
  | { action: "withdraw"; token: string };
export type IntakeResult = { kind: "received" | "withdrawn" | "invalid_input" | "unavailable" | "request_not_accepted" | "rate_limited" | "receipt_conflict" };
export function parseIntakeInput(value: unknown): IntakeInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.token !== "string" || !/^[a-f0-9]{64}$/.test(v.token)) return null;
  if (v.action === "withdraw" && Object.keys(v).length === 2) return { action: "withdraw", token: v.token };
  if (v.action !== "apply" || Object.keys(v).length !== 8 || typeof v.email !== "string"
    || v.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())
    || !["zh", "en"].includes(String(v.locale)) || v.researchConsent !== true
    || typeof v.marketingConsent !== "boolean" || v.policyVersion !== INTAKE_POLICY
    || typeof v.website !== "string" || v.website.length > 200) return null;
  return { ...v, email: v.email.trim().toLowerCase() } as IntakeInput;
}
