import type { NextRequest } from "next/server";
import { nativeAssistantTextHTTP } from "@/lib/server/turn/native-assistant-http";

export const runtime = "nodejs";
export async function POST(request: NextRequest) { return nativeAssistantTextHTTP(request, "accept"); }
export async function DELETE(request: NextRequest) { return nativeAssistantTextHTTP(request, "withdraw"); }
