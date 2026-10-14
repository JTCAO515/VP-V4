"""Explicit ICU supplement for an owned offline restored copy; no libc fallback."""
import json
import re
import shlex

FACTS_SQL="select jsonb_build_object('encoding',pg_encoding_to_char(encoding),'collate',datcollate,'ctype',datctype,'localeProvider',datlocprovider,'icuLocale',datlocale,'icuRules',daticurules,'collationVersion',datcollversion,'actualCollationVersion',pg_database_collation_actual_version(oid)) from pg_database where datname=current_database();"


def require(ok,reason):
    if not ok:raise ValueError(reason)


def validate(profile,facts):
    require(set(profile)=={'databaseFacts','icuLocale','icuRules','collationVersion','actualCollationVersion'},'ICU_PROFILE_EXACT_FIELDS_REQUIRED')
    require(profile['databaseFacts']==facts and set(facts)=={'encoding','collate','ctype','localeProvider'}
            and facts['encoding']=='UTF8' and facts['localeProvider']=='i','ICU_PROFILE_SCOPE_REQUIRED')
    require(all(isinstance(facts[k],str) and re.fullmatch('[a-zA-Z0-9_.@-]+',facts[k]) for k in ('collate','ctype')),'ICU_LIBC_CATEGORY_IDENTIFIER_REQUIRED')
    require(facts=={'encoding':'UTF8','collate':'en_US.UTF-8','ctype':'en_US.UTF-8','localeProvider':'i'}
            and profile['icuLocale']=='en-US','EXPLICIT_REVIEWED_ICU_LOCALE_REQUIRED')
    require(profile['icuRules'] is None,'UNKNOWN_ICU_RULES_REQUIRED')
    require(profile['collationVersion']=='153.121'
            and profile['collationVersion']==profile['actualCollationVersion'],'SOURCE_ICU_COLLATION_VERSION_DRIFT')
    return profile


def initdb_options(profile):
    facts=profile['databaseFacts'];validate(profile,facts)
    options=['--locale='+facts['collate'],'--lc-collate='+facts['collate'],'--lc-ctype='+facts['ctype'],
             '--locale-provider=icu','--icu-locale='+profile['icuLocale']]
    if profile['icuRules'] is not None:options.append('--icu-rules='+profile['icuRules'])
    return ' '.join(shlex.quote(x) for x in options)


def patch_owned_run(args,profile):
    args=list(args)
    if args[0]=='run':
        original=' --locale=C -E UTF8'
        require(args[-1].count(original)==1,'ICU_OWNED_INIT_COMMAND_CHANGED')
        args[-1]=args[-1].replace(original,' '+initdb_options(profile)+' -E UTF8')
    return args


def verify_owned(db,profile):
    actual=json.loads(db.sql(FACTS_SQL))
    facts={k:actual.pop(k) for k in ('encoding','collate','ctype','localeProvider')}
    require({'databaseFacts':facts,**actual}==profile,'OWNED_ICU_LOCALE_OR_VERSION_MISMATCH')
    return {'status':'PASS_EXACT_ICU_PROFILE_AND_VERSION','profile':profile,'libcFallback':False}
