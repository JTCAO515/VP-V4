import { translationHistoryHTTP } from "@/lib/server/media-translation/text/history-http";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ turnId: string }> }) {
  return translationHistoryHTTP(request, (await context.params).turnId);
}
