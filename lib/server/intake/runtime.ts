import { createClient } from "@supabase/supabase-js";
import type { IntakeRpc } from "./http.ts";
/** Deployment configuration alone selects the backend. No service-role key is used. */
export function createIntakeRpc(): IntakeRpc | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (process.env.VISEPANDA_RESEARCH_INTAKE !== "true" || !raw || !key) return null;
  try {
    const url = new URL(raw);
    const local = !process.env.VERCEL_ENV && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
    if ((!local && (url.protocol !== "https:" || !url.hostname.endsWith(".supabase.co")))
      || url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
    const client = createClient(raw, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    return async (input, signal) => {
      const { data, error } = await client.rpc("research_intake_v1", { p_input: input }).abortSignal(signal);
      if (error || !data || typeof data.kind !== "string") return { kind: "unavailable" };
      return { kind: data.kind };
    };
  } catch { return null; }
}
