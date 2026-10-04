import type {NextRequest} from "next/server";
import {reservationReturnHTTP} from "@/lib/server/reservations/http";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request:NextRequest,{params}:{params:Promise<{tripId:string}>}){return reservationReturnHTTP(request,(await params).tripId,true);}
