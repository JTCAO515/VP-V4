import { nativeTravelPaceHTTP } from "@/lib/server/memory/native-http";
export const runtime = "nodejs";
export async function GET(request: Request) { return nativeTravelPaceHTTP(request, "manage"); }
export async function POST(request: Request) { return nativeTravelPaceHTTP(request, "manage"); }
