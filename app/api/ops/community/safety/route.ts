import {NextRequest,NextResponse} from 'next/server';
import {isSameOriginMutation} from '@/lib/server/identity/request-guards';
import {opsRuntimeConfig} from '@/lib/server/knowledge/review/local-workspace';
import {handleSafetyRequest} from '@/lib/server/community/safety/http';
import {createSafetyWebRPC} from '@/lib/server/community/safety/web-rpc';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:NextRequest) {
  const config=opsRuntimeConfig(request);let rpc:ReturnType<typeof createSafetyWebRPC>|undefined;
  const result=await handleSafetyRequest(request,{enabled:!!config && process.env.COMMUNITY_SAFETY_INTERNAL==='1',cleanupEnabled:!!config,surface:'ops',sameOrigin:isSameOriginMutation(request),createRpc:lifetime=>{rpc=createSafetyWebRPC(request,config!,lifetime);return rpc;}});
  const response=NextResponse.json(result.body,{status:result.status,headers:{'Cache-Control':'private, no-store',Vary:'Cookie','X-Content-Type-Options':'nosniff'}});
  return rpc?rpc.applyCookies(response):response;
}
