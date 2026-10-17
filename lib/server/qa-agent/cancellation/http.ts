import { NextResponse, type NextRequest } from "next/server.js";
import { QA_CANCELLATION_VERSION } from "../../../qa-agent/cancellation-contract.ts";
import { createUserDataAdapter } from "../../identity/user-data-adapter.ts";
import { nativeRequestScope } from "../../identity/native-request.ts";
import { browserBoundary } from "../browser-boundary.ts";
import { qaCancellationConfig } from "../config.ts";
import { createQaCancellationService, QaCancellationError } from "./service.ts";
const statuses = { INVALID_INPUT:400, UNAUTHENTICATED:401, FORBIDDEN:403, PROVIDER_UNAVAILABLE:503 } as const;
export async function qaCancellationHTTP(request: NextRequest, sessionId: string, requestId: string) {
  const reply=(body: object,status=200)=>NextResponse.json({version:QA_CANCELLATION_VERSION,sessionId,requestId,...body},
    {status,headers:{"Cache-Control":"private, no-store","Vary":"Cookie, Origin"}});
  if(!browserBoundary(request))return reply({error:{code:"FORBIDDEN",ack:"not_submitted"}},403);
  const config=qaCancellationConfig(request.url,process.env);
  if(!config)return reply({error:{code:"PROVIDER_UNAVAILABLE",ack:"not_submitted"}},503);
  const scope=nativeRequestScope(request.signal,15000),adapter=createUserDataAdapter(request,config,scope.fetch);
  if(!adapter){scope.dispose();return reply({error:{code:"PROVIDER_UNAVAILABLE",ack:"not_submitted"}},503);}
  let invoked=false;
  try{
    let input: unknown;
    if(request.method==="POST"){
      if(request.headers.get("content-type")?.split(";")[0].trim()!=="application/json")throw new QaCancellationError("INVALID_INPUT");
      const raw=await scope.body(request,1024);if(raw===null)throw new QaCancellationError("INVALID_INPUT");
      try{input=JSON.parse(raw);}catch{throw new QaCancellationError("INVALID_INPUT");}
    }
    const service=createQaCancellationService(async(name,params)=>{
      invoked=true;
      const result=await scope.run(()=>adapter.runGroundedAiAssist(rpc=>rpc(name,params)));
      if("error" in result)throw new QaCancellationError(result.error==="UNAUTHENTICATED"?"UNAUTHENTICATED":"PROVIDER_UNAVAILABLE",result.error==="UNAUTHENTICATED"?"not_submitted":"unknown");
      return result.data;
    });
    const receipt=await service(request.method==="POST"?"cancel":"read",sessionId,requestId,input);
    scope.check();return adapter.applyCookies(reply(receipt,request.method==="POST"&&receipt.ack==="unknown"?202:200));
  }catch(error){
    const failure=error instanceof QaCancellationError?error:new QaCancellationError("PROVIDER_UNAVAILABLE",invoked?"unknown":"not_submitted");
    return adapter.applyCookies(reply({error:{code:failure.code,ack:failure.ack}},statuses[failure.code]));
  }finally{scope.dispose();}
}
