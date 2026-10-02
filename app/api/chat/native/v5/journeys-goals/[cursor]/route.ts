import type { NextRequest } from "next/server";
import { nativeJourneysGoalIndexHTTP } from "@/lib/server/turn/native-journeys-goal-index-http";
export const runtime = "nodejs";
export async function GET(request: NextRequest, context: { params: Promise<{ cursor: string }> }) { return nativeJourneysGoalIndexHTTP(request, (await context.params).cursor); }
