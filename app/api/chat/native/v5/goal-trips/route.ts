import type { NextRequest } from "next/server";
import { nativeAssistantTripPrivacyHTTP } from "@/lib/server/turn/native-assistant-trip-http";

export const runtime = "nodejs";
export async function GET(request: NextRequest) { return nativeAssistantTripPrivacyHTTP(request); }
