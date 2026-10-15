import type { NextRequest } from "next/server";
import { canonicalPlaceAskHTTP } from "@/lib/server/knowledge/place-ask/http";

export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) { return canonicalPlaceAskHTTP(request); }
export async function GET(request: NextRequest) { return canonicalPlaceAskHTTP(request); }
