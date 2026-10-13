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
                   '-h', '/tmp/qaw-socket', '-U', 'postgres', '-d', database], data=text.encode()).stdout.decode().strip()


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
    sql('create role qaw_owner nologin;create role qaw_reader nologin;create database restored;')
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
        with os.fdopen(os.open(archive, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'wb') as sealed:
            pipe(dump, ['age', '-r', recipient], sealed)
        assert archive.stat().st_mode & 0o077 == 0
        decrypt = ['age', '-d', '-i', str(identity), str(archive)]
        subprocess.run(decrypt, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True, timeout=60)
        stages.append('PASS full ciphertext integrity before TOC')
        # pg_restore -l output is synthetic metadata only; decrypted dump remains a pipe.
        a = subprocess.Popen(decrypt, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        try:
            toc = subprocess.run([plan.PG_ROOT + '/pg_restore', '-l'], stdin=a.stdout, capture_output=True, timeout=60)
            a.stdout.close()
            assert toc.returncode == 0 and a.wait(timeout=10) in (0, -13)
        finally:
            if a.poll() is None:
                a.kill(); a.wait()
        listing = toc.stdout.decode()
        for schema in plan.SCHEMAS:
            assert f'TABLE DATA {schema} synthetic qaw_owner' in listing
            assert f'ACL {schema} TABLE synthetic qaw_owner' in listing
        stages.append('PASS fourteen TOC data+owner+ACL entries')
        restore = ['docker', '--context', context, 'exec', '-i', name, 'pg_restore', '--exit-on-error', '--clean', '--if-exists',
                   '-h', '/tmp/qaw-socket', '-U', 'postgres', '-d', 'restored']
        pipe(decrypt, restore)
        for schema in plan.SCHEMAS:
            assert sql(f"select count(*) from {schema}.synthetic where id=1 and value='synthetic-only';", 'restored') == '1'
            assert sql(f"select pg_get_userbyid(relowner)='qaw_owner' and has_table_privilege('qaw_reader',oid,'SELECT') from pg_class where oid='{schema}.synthetic'::regclass;", 'restored') == 't'
        stages.append('PASS restored synthetic rows and owner/ACL exact')
        corrupted = directory / 'corrupt.age'
        ciphertext = bytearray(archive.read_bytes()); ciphertext[-1] ^= 1
        with os.fdopen(os.open(corrupted, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'wb') as f:
            f.write(ciphertext)
        bad = subprocess.run(['age', '-d', '-i', str(identity), str(corrupted)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=60)
        assert bad.returncode != 0
        stages.append('PASS corrupted ciphertext rejected')
        manifest = {'ciphertextBytes': archive.stat().st_size, 'ciphertextSha256': hashlib.sha256(archive.read_bytes()).hexdigest()}
    stages.append('PASS temporary synthetic key and ciphertext removed')
    return {'status': 'PASS_SYNTHETIC_BACKUP_RESTORE_ONLY', 'imageId': image_id, 'stages': stages,
            'manifest': manifest, 'globalRoleRecovery': 'UNRUN: own synthetic roles precreated in same cluster',
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
