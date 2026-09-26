import type { NextRequest } from "next/server";
import { nativePlanningPolicyHTTP } from "../../../../../../../lib/server/turn/native-planning-http.ts";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const GET=(request:NextRequest)=>nativePlanningPolicyHTTP(request);
export const POST=(request:NextRequest)=>nativePlanningPolicyHTTP(request);
export const DELETE=(request:NextRequest)=>nativePlanningPolicyHTTP(request);
