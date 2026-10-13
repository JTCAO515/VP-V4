import { uuid } from "./service.ts";

/** QA only; neither cookies nor body can select a database, model or policy. */
export function qaConfig(url: string, env: Readonly<Record<string, string | undefined>>) {
  if (env.VISEPANDA_QA_AGENT !== "true" || !uuid(env.VISEPANDA_QA_AGENT_POLICY_ID)) return null;
  let origin: URL, database: URL, incoming: URL;
  try { origin = new URL(env.VISEPANDA_QA_AGENT_ORIGIN ?? ""); database = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? ""); incoming = new URL(url); } catch { return null; }
  if (origin.href !== origin.origin + "/" || origin.username || origin.password
    || database.username || database.password || database.search || database.hash || database.pathname !== "/"
    || !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return null;
  const local = !env.VERCEL_ENV && origin.origin === incoming.origin && [origin, database].every(u => u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname));
  // Vercel system values are deployment-owned, never Host/x-forwarded inputs.
  // Keep the finite set bound to the actual VP project and team; two system URLs
  // plus the one explicit QA domain. Missing system values add no wildcard.
  const previewOrigins = new Set(["https://qatesting.go2china.space"]);
  for (const host of [env.VERCEL_URL, env.VERCEL_BRANCH_URL]) {
    if (typeof host === "string" && /^vp-v4-[a-z0-9-]+-jtcao515s-projects\.vercel\.app$/.test(host)) previewOrigins.add("https://" + host);
  }
  const qa = env.VERCEL_ENV === "preview" && previewOrigins.has(origin.origin) && previewOrigins.has(incoming.origin)
    && database.origin === "https://dzqdzetcctkhbrhlxxgn.supabase.co";
  if (!local && !qa) return null;
  const mode = env.VISEPANDA_QA_AGENT_CONTEXT_MODE ?? "current_input_v1";
  if (!["current_input_v1", "qa_session_history_v1"].includes(mode)) return null;
  return { url: database.origin, publishableKey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    policyId: env.VISEPANDA_QA_AGENT_POLICY_ID.toLowerCase(), contextMode: mode as "current_input_v1" | "qa_session_history_v1" };
}
