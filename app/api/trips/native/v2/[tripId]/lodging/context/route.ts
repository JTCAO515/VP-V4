import type {NextRequest} from "next/server";
import {lodgingContextHTTP} from "@/lib/server/lodging/http";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request:NextRequest,{params}:{params:Promise<{tripId:string}>}){return lodgingContextHTTP(request,(await params).tripId,true);}
