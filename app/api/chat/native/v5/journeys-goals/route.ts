import type { NextRequest } from "next/server";
import { nativeJourneysGoalIndexHTTP } from "@/lib/server/turn/native-journeys-goal-index-http";
export const runtime = "nodejs";
export async function GET(request: NextRequest) { return nativeJourneysGoalIndexHTTP(request); }
