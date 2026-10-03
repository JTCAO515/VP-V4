import { memoryDeletionHTTP } from '@/lib/server/privacy/memory-delete/http';
export const runtime='nodejs';
export async function GET(request:Request){return memoryDeletionHTTP(request);}
export async function POST(request:Request){return memoryDeletionHTTP(request);}
