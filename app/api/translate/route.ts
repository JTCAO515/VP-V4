import type { NextRequest } from "next/server";
import { translationHTTP } from "@/lib/server/media-translation/text/http";
export const runtime = "nodejs";
export async function GET(request: NextRequest) { return translationHTTP(request); }
export async function POST(request: NextRequest) { return translationHTTP(request); }
