import type { NextRequest } from "next/server";
import { nativePlanningIntakeHTTP } from "@/lib/server/turn/native-planning-intake-http";
export const runtime = "nodejs";
export async function POST(request: NextRequest) { return nativePlanningIntakeHTTP(request); }
