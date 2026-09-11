import { nativeIdentityHTTP } from "@/lib/server/identity/native-http";
import { getNativeRuntimeConfig } from "@/lib/server/identity/native-config";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return nativeIdentityHTTP(request, "refresh", getNativeRuntimeConfig(request, "session"));
}
