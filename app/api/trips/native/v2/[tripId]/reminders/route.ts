import type { NextRequest } from 'next/server';
import { nativeReminderHTTP } from '@/lib/server/notifications/native-http';
export const runtime = 'nodejs';
export async function GET(request: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  return nativeReminderHTTP(request, (await params).tripId);
}
export const POST = GET;
