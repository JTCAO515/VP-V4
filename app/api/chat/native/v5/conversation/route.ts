import type { NextRequest } from "next/server";
import { nativeAssistantHTTP } from "@/lib/server/turn/native-assistant-http";

export const runtime = "nodejs";
export async function GET(request: NextRequest) { return nativeAssistantHTTP(request); }
export async function POST(request: NextRequest) { return nativeAssistantHTTP(request); }
