import { notificationDataNativeHTTP } from '../../../../../../lib/server/privacy/notification-data/http.ts';
export const runtime = 'nodejs';
export async function POST(request: Request) { return notificationDataNativeHTTP(request); }
