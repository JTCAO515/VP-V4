import { resultDataNativeHTTP } from '../../../../../../lib/server/privacy/result-data/http.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request): Promise<Response> { return resultDataNativeHTTP(request); }
