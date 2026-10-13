import type { NextRequest } from "next/server";
import { qaAgentHTTP } from "@/lib/server/qa-agent/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) { return qaAgentHTTP(request, "list"); }
export async function POST(request: NextRequest) { return qaAgentHTTP(request, "create"); }
