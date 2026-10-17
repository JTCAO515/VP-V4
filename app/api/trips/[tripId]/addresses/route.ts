import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createUserDataAdapter } from '@/lib/server/identity/user-data-adapter';
import { isUuid } from '@/lib/server/identity/request-guards';
import { failureResponse } from '@/lib/server/identity/failure-response';

export async function GET(request: NextRequest, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const search = request.nextUrl.searchParams;
  const version = search.get('expectedTripVersion'), dayId = search.get('dayId'), itemId = search.get('itemId');
  const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
  if (!isUuid(tripId) || [...search].length !== 3 || [...search].some(([key]) => !['expectedTripVersion', 'dayId', 'itemId'].includes(key) || search.getAll(key).length !== 1)
    || version === null || !/^(0|[1-9][0-9]{0,8})$/.test(version) || !dayId || !itemId
    || !/^[A-Za-z0-9_-]{1,64}$/.test(dayId) || !/^[A-Za-z0-9_-]{1,64}$/.test(itemId)) return json(failureResponse('INVALID_INPUT'), 400);
  const adapter = createUserDataAdapter(request);
  if (!adapter) return json(failureResponse('PROVIDER_UNAVAILABLE'), 503);
  const result = await adapter.readTripItemAddressSupport(tripId, Number(version), dayId, itemId);
  if ('error' in result) {
    const failure = failureResponse(result.error);
    return adapter.applyCookies(json(failure, failure.status));
  }
  return adapter.applyCookies(json(result.data));
}
