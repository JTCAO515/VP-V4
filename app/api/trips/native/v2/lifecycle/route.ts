import { nativeTripLifecycleHTTP } from "@/lib/server/trip/lifecycle/native-http";
export const runtime = "nodejs";
export async function GET(request: Request) { return nativeTripLifecycleHTTP(request, "read"); }
export async function POST(request: Request) { return nativeTripLifecycleHTTP(request, "execute"); }
