"""Own no-network PostgreSQL, synthetic fourteen-schema age dump/restore proof.
No remote DSN, target data, persistent key or backup path accepted.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import uuid
sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
spec = importlib.util.spec_from_file_location('plan', HERE / 'backup-candidate.py')
plan = importlib.util.module_from_spec(spec)
spec.loader.exec_module(plan)
executor_spec = importlib.util.spec_from_file_location('executor', HERE / 'controlled-backup.py')
executor = importlib.util.module_from_spec(executor_spec)
executor_spec.loader.exec_module(executor)
nonce = str(uuid.uuid4())
name = 'qaw-backup-' + nonce[:12]
context = None
owned = False
stages = []


def run(args, data=None, check=True):
    r = subprocess.run(args, input=data, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=60)
    if check and r.returncode:
        raise ValueError('COMMAND_FAILED')
    return r


def docker(args, **kwargs):
    return run(['docker', '--context', context] + args, **kwargs)


def sql(text, database='postgres'):
    return docker(['exec', '-i', name, 'psql', '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1',
                   '-h', '/tmp/qaw-socket', '-p', '5433' if database=='restored' else '5432', '-U', 'postgres', '-d', 'postgres'], data=text.encode()).stdout.decode().strip()


def pipe(producer_args, consumer_args, output=None):
    # Plain dump/decrypt bytes travel only between child pipes, never logs/disk.
    a = subprocess.Popen(producer_args, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    b = None
    try:
        b = subprocess.Popen(consumer_args, stdin=a.stdout, stdout=output if output is not None else subprocess.DEVNULL,
                             stderr=subprocess.DEVNULL)
        a.stdout.close()
        rb = b.wait(timeout=60)
        ra = a.wait(timeout=15)
        if ra or rb:
            raise ValueError('PIPE_FAILED')
    finally:
        for child in (a, b):
            if child and child.poll() is None:
                child.kill()
                child.wait()


def main():
    global context, owned
    if sys.argv[1:] != ['--synthetic-only'] or 'DOCKER_HOST' in os.environ or 'DOCKER_CONTEXT' in os.environ:
        raise ValueError('SYNTHETIC_LOCAL_ONLY')
    context = run(['docker', 'context', 'show']).stdout.decode().strip()
    c = json.loads(run(['docker', 'context', 'inspect', context]).stdout)[0]
    assert c['Endpoints']['docker']['Host'].startswith('unix://')
    assert 'FileVault is On.' in run(['fdesetup', 'status']).stdout.decode()
    image = 'public.ecr.aws/supabase/postgres:17.6.1.155'
    image_id = docker(['image', 'inspect', image, '--format', '{{.Id}}']).stdout.decode().strip()
    assert docker(['inspect', name], check=False).returncode != 0
    docker(['run', '--pull=never', '--rm', '-d', '--network', 'none', '--name', name,
            '--label', 'qaw.backup.owner=' + nonce, '--user', 'postgres', '--entrypoint', '/bin/sh', image,
            '-c', 'umask 077; mkdir /tmp/qaw-socket; initdb -D /tmp/qaw-db -A trust --no-locale -E UTF8 >/tmp/init.log 2>&1 && exec postgres -D /tmp/qaw-db -c listen_addresses= -c unix_socket_directories=/tmp/qaw-socket -c unix_socket_permissions=0700'])
    owned = True
    state = json.loads(docker(['inspect', name]).stdout)[0]
    assert state['HostConfig']['NetworkMode'] == 'none' and not state['Mounts'] and not state['HostConfig']['PortBindings']
    for _ in range(100):
        if docker(['exec', name, 'pg_isready', '-h', '/tmp/qaw-socket', '-U', 'postgres'], check=False).returncode == 0:
            break
        time.sleep(.1)
    sql('create role qaw_owner nologin;create role qaw_reader nologin;grant qaw_reader to qaw_owner with admin option;')
    docker(['exec', name, '/bin/sh', '-c', 'initdb -D /tmp/qaw-restore -A trust --no-locale -E UTF8 >/tmp/restore-init.log 2>&1 && pg_ctl -D /tmp/qaw-restore -l /tmp/restore-server.log -o "-c listen_addresses= -c port=5433 -c unix_socket_directories=/tmp/qaw-socket -c unix_socket_permissions=0700" -w start'])
    assert sql("select count(*) from pg_roles where rolname in ('qaw_owner','qaw_reader');", 'restored') == '0'
    for schema in plan.SCHEMAS:
        sql(f'create schema if not exists {schema}; create table {schema}.synthetic(id integer primary key, value text); insert into {schema}.synthetic values(1,\'synthetic-only\'); alter table {schema}.synthetic owner to qaw_owner; grant usage on schema {schema} to qaw_reader;grant select on {schema}.synthetic to qaw_reader;')
    stages.append('PASS synthetic14 schemas seeded with explicit owner/ACL')
    with tempfile.TemporaryDirectory(prefix='synthetic-proof-', dir=ROOT / 'artifacts/QAWEB/staging-replay') as tmp:
        directory = Path(tmp)
        assert directory.stat().st_mode & 0o077 == 0
        identity = directory / 'synthetic.agekey'
        archive = directory / 'synthetic.dump.age'
        run(['age-keygen', '-o', str(identity)])
        os.chmod(identity, 0o600)
        recipient = run(['age-keygen', '-y', str(identity)]).stdout.decode().strip()
        dump = ['docker', '--context', context, 'exec', name, 'pg_dump', '-Fc', '--strict-names',
                '-h', '/tmp/qaw-socket', '-U', 'postgres', '-d', 'postgres', *['--schema=' + s for s in plan.SCHEMAS]]
        executor.seal_pipeline(dump, os.environ.copy(), recipient, archive)
        assert archive.stat().st_mode & 0o077 == 0
        decrypt = ['age', '-d', '-i', str(identity), str(archive)]
        listing = executor.validate_ciphertext(identity, archive)
        stages.append('PASS executor full ciphertext integrity before TOC')
        for schema in plan.SCHEMAS:
            assert f'TABLE DATA {schema} synthetic qaw_owner' in listing
            assert f'ACL {schema} TABLE synthetic qaw_owner' in listing
        stages.append('PASS fourteen TOC data+owner+ACL entries')
        roles_archive = directory / 'synthetic.roles.age'
        roles_dump = ['docker','--context',context,'exec',name,'pg_dumpall','--roles-only','--no-role-passwords','-h','/tmp/qaw-socket','-U','postgres']
        executor.seal_pipeline(roles_dump, os.environ.copy(), recipient, roles_archive)
        executor.validate_ciphertext(identity, roles_archive, custom=False)
        roles_decrypt=['age','-d','-i',str(identity),str(roles_archive)]
        subprocess.run(roles_decrypt,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=True,timeout=60)
        # Synthetic global-role DDL only, in memory. Independent bootstrap already
        # owns postgres; remove exactly its one CREATE, never unknown SQL/errors.
        role_sql=run(roles_decrypt).stdout.decode()
        assert role_sql.count('CREATE ROLE postgres;') == 1 and 'PASSWORD' not in role_sql
        role_sql=role_sql.replace('CREATE ROLE postgres;','-- existing synthetic bootstrap postgres')
        sql(role_sql,'restored')
        assert sql("select count(*) from pg_roles where rolname in ('qaw_owner','qaw_reader');",'restored')=='2'
        assert sql("select admin_option from pg_auth_members where roleid='qaw_reader'::regrole and member='qaw_owner'::regrole;",'restored')=='t'
        stages.append('PASS encrypted global-role restore into independent empty cluster with membership/admin option')
        restore = ['docker', '--context', context, 'exec', '-i', name, 'pg_restore', '--exit-on-error', '--clean', '--if-exists',
                   '-h', '/tmp/qaw-socket', '-p', '5433', '-U', 'postgres', '-d', 'postgres']
        pipe(decrypt, restore)
        for schema in plan.SCHEMAS:
            assert sql(f"select count(*) from {schema}.synthetic where id=1 and value='synthetic-only';", 'restored') == '1'
            assert sql(f"select pg_get_userbyid(relowner)='qaw_owner' and has_table_privilege('qaw_reader',oid,'SELECT') from pg_class where oid='{schema}.synthetic'::regclass;", 'restored') == 't'
        stages.append('PASS restored synthetic rows and owner/ACL exact')
        corrupted = directory / 'corrupt.age'
        ciphertext = bytearray(archive.read_bytes()); ciphertext[-1] ^= 1
        with os.fdopen(os.open(corrupted, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'wb') as f:
            f.write(ciphertext)
        denied=False
        try: executor.validate_ciphertext(identity, corrupted)
        except ValueError as e: denied=str(e)=='FULL_CIPHERTEXT_INTEGRITY_FAILED'
        assert denied
        stages.append('PASS corrupted ciphertext rejected')
        manifest = {'ciphertextBytes': archive.stat().st_size, 'ciphertextSha256': hashlib.sha256(archive.read_bytes()).hexdigest()}
    stages.append('PASS temporary synthetic key and ciphertext removed')
    return {'status': 'PASS_SYNTHETIC_BACKUP_RESTORE_ONLY', 'imageId': image_id, 'stages': stages,
            'manifest': manifest, 'globalRoleRecovery': 'PASS_SYNTHETIC_INDEPENDENT_CLUSTER: explicit bootstrap postgres reconciliation only; target managed roles UNRUN',
            'targetBackup': 'UNRUN', 'targetRowsRead': False, 'persistentKeyCreated': False}


report = {'status': 'FAIL_SYNTHETIC', 'stages': stages}
try:
    report = main()
except Exception:
    report['reason'] = 'SYNTHETIC_PROOF_FAILED_NO_RAW_DIAGNOSTICS'
finally:
    if owned:
        label = docker(['inspect', name, '--format', '{{index .Config.Labels "qaw.backup.owner"}}'], check=False)
        if label.returncode == 0 and label.stdout.decode().strip() == nonce:
            result = docker(['rm', '-f', name], check=False)
            report['cleanup'] = 'PASS' if result.returncode == 0 else 'FAIL'
        else:
            report['cleanup'] = 'FAIL_OWNER_CHECK'
        if report['cleanup'] != 'PASS':
            report['status'] = 'FAIL_SYNTHETIC'
    print(json.dumps(report, indent=2))
    sys.exit(0 if report['status'].startswith('PASS_') else 1)
