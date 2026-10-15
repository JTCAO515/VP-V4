import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const address='  上海市\n中山东一路 1 号  ';
export async function authorityCases(c){
 const owner=randomUUID(),other=randomUUID(),trip=randomUUID(),session=randomUUID(),otherSession=randomUUID();
 const q=async(sql,args=[])=>c.query(sql,args);
 const actor=async(id=owner)=>q("select set_config('request.jwt.claim.role','authenticated',false),set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[id,JSON.stringify({role:'authenticated',is_anonymous:false,session_id:id===owner?session:otherSession})]);
 const snap=async()=> (await q("select s.content value from public.trips t join public.trip_version_snapshots s on s.trip_id=t.id and s.owner_id=t.owner_id and s.version=t.head_version where t.id=$1",[trip])).rows[0].value;
 const op=text=>({expectedVersion:1,operations:[{kind:'set_item_chinese_address',dayId:'d',itemId:'i',text}]});
 const propose=async patch=>(await q('select * from public.create_trip_proposal_patch($1,$2)',[trip,patch])).rows[0];
 const digest=async id=>(await q('select digest from public.read_trip_proposal_v2($1)',[id])).rows[0].digest;
 const confirm=async(p,key=randomUUID(),dig=null)=>(await q('select * from public.confirm_and_apply_trip_proposal($1,$2,$3)',[p.proposal_id,key,dig??await digest(p.proposal_id)])).rows[0];
 const reject=async(fn,pattern)=>{await q('begin');try{await assert.rejects(fn,pattern);}finally{await q('rollback');}};
 await q('insert into auth.users(id) values($1),($2)',[owner,other]);
 await q('insert into auth.sessions(id,user_id) values($1,$2),($3,$4)',[session,owner,otherSession,other]);
 await q('insert into identity_private.mobile_accounts(owner_id,epoch,session_id) values($1,1,$2),($3,1,$4)',[owner,session,other,otherSession]);
 await actor();await q('set role authenticated');
 await q("insert into public.trips(id,owner_id,title) values($1,$2,'Address fixture')",[trip,owner]);
 const initial=await propose({expectedVersion:0,operations:[{kind:'upsert_day',dayId:'d',date:'2026-10-16'},{kind:'upsert_item',dayId:'d',itemId:'i',title:'Visit'}]});
 assert.equal((await confirm(initial)).outcome,'applied');
 const before=await snap(),pending=await propose(op(address)),key=randomUUID(),dig=await digest(pending.proposal_id);
 assert.deepEqual(await snap(),before,'draft must never write confirmed');
 assert.equal((await confirm(pending,key,dig)).resulting_version,2);
 assert.deepEqual((await snap()).days[0].items[0].chineseAddress,{text:address,source:'user_provided',verification:'unverified'});
 assert.equal((await confirm(pending,key,dig)).outcome,'already_applied','unknown ACK recovers same key');
 await actor(other);await reject(()=>confirm(pending,randomUUID(),dig),/FORBIDDEN/);await actor();
 await reject(()=>propose(op('旧地址')),/STALE_TRIP_VERSION/);
 const legacy=await propose({expectedVersion:2,operations:[{kind:'upsert_item',dayId:'d',itemId:'i',title:'Renamed'}]});
 assert.equal((await confirm(legacy)).outcome,'applied');assert.equal((await snap()).days[0].items[0].chineseAddress.text,address);

 const clear=await propose({expectedVersion:3,operations:[{kind:'set_item_chinese_address',dayId:'d',itemId:'i',text:null}]});
 assert.equal((await confirm(clear)).outcome,'applied');assert.equal((await snap()).days[0].items[0].chineseAddress,undefined);
 const rollback=(await q('select * from public.create_trip_rollback_proposal($1,2)',[trip])).rows[0];
 assert.equal((await confirm(rollback)).outcome,'applied');assert.equal((await snap()).days[0].items[0].chineseAddress.text,address);
 for(const value of ['', '\t　 ', '\u0001上海', '中'.repeat(501), '😀'.repeat(376)]){
  await reject(()=>propose({expectedVersion:5,operations:[{kind:'set_item_chinese_address',dayId:'d',itemId:'i',text:value}]}),/INVALID_PATCH/);
 }
 await reject(()=>propose({expectedVersion:5,operations:[{kind:'set_item_chinese_address',dayId:'d',itemId:'i',text:'地址',verification:'verified'}]}),/INVALID_PATCH/);
 const current=await snap();
 const stored=(await q('select content from public.trip_version_snapshots where trip_id=$1 and version=5',[trip])).rows[0].content;
 assert.deepEqual(current,stored,'exact same-version ordinary confirmed snapshot reader');
 await q('reset role');
 assert.deepEqual((await q('select public.trip_content_snapshot($1,title) value from public.trips where id=$1',[trip])).rows[0].value,current,'original canonical projection equals confirmed JSON');
 console.log('PASS original ordinary-role Proposal→Confirm, unchanged draft, exact snapshot read, false actor, stale, replay, legacy upsert, clear, rollback, invalid text/tags');
 return {trip,owner,other,session,current};
}
