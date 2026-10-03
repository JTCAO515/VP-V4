import type { NextRequest } from "next/server";
import { nativeAssistantHTTP } from "@/lib/server/turn/native-assistant-http";
export const runtime="nodejs";
export async function POST(request:NextRequest){return nativeAssistantHTTP(request,"conversation",true);}
