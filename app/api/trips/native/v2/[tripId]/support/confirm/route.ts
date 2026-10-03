import type { NextRequest } from "next/server";
import { nativeTripSupportHTTP } from "@/lib/server/trip/support/native-http";
export const runtime="nodejs";
export const maxDuration=90;
export async function POST(request:NextRequest,{params}:{params:Promise<{tripId:string}>}){return nativeTripSupportHTTP(request,"confirm",(await params).tripId);}
