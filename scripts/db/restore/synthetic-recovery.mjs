import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

// No target arguments, credentials, ports or existing resources are accepted.
assert.deepEqual(process.argv.slice(2), ["--execute"]);
assert.equal(process.env.DOCKER_HOST, undefined);
assert.equal(process.env.DOCKER_CONTEXT, undefined);
const image = "public.ecr.aws/supabase/postgres:17.6.1.159";
const runId = randomUUID();
const scratch = mkdtempSync(join(tmpdir(), "vpj38-k1-synthetic-"));
const backupDir = join(scratch, "backup");
const journalDir = join(scratch, "independent-journal");
const sourceObjects = join(scratch, "source-objects");
const restoredObjects = join(scratch, "restored-objects");
for (const dir of [backupDir, journalDir, sourceObjects, restoredObjects]) mkdirSync(dir);
const containers = [];
let context;
let stage = "preflight";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const ids = Object.fromEntries(["owner", "other", "deletedTrip", "keptTrip", "transaction", "licence", "deletedObject", "keptObject"].map((name) => [name, randomUUID()]));
const fileFor = (id) => `${id}.txt`;

function command(binary, args, input) {
  const result = spawnSync(binary, args, { input, encoding: "utf8", timeout: 60000, maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`${stage}: ${binary} exited ${result.status ?? "without status"}; raw output suppressed`);
  return result.stdout.trim();
}
function docker(args, input) { return command("docker", ["--context", context, ...args], input); }
function sql(container, statement) {
  assert.ok(containers.includes(container), "only run-owned containers may be queried");
  return docker(["exec", "-i", container, "psql", "-h", "/tmp/vpj38-socket", "-U", "postgres", "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1"], statement);
}
function expectSql(container, statement, expected) {
  assert.equal(sql(container, statement), String(expected), `${stage}: SQL assertion failed`);
}
function actorSql(container, role, actor, statement) {
  assert.ok(role === "authenticated" || role === "anon");
  return sql(container, `set role ${role}; set app.actor_id='${actor}'; ${statement}`);
}
function newCluster(name) {
  const container = `vpj38-k1-${runId.slice(0, 12)}-${name}`;
  stage = `create ${name} cluster`;
  const preexisting = spawnSync("docker", ["--context", context, "inspect", container], { encoding: "utf8", stdio: "ignore" });
  assert.notEqual(preexisting.status, 0, "refuse pre-existing container");
  // Register before run: a daemon-side success followed by CLI timeout still needs cleanup.
  // finally removes only a container carrying this run's exact owner label.
  containers.push(container);
  docker(["run", "--pull=never", "--rm", "-d", "--network", "none", "--name", container,
    "--label", `vpj38.owner=${runId}`, "--user", "postgres", "--entrypoint", "/bin/sh", image,
    "-c", "umask 077; mkdir /tmp/vpj38-socket; initdb -D /tmp/vpj38-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/vpj38-db -c listen_addresses= -c unix_socket_directories=/tmp/vpj38-socket -c unix_socket_permissions=0700"]);
  const config = JSON.parse(docker(["inspect", container]))[0];
  assert.equal(config.HostConfig.NetworkMode, "none");
  assert.equal(config.Config.Labels["vpj38.owner"], runId);
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    const probe = spawnSync("docker", ["--context", context, "exec", container, "pg_isready", "-h", "/tmp/vpj38-socket", "-U", "postgres"], { stdio: "ignore" });
    if (probe.status === 0) { ready = true; break; }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
  assert.ok(ready, "disposable database readiness timeout");
  sql(container, "create role anon nologin; create role authenticated nologin;");
  return container;
}

const schema = `
create schema recovery;
revoke all on schema recovery from public;
create table recovery.gate(singleton boolean primary key default true check(singleton), read_enabled boolean not null default false);
insert into recovery.gate(singleton) values(true);
create function recovery.reads_enabled() returns boolean language sql stable security definer set search_path='' as $$
  select read_enabled from recovery.gate where singleton
$$;
revoke all on function recovery.reads_enabled() from public;
grant usage on schema recovery to anon,authenticated;
grant execute on function recovery.reads_enabled() to anon,authenticated;
create table recovery.trip_tombstones(trip_id uuid primary key, owner_id uuid not null);
create table recovery.work_queue(kind text primary key, state text not null check(state in ('queued','completed')));
insert into recovery.work_queue values('trip-deletion','queued');
create table public.trips(id uuid primary key, owner_id uuid not null, title text not null);
create table public.storekit_grants(transaction_id uuid primary key, owner_id uuid not null, state text not null check(state in ('active','revoked','erased')));
create table public.licence_permissions(id uuid primary key, owner_id uuid not null, state text not null check(state in ('active','revoked')));
create table public.object_metadata(id uuid primary key, owner_id uuid not null, storage_key text not null unique);
create function recovery.guard_trip_write() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from recovery.trip_tombstones where trip_id=new.id) then raise exception 'TRIP_TOMBSTONED'; end if;
  return new;
end $$;
revoke all on function recovery.guard_trip_write() from public;
create trigger trip_tombstone_fence before insert or update on public.trips for each row execute function recovery.guard_trip_write();
alter table public.trips enable row level security;
alter table public.storekit_grants enable row level security;
alter table public.licence_permissions enable row level security;
alter table public.object_metadata enable row level security;
create policy owner_trip_read on public.trips for select to authenticated using(owner_id=nullif(current_setting('app.actor_id',true),'')::uuid and recovery.reads_enabled());
create policy owner_grant_read on public.storekit_grants for select to authenticated using(owner_id=nullif(current_setting('app.actor_id',true),'')::uuid and state='active' and recovery.reads_enabled());
create policy owner_licence_read on public.licence_permissions for select to authenticated using(owner_id=nullif(current_setting('app.actor_id',true),'')::uuid and state='active' and recovery.reads_enabled());
create policy owner_object_read on public.object_metadata for select to authenticated using(owner_id=nullif(current_setting('app.actor_id',true),'')::uuid and recovery.reads_enabled());
grant select on public.trips,public.storekit_grants,public.licence_permissions,public.object_metadata to anon,authenticated;
revoke all on all tables in schema recovery from public,anon,authenticated;
`;
const seed = `
insert into public.trips values('${ids.deletedTrip}','${ids.owner}','synthetic deleted'),('${ids.keptTrip}','${ids.owner}','synthetic kept');
insert into public.storekit_grants values('${ids.transaction}','${ids.owner}','active');
insert into public.licence_permissions values('${ids.licence}','${ids.owner}','active');
insert into public.object_metadata values('${ids.deletedObject}','${ids.owner}','${fileFor(ids.deletedObject)}'),('${ids.keptObject}','${ids.owner}','${fileFor(ids.keptObject)}');
`;
function replaySql(journal) {
  assert.equal(journal.version, 1);
  assert.deepEqual(journal.events.map((event) => event.kind), ["trip-delete", "storekit-revoke", "licence-revoke", "object-delete"]);
  assert.deepEqual(journal.events.map((event) => event.id), [ids.deletedTrip, ids.transaction, ids.licence, ids.deletedObject]);
  return `begin;
insert into recovery.trip_tombstones values('${ids.deletedTrip}','${ids.owner}') on conflict do nothing;
delete from public.trips where id='${ids.deletedTrip}' and owner_id='${ids.owner}';
update public.storekit_grants set state='revoked' where transaction_id='${ids.transaction}' and owner_id='${ids.owner}';
update public.licence_permissions set state='revoked' where id='${ids.licence}' and owner_id='${ids.owner}';
delete from public.object_metadata where id='${ids.deletedObject}' and owner_id='${ids.owner}';
update recovery.work_queue set state='completed' where kind='trip-deletion';
commit;`;
}
function snapshot(container) {
  return sql(container, `select jsonb_build_object(
    'trips',(select jsonb_agg(to_jsonb(t) order by id) from public.trips t),
    'grants',(select jsonb_agg(to_jsonb(g) order by transaction_id) from public.storekit_grants g),
    'licences',(select jsonb_agg(to_jsonb(l) order by id) from public.licence_permissions l),
    'objects',(select jsonb_agg(to_jsonb(o) order by id) from public.object_metadata o),
    'tombstones',(select jsonb_agg(to_jsonb(d) order by trip_id) from recovery.trip_tombstones d),
    'queue',(select jsonb_agg(to_jsonb(q) order by kind) from recovery.work_queue q))::text;`);
}
function objectRead(container, actor, directory, id) {
  const key = actorSql(container, "authenticated", actor, `select storage_key from public.object_metadata where id='${id}';`);
  return key && existsSync(join(directory, key)) ? readFileSync(join(directory, key), "utf8") : null;
}
function verifyDenied(container, directory) {
  stage = "pre-replay deny probes";
  expectSql(container, "select recovery.reads_enabled();", "f");
  assert.equal(actorSql(container, "authenticated", ids.owner, "select count(*) from public.trips;"), "0");
  assert.equal(actorSql(container, "authenticated", ids.other, "select count(*) from public.trips;"), "0");
  assert.equal(actorSql(container, "anon", ids.owner, "select count(*) from public.trips;"), "0");
  assert.equal(objectRead(container, ids.owner, directory, ids.deletedObject), null);
}
function verifyReconciled(container, directory) {
  stage = "post-replay database and object controls";
  expectSql(container, `select count(*) from recovery.trip_tombstones where trip_id='${ids.deletedTrip}' and owner_id='${ids.owner}';`, 1);
  expectSql(container, `select count(*) from public.trips where id='${ids.deletedTrip}';`, 0);
  expectSql(container, `select state from public.storekit_grants where transaction_id='${ids.transaction}';`, "revoked");
  expectSql(container, `select state from public.licence_permissions where id='${ids.licence}';`, "revoked");
  expectSql(container, `select count(*) from public.object_metadata where id='${ids.deletedObject}';`, 0);
  expectSql(container, "select state from recovery.work_queue where kind='trip-deletion';", "completed");
  expectSql(container, `select count(*) from public.trips where id='${ids.keptTrip}';`, 1);
  expectSql(container, `select count(*) from public.object_metadata where id='${ids.keptObject}';`, 1);
  assert.equal(existsSync(join(directory, fileFor(ids.deletedObject))), false);
  assert.equal(hash(readFileSync(join(directory, fileFor(ids.keptObject)))), hash("synthetic kept object"));
  expectSql(container, `select count(*) from pg_class where oid in ('public.trips'::regclass,'public.storekit_grants'::regclass,'public.licence_permissions'::regclass,'public.object_metadata'::regclass) and relrowsecurity;`, 4);
  expectSql(container, "select has_table_privilege('authenticated','public.trips','SELECT') and not has_table_privilege('authenticated','recovery.gate','UPDATE');", "t");
  expectSql(container, "select count(*) from pg_trigger where tgrelid='public.trips'::regclass and tgname='trip_tombstone_fence' and not tgisinternal;", 1);
  expectSql(container, "select count(*) from pg_proc where oid='recovery.guard_trip_write()'::regprocedure and prosecdef;", 1);
}
function verifyAllowed(container, directory) {
  stage = "isolated actor read probes";
  assert.equal(actorSql(container, "authenticated", ids.owner, "select count(*) from public.trips;"), "1");
  assert.equal(actorSql(container, "authenticated", ids.owner, `select count(*) from public.trips where id='${ids.deletedTrip}';`), "0");
  assert.equal(actorSql(container, "authenticated", ids.other, "select count(*) from public.trips;"), "0");
  assert.equal(actorSql(container, "anon", ids.owner, "select count(*) from public.trips;"), "0");
  for (const table of ["storekit_grants", "licence_permissions"]) {
    assert.equal(actorSql(container, "authenticated", ids.owner, `select count(*) from public.${table};`), "0");
  }
  assert.equal(objectRead(container, ids.owner, directory, ids.deletedObject), null);
  assert.equal(objectRead(container, ids.other, directory, ids.keptObject), null);
  assert.equal(objectRead(container, ids.owner, directory, ids.keptObject), "synthetic kept object");
}

const started = performance.now();
try {
  stage = "local Docker context preflight";
  context = command("docker", ["context", "show"]);
  assert.match(context, /^[a-zA-Z0-9_.-]+$/);
  const contextInfo = JSON.parse(command("docker", ["context", "inspect", context]))[0];
  assert.match(contextInfo.Endpoints.docker.Host, /^unix:\/\//);
  docker(["image", "inspect", image, "--format", "{{.Id}}"]);
  const source = newCluster("source");
  stage = "create synthetic source";
  sql(source, schema + seed);
  writeFileSync(join(sourceObjects, fileFor(ids.deletedObject)), "synthetic deleted object", { mode: 0o600 });
  writeFileSync(join(sourceObjects, fileFor(ids.keptObject)), "synthetic kept object", { mode: 0o600 });
  verifyDenied(source, sourceObjects);
  stage = "create independent backup";
  const dump = docker(["exec", source, "pg_dump", "-h", "/tmp/vpj38-socket", "-U", "postgres", "--no-owner", "--dbname", "postgres"]);
  writeFileSync(join(backupDir, "database.sql"), dump, { mode: 0o600 });
  for (const id of [ids.deletedObject, ids.keptObject]) copyFileSync(join(sourceObjects, fileFor(id)), join(backupDir, fileFor(id)));
  const backupCutoff = new Date().toISOString();
  const journal = { version: 1, afterBackup: backupCutoff, events: [
    { kind: "trip-delete", id: ids.deletedTrip }, { kind: "storekit-revoke", id: ids.transaction },
    { kind: "licence-revoke", id: ids.licence }, { kind: "object-delete", id: ids.deletedObject },
  ] };
  const journalPath = join(journalDir, "events.json");
  writeFileSync(journalPath, JSON.stringify(journal), { mode: 0o600 });
  const journalSha = hash(readFileSync(journalPath));
  stage = "apply post-backup events to source";
  sql(source, replaySql(journal));
  rmSync(join(sourceObjects, fileFor(ids.deletedObject)));
  verifyReconciled(source, sourceObjects);
  const restored = newCluster("restored");
  const restoreStarted = performance.now();
  stage = "restore actual database dump and object backup";
  sql(restored, readFileSync(join(backupDir, "database.sql"), "utf8"));
  for (const id of [ids.deletedObject, ids.keptObject]) copyFileSync(join(backupDir, fileFor(id)), join(restoredObjects, fileFor(id)));
  assert.equal(sql(restored, `select count(*) from public.trips where id='${ids.deletedTrip}';`), "1", "backup must contain pre-deletion Trip");
  assert.equal(existsSync(join(restoredObjects, fileFor(ids.deletedObject))), true, "object backup must contain pre-deletion file");
  verifyDenied(restored, restoredObjects);
  stage = "replay independently retained journal";
  assert.equal(hash(readFileSync(journalPath)), journalSha, "journal changed during restore");
  const restoredJournal = JSON.parse(readFileSync(journalPath, "utf8"));
  sql(restored, replaySql(restoredJournal));
  rmSync(join(restoredObjects, fileFor(ids.deletedObject)));
  verifyReconciled(restored, restoredObjects);
  assert.equal(snapshot(restored), snapshot(source), "restored state differs from source after replay");
  verifyDenied(restored, restoredObjects);
  stage = "open isolated database read gate after actual checks";
  sql(restored, "update recovery.gate set read_enabled=true where singleton and read_enabled=false;");
  verifyAllowed(restored, restoredObjects);
  console.log(JSON.stringify({ result: "PASS_SYNTHETIC_RESTORE_ONLY", database: "two new network-none PostgreSQL containers", backup: "logical dump plus two object files", journal: "separate local copy, integrity checked", actorProbes: "owner/other/anon passed", syntheticRestoreAndProbeMs: Math.round(performance.now() - restoreStarted), syntheticTotalMs: Math.round(performance.now() - started), actualServiceRpoRto: "UNRUN" }));
} catch (error) {
  console.error(JSON.stringify({ result: "FAIL_SYNTHETIC_RESTORE", stage, reason: error.message }));
  process.exitCode = 1;
} finally {
  for (const container of containers.reverse()) {
    const inspection = spawnSync("docker", ["--context", context, "inspect", container, "--format", "{{index .Config.Labels \"vpj38.owner\"}}"], { encoding: "utf8" });
    if (inspection.status === 0 && inspection.stdout.trim() === runId) spawnSync("docker", ["--context", context, "rm", "-f", container], { stdio: "ignore" });
  }
  rmSync(scratch, { recursive: true, force: true });
}
