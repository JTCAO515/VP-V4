import type { NextRequest } from 'next/server';
import { nativeNoticeHTTP } from '@/lib/server/notifications/delivery-http';
export const runtime = 'nodejs';
export async function GET(request: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  return nativeNoticeHTTP(request, (await params).tripId);
}
export const POST = GET;
