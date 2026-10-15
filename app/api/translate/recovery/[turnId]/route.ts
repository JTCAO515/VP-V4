import { translationRecoveryHTTP } from "@/lib/server/media-translation/text/recovery-http";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ turnId: string }> }) {
  return translationRecoveryHTTP(request, (await context.params).turnId);
}
