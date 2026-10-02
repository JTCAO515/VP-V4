import type { NextRequest } from "next/server";
import { nativeTravelIntakeHTTP } from "@/lib/server/turn/native-travel-intake-http";
export const runtime = "nodejs";
export async function GET(request: NextRequest) { return nativeTravelIntakeHTTP(request, true); }
