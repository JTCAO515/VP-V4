"""Allowlisted PG restore diagnostics only; never return stderr, SQL or names."""
import re
import subprocess

KINDS=('EVENT TRIGGER','DEFAULT ACL','FK CONSTRAINT','ROW SECURITY','CONSTRAINT','INDEX','TRIGGER','RULE','POLICY','ACL','COMMENT','FUNCTION','TABLE','SCHEMA','EXTENSION')
OPERATIONS=('ALTER DEFAULT PRIVILEGES','CREATE EVENT TRIGGER','ALTER TABLE','CREATE INDEX','CREATE POLICY','CREATE TRIGGER','GRANT','REVOKE')


def diagnostic(raw,consumer):
    text=(raw or b'').decode('utf-8',errors='replace')
    state=re.search(r'\bERROR:\s+([0-9A-Z]{5}):',text,re.M)
    toc=re.findall(r'^pg_restore: from TOC entry ([0-9]{1,10}); [0-9]+ [0-9]+ (.*)$',text,re.M)
    location=toc[-1] if toc else None
    kind=next((k for k in KINDS if location and (location[1]==k or location[1].startswith(k+' '))),None)
    if kind is None:
        progress=re.findall(r'^pg_restore: creating (.*)$',text,re.M)
        kind=next((k for k in KINDS if progress and progress[-1].startswith(k+' ')),None)
    denied=next((k.upper() for k in ('function','schema','table','sequence','database') if re.search(r'permission denied for '+k+r'\b',text)),None)
    command=re.search(r'^Command was:\s*(.*)$',text,re.M)
    operation=next((op for op in OPERATIONS if command and (command[1]==op or command[1].startswith(op+' '))),None)
    phase=next((a.split('=',1)[1] for a in consumer if a in ('--section=pre-data','--section=data','--section=post-data')),None)
    category=next((label for token,label in [('already exists','RESTORE_OBJECT_EXISTS'),('does not exist','RESTORE_OBJECT_MISSING'),('permission denied','RESTORE_PERMISSION_DENIED'),('unrecognized configuration parameter','RESTORE_PARAMETER_UNSUPPORTED'),('unsupported version','RESTORE_ARCHIVE_VERSION_UNSUPPORTED')] if token in text),None)
    return {'category':category or ('RESTORE_SQLSTATE_'+state[1] if state else 'LOCAL_RESTORE_CONSUMER_FAILED'),
            'sqlstate':state[1] if state else None,'tocEntryId':int(location[0]) if location else None,
            'objectClass':kind,'permissionObjectClass':denied,'operation':operation,'phase':phase}


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
