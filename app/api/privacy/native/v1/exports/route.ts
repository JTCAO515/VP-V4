import { coreExportHTTP } from "@/lib/server/privacy/export-http";
export const runtime = "nodejs";
export const maxDuration = 90;
export const POST = (request: Request) => coreExportHTTP(request, "request");
export const GET = (request: Request) => coreExportHTTP(request, "read");
