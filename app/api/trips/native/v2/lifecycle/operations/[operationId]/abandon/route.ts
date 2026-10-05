import { nativeTripLifecycleHTTP } from "@/lib/server/trip/lifecycle/native-http";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ operationId: string }> }) {
  return nativeTripLifecycleHTTP(request, "abandon", (await params).operationId);
}
