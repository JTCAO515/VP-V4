"""Allowlisted PG restore diagnostics only; never return stderr, SQL or names."""
import re
import subprocess

KINDS=('EVENT TRIGGER','DEFAULT ACL','FK CONSTRAINT','ROW SECURITY','CONSTRAINT','INDEX','TRIGGER','RULE','POLICY','ACL','COMMENT','FUNCTION','TABLE','SCHEMA','EXTENSION')


ERROR_HEADER='pg_restore: error: could not execute query: ERROR:'
CLIENT_ARCHIVE_VERSION=object()


def error_frame(text):
    # Validate the WHOLE client frame before trusting any individual header.
    # Raw TOC names, owner fields, SQL and DETAIL can contain client-like lines.
    # Multiple/embedded frames and unexplained metadata continuations therefore
    # invalidate all attribution, including an otherwise plausible first fatal.
    lines=text.splitlines()
    if any('pg_restore:' in line and (not line.startswith('pg_restore:') or line.count('pg_restore:')!=1) for line in lines):
        return None,[],[]
    fatals=[n for n,line in enumerate(lines) if line.startswith('pg_restore: error:')]
    processing=[n for n,line in enumerate(lines) if line=='pg_restore: while PROCESSING TOC:']
    tocs=[n for n,line in enumerate(lines) if line.startswith('pg_restore: from TOC entry ')]
    if len(fatals)!=1 or len(processing)>1 or len(tocs)>1:return None,[],[]
    n=fatals[0];prelude=lines[:n];tail=lines[n+1:];line=lines[n]
    if any(k>=n for k in processing+tocs):return None,[],[]
    if bool(processing)!=bool(tocs):return None,[],[]
    if processing:
        if processing[0]!=n-2 or tocs[0]!=n-1:return None,[],[]
        toc=re.fullmatch(r'pg_restore: from TOC entry [0-9]{1,10}; [0-9]+ [0-9]+ (.*)',lines[tocs[0]])
        kind=next((k for k in KINDS if toc and toc[1].startswith(k+' ')),None)
        if kind is None:return None,[],[]
        fields=toc[1][len(kind)+1:]
        # Conservative single-line namespace/object/owner representation.
        # Quoted, control-bearing or otherwise ambiguous names are UNKNOWN.
        if len(fields.split())<3 or not re.fullmatch(r'[A-Za-z0-9_.$(),\[\] -]+',fields):return None,[],[]
    for before in prelude:
        if before in ('pg_restore: connecting to database for restore','pg_restore: while PROCESSING TOC:'):continue
        if before.startswith('pg_restore: from TOC entry '):continue
        if before.startswith('pg_restore: creating ') and before.count(chr(34))==2 and before.endswith(chr(34)):continue
        if before.strip():return None,[],[]
    # Unlabelled text directly following a header can be an owner/name
    # continuation of a forged header. Only labelled diagnostic/SQL tails can
    # begin a continuation; client-looking content anywhere already invalidates.
    protected=False
    for after in tail:
        if after.startswith(('Command was:','DETAIL:','HINT:','CONTEXT:','STATEMENT:','LOCATION:','QUERY:')):protected=True
        if after.strip() and not protected:return None,[],[]
    if re.fullmatch(r'pg_restore: error: unsupported version \([0-9]{1,3}\.[0-9]{1,3}\) in file header',line):
        return CLIENT_ARCHIVE_VERSION,prelude,[]
    if not line.startswith(ERROR_HEADER):return None,[],[]
    return line[len(ERROR_HEADER):].lstrip(' \t'),prelude,tail


def diagnostic(raw,consumer):
    text=(raw or b'').decode('utf-8',errors='replace')
    message,prelude,tail=error_frame(text)
    client_version=message is CLIENT_ARCHIVE_VERSION
    if client_version:message=None
    # stderr's apparent code prefix may be part of a RAISE MESSAGE (P0001),
    # not libpq's typed PG_DIAG_SQLSTATE. Never parse or strip such a prefix.
    # This stderr-only API always returns null for SQLSTATE.
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
    return {'category':category or 'LOCAL_RESTORE_CONSUMER_FAILED',
            'sqlstate':None,'tocEntryId':int(location[1]) if location else None,
            'objectClass':kind,'permissionObjectClass':denied[1].upper() if denied else None,'operation':operation,'phase':phase,
            'provenance':'STDERR_ONLY_UNSTRUCTURED_HINTS_NOT_PG_ERROR_FACTS'}


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
