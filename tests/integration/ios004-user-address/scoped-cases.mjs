import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
export async function scopedCases(c,fixture){
 const snapshot=structuredClone(fixture.current),original=snapshot.days[0].items[0].chineseAddress;
 snapshot.days.push({id:'e',date:'2026-10-17',items:[]});
 snapshot.days[0].items.push({id:'source',dayId:'d',title:'Other visit',chineseAddress:{...original,text:'Source address only'}});
 const context={id:randomUUID(),snapshot,base_version:5,input:{scope:{dayIds:['d','e'],itemIds:[]}},locked_ids:[],fixed_ids:[]};
 const manual=async edit=>(await c.query('select scoped_edit_private.manual_patch_v1(jsonb_populate_record(null::scoped_edit_private.contexts_v1,$1),$2) value',[context,edit])).rows[0].value;
 const candidate=async edits=>(await c.query('select scoped_edit_private.candidate_patch_v1(jsonb_populate_record(null::scoped_edit_private.contexts_v1,$1),$2,$3,$4) value',[context,randomUUID(),randomUUID(),JSON.stringify(edits)])).rows[0].value;
 const apply=async patch=>(await c.query('select public.apply_trip_content_patch($1,$2) value',[snapshot,patch])).rows[0].value;
 const move=await manual({kind:'move_item',itemId:'i',toDayId:'e'});
 assert.equal(move.operations.length,3);assert.deepEqual((await apply(move)).days[1].items[0].chineseAddress,original);
 assert.ok(move.operations.every(op=>!Object.hasOwn(op,'chineseAddress')),'old upsert never carries a privileged value');
 const timed=await apply(await manual({kind:'set_time',itemId:'i',startsAt:'2026-10-16T10:00:00Z',endsAt:'2026-10-16T11:00:00Z'}));
 assert.deepEqual(timed.days[0].items.find(item=>item.id==='i').chineseAddress,original);
 const replaced=await apply(await candidate([{kind:'replace_item',itemId:'i',sourceItemId:'source'}]));
 assert.deepEqual(replaced.days[0].items.find(item=>item.id==='i').chineseAddress,original);
 const added=await apply(await candidate([{kind:'add_item',sourceItemId:'source',toDayId:'e'}]));
 assert.equal(added.days[1].items[0].chineseAddress,undefined);
 const removed=await apply(await candidate([{kind:'remove_item',itemId:'i'}]));
 assert.equal(removed.days[0].items.some(item=>item.id==='i'),false);
 console.log('PASS actual original SQL scoped move/time/replace preserve own address, new item never copies source, explicit removal deletes it');
}
