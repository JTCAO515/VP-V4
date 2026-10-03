import { linkedTripDeletionHTTP } from '@/lib/server/privacy/linked-trip/http';
export const runtime='nodejs';
export async function GET(request:Request){return linkedTripDeletionHTTP(request);}
export async function POST(request:Request){return linkedTripDeletionHTTP(request);}
