// Explicit synthetic HTTP input for the real iOS share UI. Not DB/auth acceptance.
// No credentials, public listener, persistent data or production API calls.
import { createServer } from 'node:http';
const tripId='11111111-1111-4111-8111-111111111111';
let version=1, denied=false;
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1:59941');
 const reply=(data,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(data));};
 if(url.pathname==='/control/reset'){version=1;denied=false;return reply({ok:true});}
 if(url.pathname==='/control/update'){version++;return reply({ok:true});}
 if(url.pathname==='/control/deny'){denied=true;return reply({ok:true});}
 if(denied)return reply({error:{code:'UNAUTHENTICATED'}},401);
 if(url.pathname.endsWith('/credentials')||url.pathname.endsWith('/refresh'))return reply({subject:'share-synthetic',accessToken:'synthetic-not-a-credential',refreshToken:'synthetic-not-a-credential',expiresAt:Date.now()/1000+3600,mobileEpoch:1});
 if(url.pathname.endsWith('/profile'))return reply({subject:'share-synthetic',displayName:'Synthetic share test'});
 if(url.pathname.startsWith('/api/auth/native/'))return reply({subject:'share-synthetic',mobileEpoch:1});
 const trip={id:tripId,title:'Hotel room 908 / Alice',headVersion:version,updatedAt:`2026-09-17T00:00:0${version}Z`};
 if(url.pathname==='/api/trips/native/v2')return reply({version:2,trips:[trip],currentTripId:tripId});
 if(url.pathname.endsWith('/proposal'))return reply({error:{code:'PROPOSAL_NOT_CONFIRMABLE'}},404);
 if(url.pathname==='/api/trips/native/v2/'+tripId)return reply({version:2,trip,confirmationState:'confirmed',hardLocks:'unknown',externalOrderStatus:'unknown',content:{days:[
  {id:'d1',date:'2026-10-02',items:[{id:'museum',dayId:'d1',title:'Museum / 博物馆'},{id:'hotel',dayId:'d1',title:'Hotel booking ABC / Alice / room 908'}]},
  {id:'d2',date:'2026-10-03',items:[{id:'park',dayId:'d2',title:'Park / 公园'}]}
 ]}});
 reply({error:{code:'NOT_FOUND'}},404);
});
server.listen(59941,'127.0.0.1',()=>console.log('Synthetic sharing fixture listening on loopback 59941'));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close());
