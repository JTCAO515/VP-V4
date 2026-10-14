import { NextRequest, NextResponse } from 'next/server';
import { createWebRpc } from '@/lib/server/identity/web-rpc';
import { opsRuntimeConfig } from '@/lib/server/knowledge/review/local-workspace';
import { handleControlOperations } from '@/lib/server/observability/ops-control/http';
export const dynamic='force-dynamic';
export async function POST(request:NextRequest){
 const config=opsRuntimeConfig(request);let rpc:ReturnType<typeof createWebRpc>|undefined;
 const result=await handleControlOperations(request,{
  enabled:config!==null,
  createRpc(lifetime){
   rpc=createWebRpc(request,config!,lifetime);const bound=rpc;
   return {authenticate:()=>bound.authenticate(),operations:input=>bound.call('ops_control_operations_v1',{p_input:input})};
  },
 });
 const response=NextResponse.json(result.body,{status:result.status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'}});
 return rpc?rpc.applyCookies(response):response;
}
