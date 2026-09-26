import { nativeIdentityHTTP } from "@/lib/server/identity/native-http";
import { getNativeRuntimeConfig } from "@/lib/server/identity/native-config";

export const runtime = "nodejs";
export async function GET(request: Request) {
  return nativeIdentityHTTP(request, "session", getNativeRuntimeConfig(request, "session", "identity"));
}
