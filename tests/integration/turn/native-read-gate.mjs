/** Loopback-only history latency and event transport interruption fixture. */
import {createServer,request} from 'node:http';
import {once} from 'node:events';
export async function createNativeReadGate(upstream){
 const target=new URL(upstream);
 if(target.protocol!=='http:'||target.hostname!=='127.0.0.1')throw Error('Local fixture required');
 let held=false,eventsDropped=false;const waiting=new Set(),eventResponses=new Set(),eventRequests=[];
 const release=()=>{held=false;for(const forward of waiting)forward();waiting.clear();};
 const server=createServer(async(req,res)=>{
  if(req.url==='/__event-observation'&&req.method==='GET'){
   res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({requests:eventRequests,dropped:eventsDropped}));return;
  }
  if(req.url==='/__read-control'&&req.method==='POST'){
   const chunks=[];let size=0;
   for await(const chunk of req){size+=chunk.length;if(size>100){res.writeHead(413);res.end();return;}chunks.push(chunk);}
   const command=Buffer.concat(chunks).toString();
   if(command==='hold')held=true;
   else if(command==='release')release();
   else if(command==='drop-events'){
    eventsDropped=true;
    for(const response of eventResponses)response.destroy();
    eventResponses.clear();
   }else if(command==='resume-events')eventsDropped=false;
   else{res.writeHead(400);res.end();return;}
   res.end('{}');return;
  }
  const eventPath=req.method==='GET'&&/^\/api\/chat\/native\/v4\/turns\/[0-9a-f-]{36}\/events$/.test(req.url??'');
  if(eventPath){
   eventRequests.push({turnId:req.url.split('/')[6],cursor:req.headers['last-event-id']??null});
   if(eventsDropped){res.destroy();return;}
   eventResponses.add(res);res.on('close',()=>eventResponses.delete(res));
  }
  const forward=()=>{
   waiting.delete(forward);if(res.destroyed)return;
   const next=request(new URL(req.url,target),{method:req.method,headers:{...req.headers,host:target.host}},reply=>{res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);});
   next.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});
   res.on('close',()=>next.destroy());req.pipe(next);
  };
  if(held&&req.method==='GET'&&req.url==='/api/chat/native/v4/turns'){
   waiting.add(forward);res.on('close',()=>waiting.delete(forward));
  }else forward();
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const api='http://127.0.0.1:'+server.address().port;
 return {api,controlURL:api+'/__read-control',eventRequests,close:async()=>{release();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
