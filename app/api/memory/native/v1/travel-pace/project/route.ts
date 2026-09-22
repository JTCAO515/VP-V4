import { nativeTravelPaceHTTP } from "@/lib/server/memory/native-http";
export const runtime = "nodejs";
export async function POST(request: Request) { return nativeTravelPaceHTTP(request, "project"); }
