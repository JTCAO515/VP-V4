import type { NextRequest } from "next/server";
import { nativeAssistantContextHTTP } from "@/lib/server/turn/native-assistant-context-http";

export const runtime = "nodejs";
export async function POST(request: NextRequest) { return nativeAssistantContextHTTP(request); }
