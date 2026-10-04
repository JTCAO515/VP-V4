import {NextRequest,NextResponse} from 'next/server';
import {createWebRpc} from '@/lib/server/identity/web-rpc';
import {isSameOriginMutation} from '@/lib/server/identity/request-guards';
import {opsRuntimeConfig} from '@/lib/server/knowledge/review/local-workspace';
import {handleClassificationOps} from '@/lib/server/knowledge/classification/http-ops';
export const dynamic='force-dynamic';
export async function POST(request:NextRequest){
 const enabled=process.env.VISEPANDA_LODGING_CLASSIFICATION_OPS_ENABLED==='true',config=enabled?opsRuntimeConfig(request):null;let rpc:ReturnType<typeof createWebRpc>|undefined;
 const result=await handleClassificationOps(request,{enabled:enabled&&config!==null,sameOrigin:isSameOriginMutation(request),createRpc:lifetime=>{rpc=createWebRpc(request,config!,lifetime);return rpc;}});
 const response=NextResponse.json(result.body,{status:result.status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'}});return rpc?rpc.applyCookies(response):response;
}
