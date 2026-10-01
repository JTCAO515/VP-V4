import type { NextRequest } from "next/server";
import { nativeJourneysHTTP } from "@/lib/server/turn/native-journeys-http";
export const runtime = "nodejs";
export async function GET(request: NextRequest) { return nativeJourneysHTTP(request); }
