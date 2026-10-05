import type { NextRequest } from 'next/server';
import { nativeNoticeHTTP } from '@/lib/server/notifications/delivery-http';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) { return nativeNoticeHTTP(request, null); }
