import type { NextRequest } from 'next/server';
import { nativeDirectionsHTTP } from '@/lib/server/planning/directions/http';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function POST(request:NextRequest){return nativeDirectionsHTTP(request,'edit');}
