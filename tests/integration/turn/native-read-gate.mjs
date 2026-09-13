/** Loopback-only latency fixture: hold native history reads without changing their payload. */
import {createServer,request} from 'node:http';
import {once} from 'node:events';
export async function createNativeReadGate(upstream){
 const target=new URL(upstream);
 if(target.protocol!=='http:'||target.hostname!=='127.0.0.1')throw Error('Local fixture required');
 let held=false;const waiting=new Set();
 const release=()=>{held=false;for(const forward of waiting)forward();waiting.clear();};
 const server=createServer(async(req,res)=>{
  if(req.url==='/__read-control'&&req.method==='POST'){
   const chunks=[];let size=0;
   for await(const chunk of req){size+=chunk.length;if(size>100){res.writeHead(413);res.end();return;}chunks.push(chunk);}
   const command=Buffer.concat(chunks).toString();
   if(command==='hold')held=true;else if(command==='release')release();else{res.writeHead(400);res.end();return;}
   res.end('{}');return;
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
 return {api,controlURL:api+'/__read-control',close:async()=>{release();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
