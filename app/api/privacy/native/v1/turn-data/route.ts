import { turnDataNativeHTTP } from '@/lib/server/privacy/turn-data/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request): Promise<Response> { return turnDataNativeHTTP(request); }
