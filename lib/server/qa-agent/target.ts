/** Nonsecret operator binding. Syntax is not proof of provisioning or activation. */
export const SHARED_QA_PROJECT_REF = "dzqdzetcctkhbrhlxxgn";
export type IndependentQaTarget = Readonly<{ kind: "independent"; projectRef: string; databaseUrl: string }>;
export type QaTarget = IndependentQaTarget
  | Readonly<{ kind: "local"; projectRef: null; databaseUrl: string }>;
export function readIndependentQaTarget(value: unknown): IndependentQaTarget | null {
  if (typeof value !== "string" || !/^[a-z0-9]{20}$/.test(value) || value === SHARED_QA_PROJECT_REF) return null;
  return Object.freeze({ kind: "independent", projectRef: value, databaseUrl: `https://${value}.supabase.co` });
}
export function readLocalQaTarget(value: unknown): QaTarget | null {
  if (typeof value !== "string" || process.env.VERCEL_ENV) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)
      && !url.username && !url.password && !url.search && !url.hash && url.pathname === "/"
      && (value === url.origin || value === url.origin + "/")
      ? Object.freeze({ kind: "local", projectRef: null, databaseUrl: url.origin }) : null;
  } catch { return null; }
}
/** Revalidate a composition binding, independently of any job's asserted URL. */
export function requireQaTarget(target: QaTarget | undefined): QaTarget {
  const checked = target?.kind === "independent" ? readIndependentQaTarget(target.projectRef)
    : target?.kind === "local" ? readLocalQaTarget(target.databaseUrl) : null;
  if (!checked || checked.databaseUrl !== target?.databaseUrl) throw new Error("QA target unavailable");
  return checked;
}
