import type { NextRequest } from 'next/server';
import { webDirectionsHTTP } from '@/lib/server/planning/directions/web-http';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function POST(request:NextRequest,{params}:{params:Promise<{tripId:string}>}){return webDirectionsHTTP(request,(await params).tripId,'edit');}
