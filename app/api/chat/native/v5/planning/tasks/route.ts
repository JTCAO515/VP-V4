import type { NextRequest } from "next/server";
import { nativePlanningTaskHTTP } from "../../../../../../../lib/server/turn/native-planning-http.ts";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const POST=(request:NextRequest)=>nativePlanningTaskHTTP(request);
