import type { NextRequest } from 'next/server';
import { nativeDirectionsHTTP } from '@/lib/server/planning/directions/http';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(request:NextRequest){return nativeDirectionsHTTP(request,'intake');}
