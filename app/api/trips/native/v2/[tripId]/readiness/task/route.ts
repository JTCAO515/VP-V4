import type {NextRequest} from "next/server";
import {readinessTaskReferenceHTTP} from "@/lib/server/readiness/task-reference-http";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest,{params}:{params:Promise<{tripId:string}>}){return readinessTaskReferenceHTTP(request,(await params).tripId,true);}
