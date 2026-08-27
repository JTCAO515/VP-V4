import { createBrowserClient } from "@supabase/ssr";

export function createPasswordAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return url && publishableKey ? createBrowserClient(url, publishableKey) : null;
}
