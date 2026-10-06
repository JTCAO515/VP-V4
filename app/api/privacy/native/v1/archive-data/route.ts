import { archiveDataNativeHTTP } from '../../../../../../lib/server/privacy/archive-data/http.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request): Promise<Response> { return archiveDataNativeHTTP(request); }
