import type { NextRequest } from "next/server";
import { qaCancellationHTTP } from "@/lib/server/qa-agent/cancellation/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{sessionId:string;requestId:string}> };
export async function GET(request:NextRequest,{params}:Context){const {sessionId,requestId}=await params;return qaCancellationHTTP(request,sessionId,requestId);}
export async function POST(request:NextRequest,{params}:Context){const {sessionId,requestId}=await params;return qaCancellationHTTP(request,sessionId,requestId);}
