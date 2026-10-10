import type { NextRequest } from 'next/server';
import { nativeDirectionsTripReferenceHTTP } from '@/lib/server/planning/directions/native-trip-reference';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(request:NextRequest){return nativeDirectionsTripReferenceHTTP(request);}
