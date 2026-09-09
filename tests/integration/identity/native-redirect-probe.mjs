import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

/** Controlled HTTP transport fixture only; never contacts an external redirect destination. */
export async function createNativeRedirectProbe() {
  let secondHops=0,redirects=0,mode='normal',code=307;
  const subject=randomUUID();
  const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve('http://127.0.0.1:'+server.address().port)));
  const sink=createServer((request,response)=>{secondHops++;request.resume();response.writeHead(500);response.end();});
  const destination=await listen(sink);
  const source=createServer(async(request,response)=>{
    const url=new URL(request.url,'http://127.0.0.1');
    for await (const chunk of request) void chunk; // Consume, never retain or log credential bodies.
    response.setHeader('Content-Type','application/json');
    if(url.pathname==='/control') {mode=url.searchParams.get('mode');code=Number(url.searchParams.get('code'));response.end('{}');return;}
    if(url.pathname==='/counts') {response.end(JSON.stringify({secondHops,redirects}));return;}
    const action=url.pathname.split('/').at(-1);
    if((action==='credentials' && mode==='credentials') || (action==='refresh' && mode==='refresh')) {
      redirects++;response.writeHead(code,{Location:destination+'/credential-sink'});response.end();return;
    }
    if(action==='profile'){response.end(JSON.stringify({version:2,subject,displayName:'Redirect transport probe'}));return;}
    response.end(JSON.stringify({version:2,subject,sessionId:randomUUID(),mobileEpoch:1,accessToken:'synthetic-access',refreshToken:'synthetic-refresh',expiresAt:Math.floor(Date.now()/1000)+3600}));
  });
  const url=await listen(source);
  return {url,close:()=>{source.closeAllConnections();source.close();sink.closeAllConnections();sink.close();}};
}
