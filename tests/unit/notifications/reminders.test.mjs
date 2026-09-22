import test from 'node:test';
import assert from 'node:assert/strict';
import { reminderDecision, deliveryAvailability, privateLockScreenPayload } from '../../../lib/server/notifications/contract.ts';
const reminder = { id:'r',ownerId:'a',tripId:'t',sessionId:'s',baseVersion:2,reason:'Passport 123, hotel room 456',dueAt:'2026-09-22T10:00:00Z',expiresAt:'2026-09-22T11:00:00Z',timeZone:'Asia/Shanghai',status:'saved',purpose:'user_set_travel' };
const context = {ownerId:'a',tripId:'t',sessionId:'s',tripVersion:2,consent:true,systemPermission:true,timeZone:'Asia/Shanghai',archived:false,tripEndsAt:'2026-09-23T00:00:00Z',currentSession:true};
const now = new Date('2026-09-22T10:30:00Z');
test('due reminder eligible only with fresh complete authority; delivery remains unavailable', () => {
 assert.equal(reminderDecision(reminder,context,now),'eligible');
 assert.equal(deliveryAvailability(),'unavailable');
 assert.ok(!JSON.stringify(privateLockScreenPayload).includes(reminder.reason));
});
for (const [change, reason] of [
 [{ownerId:'b'},'account_changed'],[{sessionId:'new'},'account_changed'],[{currentSession:false},'account_changed'],
 [{tripVersion:3},'trip_changed'],[{tripId:'other'},'trip_changed'],[{consent:false},'consent_required'],
 [{archived:true},'archived'],[{archived:null},'archive_unknown'],[{tripEndsAt:null},'trip_end_unknown'],
 [{tripEndsAt:'invalid'},'trip_end_unknown'],[{tripEndsAt:now.toISOString()},'trip_ended'],
 [{timeZone:'Europe/London'},'time_zone_changed'],[{timeZone:''},'time_zone_unknown'],[{systemPermission:false},'system_permission_required'],
]) test(reason+JSON.stringify(change),()=>assert.equal(reminderDecision(reminder,{...context,...change},now),reason));
for (const status of ['cancelled','completed']) test(status,()=>assert.equal(reminderDecision({...reminder,status},context,now),status));
test('expiry boundaries and malformed time fail closed',()=>{
 assert.equal(reminderDecision(reminder,context,new Date(reminder.expiresAt)),'expired');
 assert.equal(reminderDecision(reminder,context,new Date('2026-09-22T09:59:59Z')),'not_due');
 assert.equal(reminderDecision({...reminder,dueAt:'invalid'},context,now),'invalid_time');
 assert.equal(reminderDecision({...reminder,purpose:'marketing'},context,now),'consent_required');
});
