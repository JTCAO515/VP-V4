import type { NextRequest } from "next/server";
import { nativeTextHTTP } from "@/lib/server/turn/native-http";
export const runtime = "nodejs";
export async function POST(request: NextRequest) { return nativeTextHTTP(request, "accept", undefined, true); }
export async function DELETE(request: NextRequest) { return nativeTextHTTP(request, "withdraw", undefined, true); }
