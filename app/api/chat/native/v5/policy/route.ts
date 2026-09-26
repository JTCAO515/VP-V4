import type { NextRequest } from "next/server";
import { nativeAssistantTextHTTP } from "@/lib/server/turn/native-assistant-http";

export const runtime = "nodejs";
export async function GET(request: NextRequest) { return nativeAssistantTextHTTP(request, "policy"); }
