import { uuid } from "./service.ts";

/** QA only; neither cookies nor body can select a database, model or policy. */
export function qaConfig(url: string, env: Readonly<Record<string, string | undefined>>) {
  if (env.VISEPANDA_QA_AGENT !== "true" || !uuid(env.VISEPANDA_QA_AGENT_POLICY_ID)) return null;
  let origin: URL, database: URL, incoming: URL;
  try { origin = new URL(env.VISEPANDA_QA_AGENT_ORIGIN ?? ""); database = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? ""); incoming = new URL(url); } catch { return null; }
  if (origin.origin !== incoming.origin || origin.href !== origin.origin + "/" || origin.username || origin.password
    || database.username || database.password || database.search || database.hash || database.pathname !== "/"
    || !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return null;
  const local = !env.VERCEL_ENV && [origin, database].every(u => u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname));
  const qa = env.VERCEL_ENV === "preview" && origin.origin === "https://qatesting.go2china.space"
    && database.origin === "https://dzqdzetcctkhbrhlxxgn.supabase.co";
  if (!local && !qa) return null;
  const mode = env.VISEPANDA_QA_AGENT_CONTEXT_MODE ?? "current_input_v1";
  if (!["current_input_v1", "task_history_v1"].includes(mode)) return null;
  return { url: database.origin, publishableKey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    policyId: env.VISEPANDA_QA_AGENT_POLICY_ID.toLowerCase(), contextMode: mode as "current_input_v1" | "task_history_v1" };
}
