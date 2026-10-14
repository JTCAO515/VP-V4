"""Allowlisted PG restore diagnostics only; never return stderr, SQL or names."""
import re
import subprocess

KINDS=('EVENT TRIGGER','DEFAULT ACL','FK CONSTRAINT','ROW SECURITY','CONSTRAINT','INDEX','TRIGGER','RULE','POLICY','ACL','COMMENT','FUNCTION','TABLE','SCHEMA','EXTENSION')


PUBLIC_SQLSTATES={'42501','42P07','42710','42P01','42883','42703','42704','22023','0A000'}
ERROR_HEADER='pg_restore: error: could not execute query: ERROR:'
CLIENT_ARCHIVE_VERSION=object()


def error_frame(text):
    # --exit-on-error emits one query failure. Only the first client error
    # envelope is eligible. Never scan its SQL/DETAIL/CONTEXT continuations for
    # another header/state; unsupported client errors also terminate parsing.
    prelude=[]
    lines=text.splitlines()
    for n,line in enumerate(lines):
        if line.startswith('pg_restore: creating ') and (line.count(chr(34))!=2 or not line.endswith(chr(34))):
            # Multiline or ambiguous quoted object names can forge client-like
            # lines. No diagnostic header in such a frame is trusted.
            return None,[],[]
        if line.startswith(('Command was:','DETAIL:','HINT:','CONTEXT:','STATEMENT:','ERROR:')):
            return None,prelude,[]
        if line.startswith('pg_restore: error:'):
            if re.fullmatch(r'pg_restore: error: unsupported version \([0-9]{1,3}\.[0-9]{1,3}\) in file header',line):
                return CLIENT_ARCHIVE_VERSION,prelude,[]
            if not line.startswith(ERROR_HEADER):return None,prelude,[]
            return line[len(ERROR_HEADER):].lstrip(' \t'),prelude,lines[n+1:]
        prelude.append(line)
    return None,prelude,[]


def diagnostic(raw,consumer):
    text=(raw or b'').decode('utf-8',errors='replace')
    message,prelude,tail=error_frame(text)
    client_version=message is CLIENT_ARCHIVE_VERSION
    if client_version:message=None
    state=None
    if message is not None:
        # A state is only the initial field of this actual error envelope.
        # Unknown five-character tokens are neither echoed nor rescanned.
        field=re.match(r'^([0-9A-Z]{5}):[ \t]*',message)
        if field:
            if field[1] in PUBLIC_SQLSTATES:
                state=field[1];message=message[field.end():]
            else:message=''
    # Location requires the client's fixed processing frame immediately before
    # the fatal header. Bare/progress/multiline-name TOC lookalikes are unknown.
    location=None
    if (message is not None and len(prelude)>=2 and prelude[-2]=='pg_restore: while PROCESSING TOC:'
            and sum(line.startswith('pg_restore: from TOC entry ') for line in prelude)==1):
        location=re.fullmatch(r'pg_restore: from TOC entry ([0-9]{1,10}); [0-9]+ [0-9]+ (.*)',prelude[-1])
    kind=next((k for k in KINDS if location and (location[2]==k or location[2].startswith(k+' '))),None)
    denied=re.match(r'^permission denied for (function|schema|table|sequence|database)(?:[ \t]|$)',message or '')
    # Command was is raw SQL and can also occur inside multiline user values.
    # There is no independent trustworthy operation field in this stderr API.
    operation=None
    phase=next((a.split('=',1)[1] for a in consumer if a in ('--section=pre-data','--section=data','--section=post-data')),None)
    category=None
    # Match canonical message templates, never keywords inside quoted names,
    # progress, statement text, context or values.
    if client_version:category='RESTORE_ARCHIVE_VERSION_UNSUPPORTED'
    elif (message or '').startswith('permission denied '):category='RESTORE_PERMISSION_DENIED'
    elif (message or '').startswith('unrecognized configuration parameter '):category='RESTORE_PARAMETER_UNSUPPORTED'
    elif re.fullmatch(r'(?:relation|schema|type|function|operator|constraint|index) .+ already exists',message or ''):category='RESTORE_OBJECT_EXISTS'
    elif re.fullmatch(r'(?:relation|schema|type|function|operator|constraint|column|role) .+ does not exist',message or ''):category='RESTORE_OBJECT_MISSING'
    if state=='42501':category='RESTORE_PERMISSION_DENIED'
    elif state in ('42P07','42710'):category='RESTORE_OBJECT_EXISTS'
    elif state in ('42P01','42883','42703'):category='RESTORE_OBJECT_MISSING'
    return {'category':category or ('RESTORE_SQLSTATE_'+state if state else 'LOCAL_RESTORE_CONSUMER_FAILED'),
            'sqlstate':state,'tocEntryId':int(location[1]) if location else None,
            'objectClass':kind,'permissionObjectClass':denied[1].upper() if denied else None,'operation':operation,'phase':phase}


def pipeline(producer,consumer,collect,records):
    # Same fail/timeout/producer validation and process cleanup as strict base;
    # the private adapter only adds bounded enums/TOC position on a failure.
    a=b=None
    try:
        consumer=list(consumer)
        if 'pg_restore' in consumer and '--verbose' not in consumer:consumer.append('--verbose')
        a=subprocess.Popen(producer,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
        b=subprocess.Popen(consumer,stdin=a.stdout,stdout=subprocess.PIPE if collect else subprocess.DEVNULL,stderr=subprocess.PIPE)
        a.stdout.close()
        output,raw=b.communicate(timeout=600)
        if b.returncode:
            safe=diagnostic(raw,consumer);records.append(safe)
            raise ValueError(safe['category'])
        if a.wait(timeout=15) not in (0,-13):raise ValueError('LOCAL_DECRYPT_PRODUCER_FAILED')
        return output
    finally:
        for p in (b,a):
            if p and p.poll() is None:p.kill();p.wait()
