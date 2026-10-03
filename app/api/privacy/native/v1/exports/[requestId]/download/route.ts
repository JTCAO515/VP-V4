import { coreExportHTTP } from "@/lib/server/privacy/export-http";
export const runtime = "nodejs";
export const maxDuration = 90;
export async function GET(request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  return coreExportHTTP(request, "download", (await params).requestId);
}
