import { nativeTripLifecycleHTTP } from "@/lib/server/trip/lifecycle/native-http";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ operationId: string }> }) {
  return nativeTripLifecycleHTTP(request, "recover", (await params).operationId);
}
