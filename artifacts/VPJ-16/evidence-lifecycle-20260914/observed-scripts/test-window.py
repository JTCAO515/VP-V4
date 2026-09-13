import pathlib,subprocess,json,tempfile,shutil
root=pathlib.Path('/Users/jtcao/Library/Caches/visepanda/evidence-lifecycle-20260914')
name='supabase_db_vp-native-session-replay-20260910'
def docker(*args,**kw):return subprocess.run(['docker','--context','desktop-linux',*args],check=True,capture_output=True,text=True,**kw)
def sql(s):return docker('exec','-i',name,'psql','-U','postgres','-d','lifecycle_test_373','-XqAt','-v','ON_ERROR_STOP=1',input=s).stdout
source=(root/'window-state.mjs').read_text()
checks=[]
try:
 docker('exec','-i',name,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-c','create database lifecycle_test_373')
 seed="""create schema if not exists auth;create schema supabase_migrations;create schema turn_private;create schema knowledge_review_private;
create table auth.users(id int);insert into auth.users select generate_series(1,6);
create table public.trips(id int);insert into public.trips select generate_series(1,3);
create table supabase_migrations.schema_migrations(id int);insert into supabase_migrations.schema_migrations select generate_series(1,46);
create table public.model_budget_attempts(id int,status text);insert into public.model_budget_attempts select generate_series(1,315),'settled';
create table knowledge_review_private.settings(singleton boolean primary key,enabled boolean);insert into knowledge_review_private.settings values(true,false);
create table knowledge_review_private.publication_settings(singleton boolean primary key,enabled boolean);insert into knowledge_review_private.publication_settings values(true,false);
create table knowledge_review_private.members(actor_id uuid primary key,revision int,active boolean);insert into knowledge_review_private.members values('fe70fac7-d312-494c-bde1-4c37c3942722',1,false),('7d063756-e5d8-4a6b-94a3-5134b0b04443',1,false);
"""
 tables=['public.turns','public.chat_turn_events','turn_private.text_content','turn_private.service_tasks','turn_private.service_task_turns','turn_private.grounded_turns','turn_private.work','knowledge_review_private.candidates','knowledge_review_private.statements','knowledge_review_private.statement_sources','knowledge_review_private.source_revisions','knowledge_review_private.publications','knowledge_review_private.audit','knowledge_review_private.publication_audit','knowledge_review_private.receipts']
 seed+=''.join(f'create table {t}(id int);insert into {t} select generate_series(1,{12 if t.endswith(".statements") else 1});' for t in tables)
 sql(seed)
 for case in ['owned','lost_commit_receipt','foreign_takeover','retention_changed']:
  sql("update knowledge_review_private.members set active=false;update knowledge_review_private.settings set enabled=false;update knowledge_review_private.publication_settings set enabled=false;update public.trips set id=3 where id=99;")
  path=root/'window-tests-v3'/case;path.mkdir(parents=True,exist_ok=False)
  (path/'window-state.mjs').write_text(source.replace("'../specific-gaps-20260914/transport.mjs'","'./transport.mjs'"))
  (path/'transport.mjs').write_text("import {spawnSync} from 'node:child_process';export const env=process.env;export const dockerArgs=(binary,args)=>['--context','desktop-linux','exec','-i','"+name+"',binary,'-U','postgres','-d','lifecycle_test_373',...args];export function query(sql){const p=spawnSync('docker',dockerArgs('psql',['-XqAt','-v','ON_ERROR_STOP=1']),{input:sql,encoding:'utf8'});if(p.status!==0){console.error(p.stderr);throw Error('SQL failed');}return p.stdout.trim();}")
  def run(mode,expected=0):
   p=subprocess.run(['node',str(path/'window-state.mjs'),mode],capture_output=True,text=True)
   (path/(mode+'.log')).write_text(p.stdout+p.stderr)
   assert p.returncode==expected,(case,mode,p.stdout,p.stderr)
  run('prepare');run('activate')
  assert sql('select enabled from knowledge_review_private.settings').strip()=='t'
  if case=='lost_commit_receipt':(path/'activated.json').unlink()
  if case=='foreign_takeover':sql('update knowledge_review_private.members set active=active;update knowledge_review_private.settings set enabled=enabled;update knowledge_review_private.publication_settings set enabled=enabled;')
  if case=='retention_changed':sql('update public.trips set id=99 where id=3;')
  run('disable',1 if case in ['foreign_takeover','retention_changed'] else 0)
  enabled=sql('select enabled from knowledge_review_private.settings').strip()
  assert enabled==('t' if case=='foreign_takeover' else 'f'),(case,enabled)
  if case=='retention_changed':assert json.loads((path/'retention-failure.json').read_text())['windowClosed']
  if case=='owned':run('disable')
  checks.append({'case':case,'status':'PASS'})
 print(json.dumps({'environment':'isolated-local-postgres','checks':checks}))
 (root/'window-tests.json').write_text(json.dumps({'environment':'isolated-local-postgres','checks':checks},indent=2)+'\n')
finally:
 docker('exec','-i',name,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-c','drop database lifecycle_test_373 with (force)')
