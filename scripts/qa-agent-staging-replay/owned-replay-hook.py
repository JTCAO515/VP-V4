"""Pinned75→155 replay ONLY in an already verified owned offline restored clone."""
import hashlib
import copy
import json
from pathlib import Path
import re
import subprocess
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
MAIN_REPO='/Users/jtsm5p/Documents/Codex/VP-V10-worktrees/qaw005-main-20261013'
SOURCE_HEAD='7d0c5128857e859720452d8a9f864fd8b20c8388'
MANIFEST_HASH='230500975ecbd08df8eb1663b073ae96a11c79f3f2806d611fc5ce2d0a2e2a2f'
QA_HASH='73b6fa9ee63ad48bdff43da4a1f88ddf19e28e46786948e30314a111bb25285d'
MODE='owned-restored-75-to155/1'
CANDIDATE_MODE='owned-restored-75-to162-candidate/1'
CANDIDATE_SOURCE_HEAD='4abeeb41e87f2ac36f0efdb9ba94780ce0049a13'
CANDIDATE_MANIFEST_HASH='c61012425c7468d7ec67258462d70991c88a71e497f82baf73ab446fa13a4688'
GATES=('profile_data_private.schema_v1','turn_data_private.hooks_valid_v1','export_private.profile_hooks_valid_v1','turn_data_private.schema_supported_v1','turn_data_private.runtime_supported_v1','turn_data_private.write_hooks_valid_v1','result_data_private.schema_supported_v1','turn_private.directions_schema_members_v1','conversation_data_private.schema_supported_v1','result_data_private.infrastructure_supported_v1')


def require(ok,reason):
    if not ok:raise ValueError(reason)


def git_read(path,head=SOURCE_HEAD):
    r=subprocess.run(['git','-C',MAIN_REPO,'show',head+':'+path],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=10)
    require(r.returncode==0,'REPLAY_PINNED_SOURCE_UNAVAILABLE');return r.stdout


def load_plan(path=ROOT/'artifacts/QAWEB/staging-replay/reviewed-replay-manifest.json'):
    raw=Path(path).read_bytes();digest=hashlib.sha256(raw).hexdigest()
    require(digest in (MANIFEST_HASH,CANDIDATE_MANIFEST_HASH),'REPLAY_MANIFEST_DRIFT')
    m=json.loads(raw)
    if digest==MANIFEST_HASH:
        require(m.get('schemaVersion')=='qa-shared-migration-manifest/2','REPLAY_MANIFEST_SCOPE')
        expected,baseline,missing=m['expected155'],m['baseline75'],m['reviewedMissing80']
        head=SOURCE_HEAD;mode=MODE;counts=(155,75,80)
    else:
        require(m.get('schemaVersion')=='qaw-owned-replay-candidate/1' and m.get('sourceHead')==CANDIDATE_SOURCE_HEAD
                and m.get('targetApplyAuthority')=='NONE' and m.get('newWindowApproved') is False
                and m.get('targetOnlyVersions')==[] and (m.get('expectedCount'),m.get('baselineCount'),m.get('missingCount'))==(162,75,87),'REPLAY_CANDIDATE_SCOPE')
        expected,baseline,missing=m['expectedVersions'],m['baselineVersions'],m['reviewedMissing']
        head=CANDIDATE_SOURCE_HEAD;mode=CANDIDATE_MODE;counts=(162,75,87)
    require(m.get('projectId')=='dzqdzetcctkhbrhlxxgn','REPLAY_MANIFEST_SCOPE')
    require((len(expected),len(baseline),len(missing))==counts,'REPLAY_EXACT_COUNTS')
    require(expected==sorted(set(expected)) and baseline==sorted(set(baseline)),'REPLAY_VERSION_ORDER')
    require(missing==[v for v in expected if v not in set(baseline)] and set(baseline)<=set(expected),'REPLAY_MISSING_SET_DRIFT')
    require(m['sourceSha256'].get('20261013050429_qa_agent_web.sql')==QA_HASH,'REPLAY_QA_SOURCE_DRIFT')
    sources=[]
    for filename,digest_file in sorted(m['sourceSha256'].items()):
        require(re.fullmatch(r'[0-9]{14}_[a-z0-9_]+\.sql',filename),'REPLAY_SOURCE_FILENAME')
        raw=git_read('supabase/migrations/'+filename,head)
        require(hashlib.sha256(raw).hexdigest()==digest_file,'REPLAY_SOURCE_HASH_DRIFT')
        sources.append({'version':filename[:14],'file':filename,'sql':raw.decode(),'sha256':digest_file})
    require([item['version'] for item in sources]==expected,'REPLAY_EXTRA_OR_UNKNOWN_SOURCE')
    return {**m,'expectedVersions':expected,'baselineVersions':baseline,'reviewedMissing':missing,
            'sourceHead':head,'manifestSha256':digest,'mode':mode},sources


def top_statements(sql):
    # Locate transaction boundaries without treating quoted/dollar function
    # bodies or comments as top-level SQL. Unknown boundary layouts fail closed.
    output=[];i=0;start=0;words=[];block=0;quote=None;dollar=None
    while i<len(sql):
        if dollar:
            if sql.startswith(dollar,i):i+=len(dollar);dollar=None
            else:i+=1
            continue
        if quote:
            if sql[i]=='\\':i+=2;continue
            if sql[i]==quote:
                if i+1<len(sql) and sql[i+1]==quote:i+=2;continue
                quote=None
            i+=1;continue
        if block:
            if sql.startswith('/*',i):block+=1;i+=2
            elif sql.startswith('*/',i):block-=1;i+=2
            else:i+=1
            continue
        if sql.startswith('--',i):
            end=sql.find('\n',i);i=len(sql) if end<0 else end+1;continue
        if sql.startswith('/*',i):block=1;i+=2;continue
        if sql[i] in "'\"":quote=sql[i];i+=1;continue
        match=re.match(r'\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$',sql[i:])
        if match:dollar=match[0];i+=len(dollar);continue
        if sql[i]==';':output.append((start,i+1,' '.join(words).upper()));start=i+1;words=[];i+=1;continue
        match=re.match('[A-Za-z_][A-Za-z_0-9]*',sql[i:])
        if match:words.append(match[0]);i+=len(match[0]);continue
        i+=1
    require(not quote and not dollar and not block,'REPLAY_SQL_LEXICAL_BOUNDARY')
    return output


def migration_transaction(item):
    sql=item['sql'];stmts=top_statements(sql)
    boundaries=[(n,s) for n,s in enumerate(stmts) if s[2] in ('BEGIN','BEGIN TRANSACTION','COMMIT','COMMIT WORK','ROLLBACK','ROLLBACK WORK')]
    registration="\ninsert into supabase_migrations.schema_migrations(version,name) values('"+item['version']+"','"+item['file'][15:-4]+"');\n"
    if not boundaries:return 'begin;set local role postgres;\n'+sql+registration+'commit;'
    require(len(boundaries)==2 and boundaries[0][0]==0 and boundaries[0][1][2] in ('BEGIN','BEGIN TRANSACTION') and boundaries[1][0]==len(stmts)-1 and boundaries[1][1][2] in ('COMMIT','COMMIT WORK'),'REPLAY_TRANSACTION_LAYOUT_UNSUPPORTED')
    pos=boundaries[1][1][0];begin_end=boundaries[0][1][1]
    return sql[:begin_end]+'\nset local role postgres;\n'+sql[begin_end:pos]+registration+sql[pos:]


def versions(db):
    return json.loads(db.sql("select coalesce(jsonb_agg(version order by version),'[]'::jsonb) from supabase_migrations.schema_migrations;"))


def retained_data(db):
    rows=json.loads(db.sql("select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'columns',(select jsonb_agg(a.attname order by a.attnum) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped)) order by n.nspname,c.relname),'[]') from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p') and n.nspname in ('public','auth','storage','private','identity_private','knowledge_review_private','turn_private','community_private','ops_budget_private','place_quota_private','privacy_private','research_intake_private','service_cases_private');"))
    return rows


def fingerprints(db,rows):
    q=lambda x:'"'+x.replace('"','""')+'"'
    result={}
    for row in rows:
        projection=','.join(q(c) for c in row['columns'])
        sql="select jsonb_build_object('count',coalesce(sum(n),0),'sha256',encode(sha256(convert_to(coalesce(string_agg(digest||':'||n::text,E'\\n' order by digest),''),'UTF8')),'hex'),'digests',coalesce(jsonb_object_agg(digest,n),'{}')) from (select digest,count(*) n from (select encode(sha256(convert_to(to_jsonb(p)::text,'UTF8')),'hex') digest from (select "+projection+' from '+q(row['schema'])+'.'+q(row['table'])+") p) raw group by digest) h;"
        result[row['schema']+'.'+row['table']]=json.loads(db.sql(sql))
    return result


def source_guard_diagnostics(db,item):
    if item['version']=='20261010010000':
        return {'profileWeb':json.loads(db.sql("select jsonb_build_object('bodyMd5',md5(p.prosrc),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'config',p.proconfig,'kind',p.prokind,'definer',p.prosecdef) from pg_proc p where oid='profile_data_private.web_save_v1(text,text,text,text,text,text,time,bigint)'::regprocedure;"))}
    if item['version']=='20261010030000':
        match=re.search(r"jsonb_each\('((?:[^']|'')*)'::jsonb\)",item['sql'])
        require(match is not None,'REPLAY_GUARD_SPEC_UNAVAILABLE')
        spec=json.loads(match[1].replace("''","'"));diffs=[]
        for signature,expected in spec.items():
            actual=json.loads(db.sql("select jsonb_build_object('owner',pg_get_userbyid(p.proowner),'kind',p.prokind,'config',p.proconfig,'prosrc',p.prosrc,'acl',p.proacl::text,'volatility',p.provolatile,'securityDefiner',p.prosecdef,'result',pg_get_function_result(p.oid),'strict',p.proisstrict,'identity',pg_get_function_identity_arguments(p.oid),'language',(select lanname from pg_language where oid=p.prolang),'parallel',p.proparallel,'arguments',pg_get_function_arguments(p.oid),'definition',pg_get_functiondef(p.oid)) from pg_proc p where oid=to_regprocedure('"+signature+"');"))
            if actual!=expected:
                diffs.append({'signature':signature,'changedFields':[k for k in expected if actual.get(k)!=expected[k]],'expectedBodyMd5':hashlib.md5(expected['prosrc'].encode()).hexdigest(),'actualBodyMd5':hashlib.md5(actual['prosrc'].encode()).hexdigest(),'expectedOwner':expected['owner'],'actualOwner':actual['owner'],'expectedAcl':expected['acl'],'actualAcl':actual['acl']})
        matches=list(re.finditer(r"jsonb_each\('((?:[^']|'')*)'::jsonb\)",item['sql']))
        tables=json.loads(matches[1][1].replace("''","'"));table_diffs=[]
        for relation,expected in tables.items():
            actual=json.loads(db.sql("select jsonb_build_object('owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'acl',c.relacl::text,'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum) from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),'constraints',(select coalesce(jsonb_agg(jsonb_build_object('name',k.conname,'definition',pg_get_constraintdef(k.oid),'validated',k.convalidated) order by k.conname),'[]') from pg_constraint k where k.conrelid=c.oid),'triggers',(select coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,'definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled,'function',t.tgfoid::regprocedure::text) order by t.tgname),'[]') from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal)) from pg_class c where c.oid=to_regclass('"+relation+"');"))
            if actual!=expected:table_diffs.append({'relation':relation,'changedFields':[k for k in expected if actual.get(k)!=expected[k]],'expectedSha256':hashlib.sha256(json.dumps(expected,sort_keys=True).encode()).hexdigest(),'actualSha256':hashlib.sha256(json.dumps(actual,sort_keys=True).encode()).hexdigest()})
        return {'directionsFunctionGuardDifferences':diffs,'directionsTableGuardDifferences':table_diffs}
    return None


RUNTIME_PORTS=(('qa_ready_groups_v3','public.qa_ready_groups_v3(integer,text,text,text,uuid,uuid,uuid,text)'),
               ('qa_authorize_dispatch_v2','public.qa_authorize_dispatch_v2(uuid,uuid,uuid,uuid,text,text,uuid,text)'))
RUNTIME_PORT_EXPECTED={'exists':True,'ownerIsPostgres':True,'securityDefiner':True,'emptySearchPath':True,
                       'serviceExecute':True,'anonExecute':False,'authenticatedExecute':False,'publicExecute':False}


def candidate_runtime_ports(db,observed,journal=None):
    for name,signature in RUNTIME_PORTS:
        # Catalog/ACL reads only. Never invoke the discovered dispatch ports.
        sql="select pg_catalog.jsonb_build_object('exists',p.oid is not null,'ownerIsPostgres',coalesce(pg_catalog.pg_get_userbyid(p.proowner)='postgres',false),'securityDefiner',coalesce(p.prosecdef,false),'emptySearchPath',coalesce(p.proconfig=array['search_path=\"\"']::text[],false),'serviceExecute',coalesce(pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE'),false),'anonExecute',coalesce(pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE'),false),'authenticatedExecute',coalesce(pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE'),false),'publicExecute',case when p.oid is null then false else exists(select 1 from pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE') end) from (select pg_catalog.to_regprocedure('"+signature+"') oid) r left join pg_catalog.pg_proc p on p.oid=r.oid;"
        value=json.loads(db.sql(sql))
        # Return booleans only, never role names/config values or user rows.
        require(set(value)==set(RUNTIME_PORT_EXPECTED) and all(type(v) is bool for v in value.values()),'REPLAY_RUNTIME_PORT_METADATA_SHAPE')
        observed[name]=value
        if journal is not None:journal['runtimePortMetadata']=copy.deepcopy(observed)
        require(value==RUNTIME_PORT_EXPECTED,'REPLAY_RUNTIME_PORT_METADATA_FAILED')
    return observed


def replay_owned(db,manifest_path):
    info=json.loads(db.docker(['inspect',db.name]))[0]
    require(db.created and info['Config']['Labels'].get('qaw.restore.owner')==db.nonce and info['HostConfig']['NetworkMode']=='none' and not info['Mounts'] and not info['HostConfig']['PortBindings'],'REPLAY_OWNED_OFFLINE_ONLY')
    m,sources=load_plan(manifest_path)
    journal=getattr(db,'_window_replay_progress',None)
    if journal is not None:journal.update(stage='REPLAY_PREFLIGHT',sourceHead=m.get('sourceHead'),manifestSha256=m.get('manifestSha256'),qaMigrationSha256=QA_HASH,sourceGuardDiagnostics={},appliedVersions=[],inflightVersion=None,inflightOutcome='NONE',rollbackInferred=False,automaticRetryAllowed=False)
    require(versions(db)==m['baselineVersions'],'REPLAY_BASELINE_UNKNOWN_NEWER_OR_EXTRA')
    if journal is not None:journal['baselineLedgerValidated']=True
    require(db.sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','turn_private') and p.proname like 'qa_%';")=='0','REPLAY_QA_ALREADY_PRESENT')
    if journal is not None:journal['qaInitiallyAbsent']=True
    rows=retained_data(db)
    if journal is not None:journal['retainedRelations']=len(rows)
    before=fingerprints(db,rows)
    history=db.sql("select encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by version)::text,'[]'),'UTF8')),'hex') from supabase_migrations.schema_migrations t;")
    if journal is not None:journal['baselineHistoryBeforeSha256']=history
    applied=[];failed=None;diagnostics={};retention_diffs=[]
    runtime_ports={} if m.get('mode')==CANDIDATE_MODE else None
    try:
        for item in sources:
            if item['version'] in m['reviewedMissing']:
                failed=item['version']
                if journal is not None:journal.update(stage='SOURCE_GUARD_DIAGNOSTICS',currentVersion=item['version'])
                diagnostic=source_guard_diagnostics(db,item)
                if diagnostic is not None:
                    diagnostics[item['version']]=diagnostic
                    if journal is not None:journal['sourceGuardDiagnostics']=copy.deepcopy(diagnostics)
                if journal is not None:journal.update(stage='MIGRATION_EXECUTION',inflightVersion=item['version'],inflightOutcome='UNKNOWN')
                db.sql(migration_transaction(item));applied.append(item['version'])
                if journal is not None:journal.update(appliedVersions=list(applied),inflightVersion=None,inflightOutcome='NONE')
        if journal is not None:journal['stage']='REPLAY_VERIFICATION'
        require(versions(db)==m['expectedVersions'],'REPLAY_LEDGER_NOT_EXACT_PINNED_SOURCE')
        if journal is not None:journal['finalLedgerValidated']=True
        after_data=fingerprints(db,rows)
        retention_diffs=[{'relation':key,'beforeCount':before[key]['count'],'afterCount':after_data.get(key,{}).get('count'),'beforeSha256':before[key]['sha256'],'afterSha256':after_data.get(key,{}).get('sha256')} for key in before if any(after_data.get(key,{}).get('digests',{}).get(digest,0)<count for digest,count in before[key]['digests'].items())]
        if journal is not None:journal['retentionDifferences']=copy.deepcopy(retention_diffs)
        require(not retention_diffs,'REPLAY_EXISTING_DATA_CHANGED')
        if journal is not None:journal['retainedOriginalColumnRows']='PASS_ORIGINAL_ROW_MULTISET_PRESERVED_APPROVED_SOURCE_ADDITIONS_ALLOWED'
        historical=db.sql("select encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by version)::text,'[]'),'UTF8')),'hex') from supabase_migrations.schema_migrations t where version=any(array["+','.join("'"+v+"'" for v in m['baselineVersions'])+"]);")
        if journal is not None:journal['baselineHistoryAfterSha256']=historical
        require(historical==history,'REPLAY_APPLIED_HISTORY_CHANGED')
        if journal is not None:journal['baselineHistoryPreserved']=True
        gates={name:True for name in GATES}
        measured=json.loads(db.sql('select jsonb_build_object('+','.join("'"+name+"',"+name+'()' for name in gates)+');'))
        if journal is not None:journal['lifecycleGates']=copy.deepcopy(measured)
        require(measured==gates,'REPLAY_LIFECYCLE_GATE_FAILED')
        acl=json.loads(db.sql("select jsonb_build_object('exists',to_regprocedure('public.qa_ready_groups_v2(integer,text,text,text)') is not null,'service',has_function_privilege('service_role','public.qa_ready_groups_v2(integer,text,text,text)','EXECUTE'),'anon',has_function_privilege('anon','public.qa_ready_groups_v2(integer,text,text,text)','EXECUTE'),'authenticated',has_function_privilege('authenticated','public.qa_ready_groups_v2(integer,text,text,text)','EXECUTE'),'public',(select exists(select 1 from aclexplode(coalesce(proacl,acldefault('f',proowner))) where grantee=0 and privilege_type='EXECUTE') from pg_proc where oid='public.qa_ready_groups_v2(integer,text,text,text)'::regprocedure));"))
        if journal is not None:journal['qaV2Acl']=copy.deepcopy(acl)
        require(acl=={'exists':True,'service':True,'anon':False,'authenticated':False,'public':False},'REPLAY_QA_V2_ACL_FAILED')
        require(db.sql("select to_regprocedure('public.qa_submit_message_v1(uuid,uuid,uuid,uuid,text,text,uuid,text)') is not null and to_regprocedure('public.qa_read_session_v1(uuid)') is not null;")=='t','REPLAY_REQUIRED_INTERFACE_MISSING')
        if journal is not None:journal['requiredInterfacesValidated']=True
        require(db.sql('select enabled from turn_private.hosted_worker_control;')=='f','REPLAY_HOSTED_SWITCH_CHANGED')
        if journal is not None:journal.update(hostedSwitchDisabled=True,stage='CANDIDATE_RUNTIME_PORT_METADATA' if runtime_ports is not None else 'REPLAY_COMPLETE')
        if runtime_ports is not None:
            if journal is not None:journal['stage']='CANDIDATE_RUNTIME_PORT_METADATA'
            candidate_runtime_ports(db,runtime_ports,journal)
            if journal is not None:journal['stage']='REPLAY_COMPLETE'
        outcome={'status':'PASS_OWNED_RESTORED_REPLAY_ONLY','sourceHead':m['sourceHead'],'manifestSha256':m['manifestSha256'],'qaMigrationSha256':QA_HASH,
                'appliedMissingVersions':applied,'lifecycleGates':measured,'qaV2Acl':acl,'retainedRelations':len(rows),'retainedOriginalColumnRows':'PASS_ORIGINAL_ROW_MULTISET_PRESERVED_APPROVED_SOURCE_ADDITIONS_ALLOWED',
                'baselineHistoryBeforeSha256':history,'sourceGuardDiagnostics':diagnostics,'targetWritten':False,'providerCalled':False,'liveRestoreAuthority':'NONE'}
        if runtime_ports is not None:outcome['runtimePortMetadata']=runtime_ports
        return outcome
    except Exception as e:
        # No raw PG errors or row contents. Only local copy ever mutated.
        try:db.sql('rollback;')
        except Exception:pass
        outcome={'status':'FAIL_OWNED_RESTORED_REPLAY','failedVersion':failed,'appliedBeforeFailure':applied,
                'sourceGuardDiagnostics':diagnostics,'retentionDifferences':retention_diffs,'reason':str(e) if isinstance(e,ValueError) and re.fullmatch('[A-Z_0-9]+',str(e)) else 'REPLAY_FAILED_DETAILS_SUPPRESSED',
                'targetWritten':False,'liveRestoreAuthority':'NONE'}
        if runtime_ports is not None:outcome['runtimePortMetadata']=runtime_ports
        return outcome
