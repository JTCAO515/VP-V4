import { profileDataNativeHTTP } from '@/lib/server/privacy/profile-data/http';

export const runtime = 'nodejs';
export async function POST(request: Request) { return profileDataNativeHTTP(request); }
