import { conversationDataNativeHTTP } from '../../../../../../lib/server/privacy/conversation-data/http.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request): Promise<Response> { return conversationDataNativeHTTP(request); }
