"""Exact legacy ROW-IN deparse round-trip repair, only on owned offline clone.
Unknown checks remain rejected; no permission/function/source-pin widening.
"""
HEADER='-- Name: turn_feedback; Type: TABLE; Schema: public; Owner: postgres'
ORIGINAL="    CONSTRAINT turn_feedback_check CHECK ((((((feedback_kind = 'another_option'::text) AND (reason_code = 'different_preference'::text)) OR ((feedback_kind = 'inaccurate'::text) AND (reason_code = 'not_relevant'::text))) OR ((feedback_kind = 'reject_reason'::text) AND (reason_code = 'missing_evidence'::text))) OR ((feedback_kind = 'correction'::text) AND (reason_code = 'incorrect_detail'::text)))),"
RESTORED="    CONSTRAINT turn_feedback_check CHECK ((((feedback_kind = 'another_option'::text) AND (reason_code = 'different_preference'::text)) OR ((feedback_kind = 'inaccurate'::text) AND (reason_code = 'not_relevant'::text)) OR ((feedback_kind = 'reject_reason'::text) AND (reason_code = 'missing_evidence'::text)) OR ((feedback_kind = 'correction'::text) AND (reason_code = 'incorrect_detail'::text)))),"


def normalized(blocks):
    return [(key,body.replace(ORIGINAL,RESTORED) if key==HEADER else body) for key,body in blocks]


def definition(line):return line.strip().removeprefix('CONSTRAINT turn_feedback_check ').removesuffix(',')


def reinstate(db):
    if not db.created:raise ValueError('OWNED_COMPAT_COPY_REQUIRED')
    actual=db.sql("select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.turn_feedback'::regclass and conname='turn_feedback_check';")
    if actual not in (definition(ORIGINAL),definition(RESTORED)):raise ValueError('UNKNOWN_LEGACY_FEEDBACK_CHECK')
    if actual==definition(RESTORED):
        # Reparse the reviewed original ROW-IN form, which preserves its native
        # parse-tree deparse identity and all four value pairs. Validate rows.
        db.sql("begin;alter table public.turn_feedback drop constraint turn_feedback_check;alter table public.turn_feedback add constraint turn_feedback_check check ((feedback_kind,reason_code) in (('another_option','different_preference'),('inaccurate','not_relevant'),('reject_reason','missing_evidence'),('correction','incorrect_detail')));commit;")
    if db.sql("select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.turn_feedback'::regclass and conname='turn_feedback_check';")!=definition(ORIGINAL):raise ValueError('LEGACY_CHECK_IDENTITY_NOT_RESTORED')
    return {'status':'PASS_EXACT_LEGACY_ROW_IN_REPARSE','targetChanged':False,'acceptedCheckVariants':2}


def restore_archived_owner_maintain(db,metadata):
    repaired=[]
    for row in metadata['relations']:
        if row['kind'] not in ('r','p','v','m'):continue
        relation='"'+row['schema'].replace('"','""')+'"."'+row['name'].replace('"','""')+'"'
        actual=db.sql("select coalesce(relacl::text,'NULL') from pg_class where oid='"+relation.replace("'","''")+"'::regclass;")
        expected=row['acl'] if row['acl'] is not None else 'NULL'
        if actual==expected:continue
        known='postgres=arwdDxtm/postgres'
        equivalent_default=actual=='NULL' and expected=='{postgres=arwdDxtm/postgres}'
        if row['owner']!='postgres' or known not in expected or (not equivalent_default and actual!=expected.replace(known,'postgres=arwdDxt/postgres')):
            raise ValueError('UNKNOWN_ARCHIVED_TABLE_ACL_DRIFT')
        # Rebuild the original explicit owner ACL (NULL is the same default),
        # or its specifically missing MAINTAIN bit, solely on this local clone.
        # No new grantee/permission is added beyond source, and no target call.
        db.sql('begin;set local role postgres;grant maintain on table '+relation+' to postgres;commit;')
        if db.sql("select relacl::text from pg_class where oid='"+relation.replace("'","''")+"'::regclass;")!=expected:
            raise ValueError('ARCHIVED_OWNER_MAINTAIN_NOT_RESTORED')
        repaired.append(row['schema']+'.'+row['name'])
    return {'status':'PASS_EXACT_ARCHIVED_TABLE_ACL','ownerMaintainRebuilt':repaired,'targetPermissionChanged':False}


def verify_restore_default_acl(db,metadata):
    actual=db.sql("select coalesce(jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(defaclrole),'schema',coalesce(n.nspname,'GLOBAL'),'type',defaclobjtype,'acl',defaclacl::text) order by defaclrole,defaclnamespace,defaclobjtype),'[]') from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace;")
    import json
    actual=json.loads(actual);expected=metadata['default_acl'] or []
    key=lambda r:(r['owner'],r['schema'],r['type'])
    am={key(r):r for r in actual};em={key(r):r for r in expected}
    if set(am)!=set(em):raise ValueError('UNKNOWN_ARCHIVED_DEFAULT_ACL_SET_DRIFT')
    rebuilt=[]
    for k,want in em.items():
        have=am[k]
        if have==want:continue
        old='postgres=arwdDxtm/postgres'
        if want['owner']!='postgres' or want['type']!='r' or old not in want['acl'] or have['acl']!=want['acl'].replace(old,'postgres=arwdDxt/postgres'):
            raise ValueError('UNKNOWN_ARCHIVED_DEFAULT_ACL_DRIFT')
        scope='' if want['schema']=='GLOBAL' else ' in schema "'+want['schema'].replace('"','""')+'"'
        db.sql('begin;set local role postgres;alter default privileges for role postgres'+scope+' grant maintain on tables to postgres;commit;')
        rebuilt.append(k)
    if rebuilt:
        # One bounded repair attempt; a server that leaves the ACL unchanged
        # must fail rather than recursively retrying until stack exhaustion.
        reread=json.loads(db.sql("select coalesce(jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(defaclrole),'schema',coalesce(n.nspname,'GLOBAL'),'type',defaclobjtype,'acl',defaclacl::text) order by defaclrole,defaclnamespace,defaclobjtype),'[]') from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace;"))
        if {key(r):r for r in reread}!=em:raise ValueError('ARCHIVED_DEFAULT_ACL_NOT_RESTORED')
    return {'status':'PASS_EXACT_ARCHIVED_DEFAULT_ACL','entries':len(expected),'targetPermissionChanged':False}
