import type {NextRequest} from "next/server";
import {nativePlanFeasibilityHTTP} from "@/lib/server/trip/feasibility/native-http";
export const runtime="nodejs";
export const maxDuration=90;
export async function POST(request:NextRequest,{params}:{params:Promise<{tripId:string}>}){return nativePlanFeasibilityHTTP(request,(await params).tripId);}
