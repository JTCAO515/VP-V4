import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {setTimeout as delay} from 'node:timers/promises';

/** Fixture-only view predicate is an execution barrier, not another reader implementation.
 * The actual migrated read_owner_v1 executes unchanged against a one-to-one updatable view.
 * The table snapshot is pinned before the writer commits a second overlapping family.
 */
export async function snapshotConcurrency({db,apply,read,raw,socket}) {
 const {Client}=createRequire(import.meta.url)(process.env.SUBSCRIPTION_PG_MODULE);
 const reader=new Client({host:socket,user:'postgres',database:'postgres'});
 const own='44444444-4444-4444-8444-444444444444', key=[226,20261016];
 let readerResult,gateHeld=false,renamed=false;
 await reader.connect();
 try {
  await reader.query("set statement_timeout='10s'; set subscription_snapshot.reader='on'");
  assert.equal((await reader.query('show transaction_isolation')).rows[0].transaction_isolation,'read committed');
  const {pid}= (await reader.query('select pg_backend_pid() as pid')).rows[0];
  const gatePid=(await db.query('select pg_backend_pid() as pid')).rows[0].pid;
  const first=raw('12001','12001',own);
  await apply(first,0);
  const second=raw('12002','12002',own,{purchaseAt:new Date(Date.parse(first.purchaseAt)+1000).toISOString()});
  await db.query('alter table subscription_development.periods rename to snapshot_fixture_periods');renamed=true;
  await db.query(`
   create sequence subscription_development.snapshot_fixture_sequence;
   create function subscription_development.snapshot_fixture_barrier() returns boolean
   language plpgsql volatile set search_path='' as $$
   begin
    if current_setting('subscription_snapshot.reader',true)='on' then
     if nextval('subscription_development.snapshot_fixture_sequence')=1 then
      perform pg_advisory_xact_lock(226,20261016);
     end if;
    end if;
    return true;
   end $$;
   revoke all on function subscription_development.snapshot_fixture_barrier() from public,anon,authenticated,service_role;
   revoke all on sequence subscription_development.snapshot_fixture_sequence from public,anon,authenticated,service_role;
   create view subscription_development.periods as select * from subscription_development.snapshot_fixture_periods
    where subscription_development.snapshot_fixture_barrier();
   revoke all on subscription_development.periods from public,anon,authenticated,service_role;
  `);
  await db.query('select pg_advisory_lock($1,$2)',key);gateHeld=true;
  readerResult=reader.query('select subscription_development.read_owner_v1($1) as snapshot',[own]);
  // Observe the actual backend lock dependency, not a sleep followed by a lucky race.
  void readerResult.catch(()=>{});
  let blocked=false;
  const deadline=performance.now()+5000;
  while(performance.now()<deadline){
   const r=await db.query('select $2::int=any(pg_blocking_pids($1)) as blocked',[pid,gatePid]);
   if(r.rows[0].blocked){blocked=true;break;}
   await delay(5);
  }
  assert.equal(blocked,true,'reader must reach the barrier inside its actual period scan');
  // Real writer commits while the reader's table scan/statement snapshot is held.
  await apply(second,0);
  assert.equal((await db.query('select count(*)::int as n from subscription_development.families where owner_id=$1',[own])).rows[0].n,2);
  await db.query('select pg_advisory_unlock($1,$2)',key);gateHeld=false;
  const snapshot=(await readerResult).rows[0].snapshot;
  // Before-commit snapshot has only first. A mixed-snapshot old implementation returns
  // active second; a single snapshot can never count one and choose that new row.
  assert.equal(snapshot.state,'active');
  assert.equal(snapshot.period.transactionId,first.transactionId,'count and selection must come from the same snapshot');
  assert.ok(snapshot.lifetimeMs>0&&snapshot.lifetimeMs<=300000);
  const after=await read(own);
  assert.equal(after.state,'reconciliation_required');assert.equal(after.period,null);
  assert.equal(after.ownerId,null);assert.equal(after.checkedAt,null);assert.equal(after.lifetimeMs,0);
 } finally {
  if(gateHeld)await db.query('select pg_advisory_unlock($1,$2)',key);
  if(readerResult)await readerResult.catch(()=>{});
  await reader.end();
  if(renamed){
   await db.query(`drop view if exists subscription_development.periods;
    alter table subscription_development.snapshot_fixture_periods rename to periods;
    drop function if exists subscription_development.snapshot_fixture_barrier();
    drop sequence if exists subscription_development.snapshot_fixture_sequence;`);
  }
 }
}
