import { nativeMemoryProfilesHTTP } from '@/lib/server/memory/native-profiles-http';
export const runtime = 'nodejs';
export async function GET(request: Request) { return nativeMemoryProfilesHTTP(request); }
export async function POST(request: Request) { return nativeMemoryProfilesHTTP(request); }
