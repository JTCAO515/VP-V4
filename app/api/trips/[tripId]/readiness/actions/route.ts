import type {NextRequest} from "next/server";
import {readinessActionsHTTP} from "@/lib/server/readiness/actions-http";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request:NextRequest,{params}:{params:Promise<{tripId:string}>}){return readinessActionsHTTP(request,(await params).tripId,false);}
