import { NextRequest, NextResponse } from "next/server";
import { createWebRpc } from "@/lib/server/identity/web-rpc";
import { opsRuntimeConfig } from "@/lib/server/knowledge/review/local-workspace";
import { requestLifetime } from "@/lib/server/knowledge/review/request-lifetime";
import { knowledgeReadScope } from "@/lib/server/knowledge/publication/statement";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  // First deployment is local/explicit Staging only. No Production activation is inferred.
  const config=opsRuntimeConfig(request, {...process.env,
    OPS_LOCAL_REVIEW:process.env.KNOWLEDGE_LOCAL_READ,
    OPS_STAGING_REVIEW:process.env.KNOWLEDGE_STAGING_READ,
  });
  const response=(body: unknown,status: number)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store","Vary":"Cookie","X-Content-Type-Options":"nosniff"}});
  if (!config) return response({error:"KNOWLEDGE_DISABLED"},503);
  if (request.headers.has("authorization")) return response({error:"UNAUTHENTICATED"},401);
  const scope=knowledgeReadScope(new URL(request.url));
  if (!scope) return response({error:"INVALID_INPUT"},400);
  const lifetime=requestLifetime(request.signal);
  const rpc=createWebRpc(request,config,lifetime);
  try {
    if (!await lifetime.run(()=>rpc.authenticate())) return response({error:"UNAUTHENTICATED"},401);
    const {data,error}=await lifetime.run(()=>rpc.call("knowledge_read_v1",{p_input:scope}));
    const code=error?.message;
    const status=code==="UNAUTHENTICATED" || code==="SESSION_REPLACED" ? 401 : code==="INVALID_INPUT" ? 400 : 503;
    const safeCode=code==="UNAUTHENTICATED" || code==="SESSION_REPLACED" || code==="INVALID_INPUT" || code==="KNOWLEDGE_DISABLED" ? code : "KNOWLEDGE_UNAVAILABLE";
    return rpc.applyCookies(error ? response({error:safeCode},status) : response({data},200));
  } catch { return response({error:"KNOWLEDGE_UNAVAILABLE"},503); }
  finally { lifetime.dispose(); }
}
