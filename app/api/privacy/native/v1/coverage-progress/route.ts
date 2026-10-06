import { coverageProgressNativeHTTP } from '../../../../../../lib/server/privacy/coverage-progress/http.ts';
export const runtime = 'nodejs';
export async function POST(request: Request) { return coverageProgressNativeHTTP(request); }
