import { nativeIdentityHTTP } from "@/lib/server/identity/native-http";
import { getSupabasePublicConfig } from "@/lib/server/identity/user-data-adapter";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const config = getSupabasePublicConfig();
  return nativeIdentityHTTP(request, "session", process.env.VISEPANDA_NATIVE_LOCAL_SESSION === "true" && config ? { ...config, serviceRoleKey: process.env.VISEPANDA_NATIVE_LOCAL_SERVICE_KEY } : null);
}
