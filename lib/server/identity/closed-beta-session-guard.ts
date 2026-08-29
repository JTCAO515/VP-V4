import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { signInHref } from "@/lib/navigation/safe-return-to";
import { getSupabasePublicConfig } from "./user-data-adapter";

/**
 * Server-component guard for pages that disclose owner-scoped data. It relies only on the public
 * SSR client and fails closed to the password sign-in surface when configuration or claims are absent.
 */
export async function requireClosedBetaSession(returnTo: string): Promise<Readonly<{ subject: string }>> {
  const config = getSupabasePublicConfig();
  if (!config) redirect(signInHref(returnTo));
  const cookieStore = await cookies();
  const client = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: () => undefined,
    },
  });
  try {
    const { data, error } = await client.auth.getClaims();
    const subject = data?.claims?.sub;
    if (error || typeof subject !== "string") redirect(signInHref(returnTo));
    return Object.freeze({ subject });
  } catch {
    redirect(signInHref(returnTo));
  }
}
