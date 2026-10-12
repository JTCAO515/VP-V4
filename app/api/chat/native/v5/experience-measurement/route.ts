import { measurementNativeHTTP } from '@/lib/server/journey-entry/experience-measurement/http';
export const runtime = 'nodejs';
export async function POST(request: Request) { return measurementNativeHTTP(request); }
