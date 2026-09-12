import type { NextRequest } from "next/server";
import { nativeTextHTTP } from "@/lib/server/turn/native-http";
export const runtime = "nodejs";
export async function GET(request: NextRequest) { return nativeTextHTTP(request, "task-history", undefined, "grounded"); }
export async function POST(request: NextRequest) { return nativeTextHTTP(request, "submit-task", undefined, "grounded"); }
