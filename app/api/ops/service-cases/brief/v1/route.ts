import { NextRequest, NextResponse } from 'next/server';
import { createServiceWebRPC } from '@/lib/server/service-cases/operations/web-rpc';
import { isSameOriginMutation } from '@/lib/server/identity/request-guards';
import { opsLocalConfig } from '@/lib/server/knowledge/review/local-workspace';
import { handleTravelerBrief } from '@/lib/server/service-cases/brief/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
  const config = process.env.SERVICE_CASE_BRIEF_LOCAL === '1' ? opsLocalConfig({...process.env,OPS_LOCAL_REVIEW:'1'}) : null;
  let rpc: ReturnType<typeof createServiceWebRPC> | undefined;
  const result = await handleTravelerBrief(request,{enabled:!!config,surface:'staff',sameOrigin:isSameOriginMutation(request),createRpc:lifetime => { rpc = createServiceWebRPC(request,config!,lifetime); return rpc; }});
  const response = NextResponse.json(result.body,{status:result.status,headers:{'Cache-Control':'private, no-store',Vary:'Cookie','X-Content-Type-Options':'nosniff'}});
  return rpc ? rpc.applyCookies(response) : response;
}
