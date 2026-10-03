import type { NextRequest } from "next/server";
import { nativeAssistantSelectedSourceContextHTTP } from "@/lib/server/turn/native-assistant-context-http";
export const runtime="nodejs";
export async function POST(request:NextRequest){return nativeAssistantSelectedSourceContextHTTP(request);}
