import {NextRequest,NextResponse} from 'next/server';
import {isSameOriginMutation} from '@/lib/server/identity/request-guards';
import {opsRuntimeConfig} from '@/lib/server/knowledge/review/local-workspace';
import {handlePublicationRequest} from '@/lib/server/community/publication/http';
import {createPublicationWebRPC} from '@/lib/server/community/publication/web-rpc';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:NextRequest) {
  const configured=opsRuntimeConfig(request);const config=configured && !process.env.VERCEL_ENV?configured:null;let rpc:ReturnType<typeof createPublicationWebRPC>|undefined;
  const result=await handlePublicationRequest(request,{enabled:!!config && process.env.COMMUNITY_PUBLICATION_CONTROLLED==='1',cleanupEnabled:!!config,surface:'ops',sameOrigin:isSameOriginMutation(request),createRpc:lifetime=>{rpc=createPublicationWebRPC(request,config!,lifetime);return rpc;}});
  const response=NextResponse.json(result.body,{status:result.status,headers:{'Cache-Control':'private, no-store',Vary:'Cookie','X-Content-Type-Options':'nosniff'}});
  return rpc?rpc.applyCookies(response):response;
}
